import { getStudentPreferences } from "@/lib/db-supabase";
import { supabase } from "@/lib/supabase";

/** Trimmed Gemini API key, fetching first from DB settings, falling back to Vercel env. */
export async function getGeminiApiKey(userId?: string): Promise<string | null> {
  try {
    if (userId) {
      const prefs = await getStudentPreferences(userId);
      if (prefs?.gemini_api_key) {
        const val = prefs.gemini_api_key.trim();
        if (val) return val;
      }
    }

    // Try finding any user preferences with a configured key in Supabase
    const { data } = await supabase
      .from("student_preferences")
      .select("gemini_api_key")
      .not("gemini_api_key", "eq", "")
      .limit(1)
      .maybeSingle();

    if (data?.gemini_api_key) {
      const val = data.gemini_api_key.trim();
      if (val) return val;
    }
  } catch (err) {
    console.error("[gemini-env] Failed to query Supabase for API key:", err);
  }

  const raw = process.env.GEMINI_API_KEY;
  if (!raw) return null;
  const key = raw.trim();
  if (key.length < 10 || key === "your_key" || key === "xxx") return null;
  return key;
}

export async function isGeminiConfigured(userId?: string): Promise<boolean> {
  const key = await getGeminiApiKey(userId);
  return !!key;
}

export const GEMINI_MISSING_HINT =
  "Configure Gemini API Key in dashboard Settings or set GEMINI_API_KEY env variable.";
