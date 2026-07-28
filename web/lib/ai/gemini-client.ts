import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "@/lib/supabase";

/**
 * Single Canonical Gemini AI Client & Model Manager for Placement AI
 * Fetches user's DB key or env key with zero hardcoded fallbacks.
 */

export const PRIMARY_GEMINI_MODEL = "gemini-2.5-flash";
export const PRO_GEMINI_MODEL = "gemini-2.5-pro";
export const FALLBACK_GEMINI_MODEL = "gemini-1.5-flash";

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
      console.warn("[GeminiClient] Error fetching key from user DB:", err);
    }
  }

  // Fall back to server environment variable if configured by host
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.trim().length > 10) {
    return envKey.trim();
  }

  // No key configured anywhere - prompt user to upload key
  throw new Error("Gemini API Key missing. Please set your Gemini API Key in Student Profile (/dashboard/profile) to use AI features.");
}

export async function getGeminiModel(userId?: string, modelName: string = PRIMARY_GEMINI_MODEL) {
  const apiKey = await getEffectiveGeminiApiKey(userId);
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: modelName });
}

export async function generateGeminiContent(
  userId: string | undefined,
  prompt: string | (string | { inlineData: { data: string; mimeType: string } })[],
  preferredModel: string = PRIMARY_GEMINI_MODEL
) {
  try {
    const model = await getGeminiModel(userId, preferredModel);
    return await model.generateContent(prompt);
  } catch (err) {
    if (preferredModel !== FALLBACK_GEMINI_MODEL) {
      console.warn(`[GeminiClient] Model ${preferredModel} encountered issue, trying fallback ${FALLBACK_GEMINI_MODEL}:`, err);
      const fallbackModel = await getGeminiModel(userId, FALLBACK_GEMINI_MODEL);
      return await fallbackModel.generateContent(prompt);
    }
    throw err;
  }
}
