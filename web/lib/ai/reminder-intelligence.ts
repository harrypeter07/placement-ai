import { GoogleGenerativeAI } from "@google/generative-ai";
import type { IStudentPreferences } from "@/models/StudentPreferences";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export type ReminderAnalysisResult = {
  isPlacement: boolean;
  urgency: "low" | "medium" | "high" | "critical";
  shouldRemind: boolean;
  suggestedOffsetsMinutes: number[];
  notificationTitle: string;
  notificationMessage: string;
  confidence: number;
};

const FALLBACK: ReminderAnalysisResult = {
  isPlacement: true,
  urgency: "medium",
  shouldRemind: true,
  suggestedOffsetsMinutes: [24 * 60, 6 * 60, 60],
  notificationTitle: "Placement deadline",
  notificationMessage: "You have an upcoming application deadline.",
  confidence: 0.4,
};

function clampMinutes(arr: unknown): number[] {
  if (!Array.isArray(arr)) return FALLBACK.suggestedOffsetsMinutes;
  const out = arr
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 5 && n <= 30 * 24 * 60);
  return out.length ? [...new Set(out)].slice(0, 6) : FALLBACK.suggestedOffsetsMinutes;
}

function normalizeUrgency(u: unknown): ReminderAnalysisResult["urgency"] {
  const s = String(u || "").toLowerCase();
  if (s === "low" || s === "medium" || s === "high" || s === "critical") return s;
  return "medium";
}

export async function analyzePlacementForReminders(
  message: string,
  prefs?: Pick<IStudentPreferences, "ai"> | null
): Promise<ReminderAnalysisResult> {
  const sensitivity = prefs?.ai?.urgencySensitivity || "medium";

  if (!process.env.GEMINI_API_KEY) {
    const urgent = /tonight|today|hours?|closing|last date|eod|11:59|23:59/i.test(message);
    return {
      ...FALLBACK,
      isPlacement: true,
      urgency: urgent ? "high" : "medium",
      suggestedOffsetsMinutes: urgent ? [6 * 60, 60, 30, 15] : FALLBACK.suggestedOffsetsMinutes,
      notificationTitle: urgent ? "Urgent placement deadline" : FALLBACK.notificationTitle,
      notificationMessage: message.slice(0, 280),
      confidence: 0.55,
    };
  }

  const prompt = `You analyze Indian campus placement Telegram messages.

User urgency sensitivity: ${sensitivity} (adjust how aggressive reminders are).

Return ONLY valid JSON (no markdown):
{
  "isPlacement": boolean,
  "urgency": "low" | "medium" | "high" | "critical",
  "shouldRemind": boolean,
  "suggestedOffsetsMinutes": number[],
  "notificationTitle": string (max 80 chars),
  "notificationMessage": string (max 400 chars),
  "confidence": number 0-1
}

Rules:
- suggestedOffsetsMinutes = minutes BEFORE the deadline to remind (e.g. 1440 = 1 day, 360 = 6 hours, 60 = 1 hour, 15 = 15 min).
- If not placement-related, isPlacement false, shouldRemind false, confidence low.
- If deadline is tonight or very soon, urgency "high" or "critical" and include short offsets like 60, 30, 15.
- Malformed dates still may be placement if hiring keywords present.

Message:
${message.slice(0, 6000)}`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5));

    return {
      isPlacement: Boolean(parsed.isPlacement),
      urgency: normalizeUrgency(parsed.urgency),
      shouldRemind: Boolean(parsed.shouldRemind),
      suggestedOffsetsMinutes: clampMinutes(parsed.suggestedOffsetsMinutes),
      notificationTitle: String(parsed.notificationTitle || FALLBACK.notificationTitle).slice(0, 80),
      notificationMessage: String(parsed.notificationMessage || FALLBACK.notificationMessage).slice(0, 400),
      confidence,
    };
  } catch {
    return { ...FALLBACK, notificationMessage: message.slice(0, 280) };
  }
}
