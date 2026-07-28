import { getEffectiveGeminiApiKey } from "./gemini-client";

export async function getGeminiApiKey(userId?: string): Promise<string | null> {
  try {
    return await getEffectiveGeminiApiKey(userId);
  } catch {
    return null;
  }
}

export async function isGeminiConfigured(userId?: string): Promise<boolean> {
  const key = await getGeminiApiKey(userId);
  return !!key;
}

export const GEMINI_MISSING_HINT =
  "Gemini API Key missing. Please set your Gemini API Key in Student Profile (/dashboard/profile).";
