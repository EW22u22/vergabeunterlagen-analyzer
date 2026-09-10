import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeChunk, finalizeAnalysis, validateChunkKeys } from '../server/analyzer.js';
import type { ExtractedSection } from '../src/types.js';

const MAX_CHUNK_CHARS = 65000;
const MAX_FINAL_PAYLOAD_CHARS = 450000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Nur POST erlaubt.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (body?.mode === 'chunk') {
      const sections = (body.sections ?? []) as ExtractedSection[];
      const chars = sections.reduce((sum, section) => sum + (section.text?.length ?? 0), 0);

      if (!sections.length) {
        return res.status(400).json({ error: 'Keine Abschnitte übergeben.' });
      }

      if (chars > MAX_CHUNK_CHARS) {
        return res.status(413).json({ error: 'Analyse-Chunk ist zu groß.' });
      }

      const result = validateChunkKeys(await analyzeChunk(sections));
      return res.status(200).json(result);
    }

    if (body?.mode === 'finalize') {
      const partials = body.partials ?? [];
      const size = JSON.stringify(partials).length;

      if (!Array.isArray(partials) || !partials.length) {
        return res.status(400).json({ error: 'Keine Teilergebnisse übergeben.' });
      }

      if (size > MAX_FINAL_PAYLOAD_CHARS) {
        return res.status(413).json({ error: 'Zu viele Teilergebnisse für die Zusammenführung.' });
      }

      return res.status(200).json(await finalizeAnalysis(partials));
    }

    return res.status(400).json({ error: 'Unbekannter Analysemodus.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
