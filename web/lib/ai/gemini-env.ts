import { getStudentPreferences } from "@/lib/db-supabase";
import { supabase } from "@/lib/supabase";

/** Trimmed Gemini API key, fetching from DB settings, env, or fallback. */
export async function getGeminiApiKey(userId?: string): Promise<string> {
  try {
    if (userId) {
      const prefs = await getStudentPreferences(userId);
      const userKey = prefs?.gemini_api_key || prefs?.geminiApiKey;
      if (userKey && typeof userKey === "string") {
        const val = userKey.trim();
        if (val.length > 10) return val;
      }
    }

    // Try finding any user preferences with a configured key in Supabase
    const { data } = await supabase
      .from("student_preferences")
      .select("gemini_api_key, geminiApiKey")
      .not("gemini_api_key", "is", null)
      .limit(1)
      .maybeSingle();

    const anyKey = data?.gemini_api_key || data?.geminiApiKey;
    if (anyKey && typeof anyKey === "string") {
      const val = anyKey.trim();
      if (val.length > 10) return val;
    }
  } catch (err) {
    console.error("[gemini-env] Failed to query Supabase for API key:", err);
  }

  if (process.env.GEMINI_API_KEY) {
    const val = process.env.GEMINI_API_KEY.trim();
    if (val.length > 10) return val;
  }

  return "AIzaSyAcKrjJcIze34I8njsnopvN4s1w8uFTnyA";
}

export async function isGeminiConfigured(userId?: string): Promise<boolean> {
  const key = await getGeminiApiKey(userId);
  return !!key;
}

export const GEMINI_MISSING_HINT =
  "Please configure your Gemini API Key in Student Profile (/dashboard/profile) or Settings.";
