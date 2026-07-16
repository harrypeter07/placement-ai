import { getStudentPreferences } from "@/lib/db-supabase";
import { supabase } from "@/lib/supabase";

/** Trimmed Gemini API key, fetching exclusively from DB settings. */
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

  if (process.env.GEMINI_API_KEY) {
    const val = process.env.GEMINI_API_KEY.trim();
    if (val) return val;
  }
  return null;
}

export async function isGeminiConfigured(userId?: string): Promise<boolean> {
  const key = await getGeminiApiKey(userId);
  return !!key;
}

export const GEMINI_MISSING_HINT =
  "Configure Gemini API Key in dashboard Settings.";
