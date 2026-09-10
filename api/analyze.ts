import Anthropic from '@anthropic-ai/sdk';
import { FIELD_DEFINITIONS, FIELD_KEYS } from './fields.js';
import type { ExtractedSection, AnalysisReport } from '../src/types.js';

const MAX_QUOTE_WORDS = 18;

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY fehlt in Vercel.');
  if (!model) throw new Error('ANTHROPIC_MODEL fehlt in Vercel.');
  return { anthropic: new Anthropic({ apiKey }), model };
}

function extractText(content: Anthropic.Messages.Message['content']): string {
  return content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('KI-Antwort enthielt kein lesbares JSON.');
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

function sectionPrompt(sections: ExtractedSection[]): string {
  return sections
    .map((s, i) => `### ABSCHNITT ${i + 1}\nDATEI: ${s.file}\nSTELLE: ${s.locator}\n${s.text}`)
    .join('\n\n');
}

export async function analyzeChunk(sections: ExtractedSection[]) {
  const { anthropic, model } = client();
  const fields = FIELD_DEFINITIONS.map(([key, label]) => `${key}: ${label}`).join('\n');

  const message = await anthropic.messages.create({
    model,
    max_tokens: 6000,
    temperature: 0,
    system: `Du analysierst Vergabeunterlagen ausschließlich aus Sicht eines potenziellen Auftragnehmers.\n\nDeine Aufgabe ist NICHT, eine GO/NO-GO-Entscheidung zu treffen. Extrahiere nur belastbare Fakten, Pflichten, Fristen, Bedingungen und Risiken.\n\nErlaubte Feldschlüssel:\n${fields}\n\nRegeln:\n- Nutze ausschließlich Informationen aus den bereitgestellten Abschnitten.\n- Erfinde nichts und ergänze kein Branchenwissen als Fakt.\n- Jede Feststellung MUSS eine Quelle mit exakt dem gelieferten Dateinamen und der gelieferten Stelle enthalten.\n- quote ist nur ein sehr kurzer Beleg (maximal ${MAX_QUOTE_WORDS} Wörter), kein langer Auszug.\n- Wenn zwei Stellen sich widersprechen, liefere beide als findings und kennzeichne den Widerspruch zusätzlich unter contradictions.\n- In dieser Teilanalyse niemals \"nicht gefunden\" behaupten; andere Dokumentteile könnten die Information enthalten.\n- Behalte Zahlen, Einheiten, Normbezeichnungen, Fristen und Prozentwerte möglichst exakt bei.\n\nAntworte ausschließlich als JSON in diesem Format:\n{\n  \"titleCandidates\": [\"...\"],\n  \"findings\": [\n    {\n      \"key\": \"products\",\n      \"value\": \"...\",\n      \"evidence\": [{\"file\": \"...\", \"locator\": \"...\", \"quote\": \"...\"}]\n    }\n  ],\n  \"warnings\": [\"...\"]\n}`,
    messages: [{ role: 'user', content: sectionPrompt(sections) }],
  });

  return parseJson<{ titleCandidates?: string[]; findings?: unknown[]; warnings?: string[] }>(extractText(message.content));
}

export async function finalizeAnalysis(partials: unknown[]): Promise<AnalysisReport> {
  const { anthropic, model } = client();

  const message = await anthropic.messages.create({
    model,
    max_tokens: 9000,
    temperature: 0,
    system: `Du führst Teilergebnisse einer vollständigen Vergabeunterlagen-Analyse zusammen.\n\nEs gibt KEINE GO/NO-GO-Bewertung. Ziel ist eine präzise Faktenübersicht für einen potenziellen Auftragnehmer.\n\nDu MUSST für jeden dieser Feldschlüssel genau einen Eintrag zurückgeben:\n${FIELD_DEFINITIONS.map(([key, label]) => `${key}: ${label}`).join('\n')}\n\nStatusregeln:\n- gefunden: belastbare Information liegt vor.\n- unklar: Hinweise liegen vor, sind aber widersprüchlich/unvollständig.\n- nicht_gefunden: in KEINEM Teilergebnis wurde dazu eine belastbare Information gefunden.\n\nWeitere Regeln:\n- Konsolidiere Dubletten.\n- Erhalte konkrete Zahlen, Einheiten, Fristen, Normen und Prozentwerte.\n- Keine erfundenen Informationen.\n- Belege nur aus den Teilergebnissen übernehmen.\n- Jede gefundene/unklare Information soll mindestens einen Beleg haben, sofern ein Beleg in den Teilergebnissen vorhanden ist.\n- Widersprüche ausdrücklich nennen.\n\nAntworte ausschließlich als JSON:\n{\n  \"title\": \"... oder null\",\n  \"fields\": [\n    {\"key\": \"scope\", \"label\": \"Was soll geliefert werden?\", \"status\": \"gefunden|unklar|nicht_gefunden\", \"value\": \"...\", \"evidence\": [{\"file\": \"...\", \"locator\": \"...\", \"quote\": \"...\"}]}\n  ],\n  \"warnings\": [\"...\"]\n}`,
    messages: [{ role: 'user', content: JSON.stringify(partials) }],
  });

  const report = parseJson<AnalysisReport>(extractText(message.content));
  const byKey = new Map(report.fields?.map((f) => [f.key, f]) ?? []);
  report.fields = FIELD_DEFINITIONS.map(([key, label]) => {
    const found = byKey.get(key);
    return found ?? { key, label, status: 'nicht_gefunden', value: 'In den bereitgestellten Unterlagen nicht gefunden.', evidence: [] };
  });
  report.title = report.title ?? null;
  report.warnings = Array.isArray(report.warnings) ? report.warnings : [];
  return report;
}

export function validateChunkKeys(partial: any) {
  if (!Array.isArray(partial?.findings)) return partial;
  partial.findings = partial.findings.filter((f: any) => FIELD_KEYS.includes(f?.key));
  return partial;
}
