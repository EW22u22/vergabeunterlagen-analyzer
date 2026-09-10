import { FIELD_DEFINITIONS, FIELD_KEYS } from './fields.js';
import type { ExtractedSection, AnalysisReport } from '../src/types.js';

const MAX_QUOTE_WORDS = 18;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function config() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

  if (!apiKey) throw new Error('GEMINI_API_KEY fehlt in Vercel.');
  return { apiKey, model };
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

async function readError(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message || raw;
  } catch {
    return raw;
  }
}

async function callGemini(systemInstruction: string, userPrompt: string, maxOutputTokens: number): Promise<string> {
  const { apiKey, model } = config();
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        promptFeedback?: { blockReason?: string };
      };

      const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('\n')
        .trim();

      if (!text) {
        const reason = data.promptFeedback?.blockReason;
        throw new Error(reason ? `Gemini hat die Anfrage blockiert: ${reason}` : 'Gemini hat keine Textantwort geliefert.');
      }
      return text;
    }

    const message = await readError(response);
    if ((response.status === 429 || response.status === 503) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 900 * 2 ** attempt));
      continue;
    }

    throw new Error(`Gemini API Fehler ${response.status}: ${message}`);
  }

  throw new Error('Gemini API konnte nach mehreren Versuchen nicht erreicht werden.');
}

export async function analyzeChunk(sections: ExtractedSection[]) {
  const fields = FIELD_DEFINITIONS.map(([key, label]) => `${key}: ${label}`).join('\n');

  const systemInstruction = `Du analysierst Vergabeunterlagen ausschließlich aus Sicht eines potenziellen Auftragnehmers.\n\nDeine Aufgabe ist NICHT, eine Angebotsentscheidung zu treffen. Extrahiere nur belastbare Fakten, Pflichten, Fristen, Bedingungen und Risiken.\n\nErlaubte Feldschlüssel:\n${fields}\n\nRegeln:\n- Nutze ausschließlich Informationen aus den bereitgestellten Abschnitten.\n- Erfinde nichts und ergänze kein Branchenwissen als Fakt.\n- Jede Feststellung MUSS eine Quelle mit exakt dem gelieferten Dateinamen und der gelieferten Stelle enthalten.\n- quote ist nur ein sehr kurzer Beleg (maximal ${MAX_QUOTE_WORDS} Wörter), kein langer Auszug.\n- Wenn zwei Stellen sich widersprechen, liefere beide als findings und kennzeichne den Widerspruch zusätzlich unter contradictions.\n- In dieser Teilanalyse niemals "nicht gefunden" behaupten; andere Dokumentteile könnten die Information enthalten.\n- Behalte Zahlen, Einheiten, Normbezeichnungen, Fristen und Prozentwerte möglichst exakt bei.\n\nAntworte ausschließlich als JSON in diesem Format:\n{\n  "titleCandidates": ["..."],\n  "findings": [\n    {\n      "key": "products",\n      "value": "...",\n      "evidence": [{"file": "...", "locator": "...", "quote": "..."}]\n    }\n  ],\n  "warnings": ["..."]\n}`;

  const raw = await callGemini(systemInstruction, sectionPrompt(sections), 8192);
  return parseJson<{ titleCandidates?: string[]; findings?: unknown[]; warnings?: string[] }>(raw);
}

export async function finalizeAnalysis(partials: unknown[]): Promise<AnalysisReport> {
  const systemInstruction = `Du führst Teilergebnisse einer vollständigen Vergabeunterlagen-Analyse zusammen.\n\nZiel ist eine präzise Faktenübersicht für einen potenziellen Auftragnehmer. Es gibt keine Angebotsentscheidung.\n\nDu MUSST für jeden dieser Feldschlüssel genau einen Eintrag zurückgeben:\n${FIELD_DEFINITIONS.map(([key, label]) => `${key}: ${label}`).join('\n')}\n\nStatusregeln:\n- gefunden: belastbare Information liegt vor.\n- unklar: Hinweise liegen vor, sind aber widersprüchlich/unvollständig.\n- nicht_gefunden: in KEINEM Teilergebnis wurde dazu eine belastbare Information gefunden.\n\nWeitere Regeln:\n- Konsolidiere Dubletten.\n- Erhalte konkrete Zahlen, Einheiten, Fristen, Normen und Prozentwerte.\n- Keine erfundenen Informationen.\n- Belege nur aus den Teilergebnissen übernehmen.\n- Jede gefundene/unklare Information soll mindestens einen Beleg haben, sofern ein Beleg in den Teilergebnissen vorhanden ist.\n- Widersprüche ausdrücklich nennen.\n\nAntworte ausschließlich als JSON:\n{\n  "title": "... oder null",\n  "fields": [\n    {"key": "scope", "label": "Was soll geliefert werden?", "status": "gefunden|unklar|nicht_gefunden", "value": "...", "evidence": [{"file": "...", "locator": "...", "quote": "..."}]}\n  ],\n  "warnings": ["..."]\n}`;

  const raw = await callGemini(systemInstruction, JSON.stringify(partials), 12288);
  const report = parseJson<AnalysisReport>(raw);
  const byKey = new Map(report.fields?.map((f) => [f.key, f]) ?? []);

  report.fields = FIELD_DEFINITIONS.map(([key, label]) => {
    const found = byKey.get(key);
    return found ?? {
      key,
      label,
      status: 'nicht_gefunden',
      value: 'In den bereitgestellten Unterlagen nicht gefunden.',
      evidence: [],
    };
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
