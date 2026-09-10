import JSZip from 'jszip';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ExtractedSection, ParsedUpload } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const SUPPORTED = ['.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.md', '.zip'];
const MIN_PDF_PAGE_TEXT = 25;

function extension(name: string) {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

async function pdfSections(name: string, bytes: Uint8Array, warnings: string[]): Promise<ExtractedSection[]> {
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const sections: ExtractedSection[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length < MIN_PDF_PAGE_TEXT) warnings.push(`${name}, Seite ${pageNo}: kaum auslesbarer Text – möglicherweise Scan/OCR erforderlich.`);
    if (text) sections.push({ file: name, locator: `Seite ${pageNo}`, text });
  }
  return sections;
}

async function docxSections(name: string, buffer: ArrayBuffer): Promise<ExtractedSection[]> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const paragraphs = result.value.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const sections: ExtractedSection[] = [];
  let bucket: string[] = [];
  let start = 1;
  let chars = 0;
  paragraphs.forEach((p, idx) => {
    bucket.push(p);
    chars += p.length;
    if (chars >= 5000) {
      sections.push({ file: name, locator: `Absätze ${start}–${idx + 1}`, text: bucket.join('\n') });
      bucket = [];
      chars = 0;
      start = idx + 2;
    }
  });
  if (bucket.length) sections.push({ file: name, locator: `Absätze ${start}–${paragraphs.length}`, text: bucket.join('\n') });
  return sections;
}

function spreadsheetSections(name: string, buffer: ArrayBuffer): ExtractedSection[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sections: ExtractedSection[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
    for (let start = 0; start < rows.length; start += 80) {
      const slice = rows.slice(start, start + 80);
      const text = slice
        .map((row, i) => `Zeile ${start + i + 1}: ${row.map((v: unknown) => String(v)).join(' | ')}`)
        .join('\n')
        .trim();
      if (text) sections.push({ file: name, locator: `Blatt „${sheetName}“, Zeilen ${start + 1}–${Math.min(start + 80, rows.length)}`, text });
    }
  }
  return sections;
}

function textSections(name: string, text: string): ExtractedSection[] {
  const clean = text.replace(/\r/g, '').trim();
  const sections: ExtractedSection[] = [];
  for (let start = 0, part = 1; start < clean.length; start += 6000, part += 1) {
    sections.push({ file: name, locator: `Abschnitt ${part}`, text: clean.slice(start, start + 6000) });
  }
  return sections;
}

async function parseBytes(name: string, bytes: Uint8Array, warnings: string[]): Promise<ExtractedSection[]> {
  const ext = extension(name);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  if (ext === '.pdf') return pdfSections(name, bytes, warnings);
  if (ext === '.docx') return docxSections(name, buffer);
  if (ext === '.xlsx' || ext === '.xls') return spreadsheetSections(name, buffer);
  if (ext === '.csv' || ext === '.txt' || ext === '.md') return textSections(name, new TextDecoder().decode(bytes));

  if (ext === '.zip') {
    const zip = await JSZip.loadAsync(bytes);
    const result: ExtractedSection[] = [];
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const innerExt = extension(entry.name);
      if (!SUPPORTED.includes(innerExt) || innerExt === '.zip') {
        warnings.push(`${name} → ${entry.name}: Dateityp wird in V1 nicht ausgewertet.`);
        continue;
      }
      const inner = await entry.async('uint8array');
      result.push(...(await parseBytes(`${name} → ${entry.name}`, inner, warnings)));
    }
    return result;
  }

  warnings.push(`${name}: Dateityp wird in V1 nicht ausgewertet.`);
  return [];
}

export async function extractFiles(files: File[]): Promise<ParsedUpload> {
  const warnings: string[] = [];
  const sections: ExtractedSection[] = [];

  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      sections.push(...(await parseBytes(file.name, bytes, warnings)));
    } catch (error) {
      warnings.push(`${file.name}: konnte nicht gelesen werden (${error instanceof Error ? error.message : String(error)}).`);
    }
  }

  return { sections, warnings };
}

export function splitForAnalysis(sections: ExtractedSection[], maxChars = 52000): ExtractedSection[][] {
  const chunks: ExtractedSection[][] = [];
  let current: ExtractedSection[] = [];
  let chars = 0;

  for (const section of sections) {
    if (section.text.length > maxChars) {
      if (current.length) {
        chunks.push(current);
        current = [];
        chars = 0;
      }
      for (let start = 0, part = 1; start < section.text.length; start += maxChars, part += 1) {
        chunks.push([{ ...section, locator: `${section.locator}, Teil ${part}`, text: section.text.slice(start, start + maxChars) }]);
      }
      continue;
    }
    if (current.length && chars + section.text.length > maxChars) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(section);
    chars += section.text.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
