import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_MODEL = 'gemini-2.5-flash';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    provider: 'Google Gemini',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
  });
}
