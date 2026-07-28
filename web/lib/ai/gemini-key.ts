import { supabase } from "@/lib/supabase";

/**
 * Gets the effective Gemini API key for AI features.
 * 1. Checks user's personal saved key in student_preferences DB.
 * 2. Falls back to environment variable GEMINI_API_KEY.
 * 3. Falls back to default seeded key.
 */
export async function getEffectiveGeminiApiKey(userId?: string): Promise<string> {
  if (userId) {
    try {
      const { data } = await supabase
        .from("student_preferences")
        .select("gemini_api_key, geminiApiKey")
        .eq("user_id", userId)
        .maybeSingle();

      const userKey = data?.gemini_api_key || data?.geminiApiKey;
      if (userKey && typeof userKey === "string" && userKey.trim().length > 10) {
        return userKey.trim();
      }
    } catch (err) {
      console.warn("[GeminiKey] Error fetching user key from DB:", err);
    }
  }

  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.trim().length > 10) {
    return envKey.trim();
  }

  return "AIzaSyAcKrjJcIze34I8njsnopvN4s1w8uFTnyA";
}
