import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiApiKey, isGeminiConfigured } from "@/lib/ai/gemini-env";

export type ReminderStyle = "gentle" | "balanced" | "aggressive";

export type ReminderAnalysisResult = {
  isPlacement: boolean;
  urgency: "low" | "medium" | "high" | "critical";
  shouldRemind: boolean;
  suggestedOffsetsMinutes: number[];
  /** Human labels e.g. "6 hours before" */
  suggestedNotifications: string[];
  reminderStyle: ReminderStyle;
  aiSummary: string;
  notificationTitle: string;
  notificationMessage: string;
  confidence: number;
};

const FALLBACK: ReminderAnalysisResult = {
  isPlacement: true,
  urgency: "medium",
  shouldRemind: true,
  suggestedOffsetsMinutes: [24 * 60, 6 * 60, 60],
  suggestedNotifications: ["1 day before", "6 hours before", "1 hour before"],
  reminderStyle: "balanced",
  aiSummary: "You have an upcoming application deadline.",
  notificationTitle: "Placement deadline",
  notificationMessage: "You have an upcoming application deadline.",
  confidence: 0.4,
};

function minutesToLabel(m: number): string {
  if (m >= 24 * 60) return `${Math.round(m / (24 * 60))} day${m >= 48 * 60 ? "s" : ""} before`;
  if (m >= 60) return `${Math.round(m / 60)} hour${m >= 120 ? "s" : ""} before`;
  return `${m} mins before`;
}

function urgencyToStyle(u: ReminderAnalysisResult["urgency"]): ReminderStyle {
  if (u === "critical") return "aggressive";
  if (u === "high") return "aggressive";
  if (u === "low") return "gentle";
  return "balanced";
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prefs?: any
): Promise<ReminderAnalysisResult> {
  const sensitivity = prefs?.ai_config?.urgencySensitivity || prefs?.ai?.urgencySensitivity || "medium";

  if (!isGeminiConfigured()) {
    const urgent = /tonight|today|hours?|closing|last date|eod|11:59|23:59/i.test(message);
    const offsets = urgent ? [6 * 60, 60, 30, 15] : FALLBACK.suggestedOffsetsMinutes;
    const urgency = urgent ? "critical" : "medium";
    return {
      ...FALLBACK,
      isPlacement: true,
      urgency,
      suggestedOffsetsMinutes: offsets,
      suggestedNotifications: offsets.map(minutesToLabel),
      reminderStyle: urgencyToStyle(urgency),
      aiSummary: message.slice(0, 200),
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
  "suggestedNotifications": string[] (human labels like "6 hours before"),
  "reminderStyle": "gentle" | "balanced" | "aggressive",
  "aiSummary": string (max 200 chars),
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
    const apiKey = await getGeminiApiKey();
    if (!apiKey) return { ...FALLBACK, aiSummary: message.slice(0, 200) };
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5));

    const offsets = clampMinutes(parsed.suggestedOffsetsMinutes);
    const urgency = normalizeUrgency(parsed.urgency);
    const suggestedNotifications = Array.isArray(parsed.suggestedNotifications)
      ? (parsed.suggestedNotifications as unknown[]).map((s) => String(s).slice(0, 40)).slice(0, 8)
      : offsets.map(minutesToLabel);

    return {
      isPlacement: Boolean(parsed.isPlacement),
      urgency,
      shouldRemind: Boolean(parsed.shouldRemind),
      suggestedOffsetsMinutes: offsets,
      suggestedNotifications,
      reminderStyle: (["gentle", "balanced", "aggressive"].includes(String(parsed.reminderStyle))
        ? parsed.reminderStyle
        : urgencyToStyle(urgency)) as ReminderStyle,
      aiSummary: String(parsed.aiSummary || parsed.notificationMessage || FALLBACK.aiSummary).slice(0, 200),
      notificationTitle: String(parsed.notificationTitle || FALLBACK.notificationTitle).slice(0, 80),
      notificationMessage: String(parsed.notificationMessage || FALLBACK.notificationMessage).slice(0, 400),
      confidence,
    };
  } catch {
    return { ...FALLBACK, notificationMessage: message.slice(0, 280) };
  }
}
