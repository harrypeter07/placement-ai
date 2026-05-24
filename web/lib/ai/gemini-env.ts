/** Trimmed Gemini API key from env (Vercel: set GEMINI_API_KEY for Production + Preview). */
export function getGeminiApiKey(): string | null {
  const raw = process.env.GEMINI_API_KEY;
  if (!raw) return null;
  const key = raw.trim();
  if (key.length < 10 || key === "your_key" || key === "xxx") return null;
  return key;
}

export function isGeminiConfigured(): boolean {
  return !!getGeminiApiKey();
}

export const GEMINI_MISSING_HINT =
  "Add GEMINI_API_KEY in Vercel → Project → Settings → Environment Variables (enable Production), then redeploy.";
