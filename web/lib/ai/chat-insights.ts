import { GoogleGenerativeAI } from "@google/generative-ai";
import type { IStudentPreferences } from "@/models/StudentPreferences";
import { getGeminiApiKey, isGeminiConfigured } from "@/lib/ai/gemini-env";
import { smartPlacementInsights } from "@/lib/ai/smart-placement-analysis";

function getGenAI() {
  const key = getGeminiApiKey();
  return key ? new GoogleGenerativeAI(key) : null;
}

export type ChatMessageInput = {
  messageId: string;
  text: string;
  senderName?: string;
  sentAt: string;
};

export type InsightExtractedDeadline = {
  company: string;
  role: string;
  deadline: string;
  eligibility?: string;
  links?: string[];
  type?: string;
};

export type ChatInsightItem = {
  rank: number;
  title: string;
  summary: string;
  urgency: "low" | "medium" | "high" | "critical";
  category: "deadline" | "reminder" | "info" | "action";
  confidence: number;
  groupId: string;
  groupTitle?: string;
  sourceMessageIds: string[];
  extractedDeadline?: InsightExtractedDeadline | null;
  suggestedReminderOffsetsMinutes: number[];
  whyRanked: string;
};

export type ChatInsightsResult = {
  insights: ChatInsightItem[];
  processingNotes: string;
  usedGemini?: boolean;
  geminiConfigured?: boolean;
  analysisEngine?: "gemini" | "smart-rules";
};

function clampOffsets(arr: unknown): number[] {
  if (!Array.isArray(arr)) return [24 * 60, 6 * 60, 60, 15];
  const out = arr
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 5 && n <= 30 * 24 * 60);
  return out.length ? [...new Set(out)].slice(0, 6) : [24 * 60, 6 * 60, 60, 15];
}

function normalizeUrgency(u: unknown): ChatInsightItem["urgency"] {
  const s = String(u || "").toLowerCase();
  if (s === "low" || s === "medium" || s === "high" || s === "critical") return s;
  return "medium";
}

function normalizeCategory(c: unknown): ChatInsightItem["category"] {
  const s = String(c || "").toLowerCase();
  if (s === "deadline" || s === "reminder" || s === "info" || s === "action") return s;
  return "info";
}

function runSmartRulesAnalysis(
  groups: { groupId: string; title: string; messages: ChatMessageInput[] }[],
  flatCount: number
): ChatInsightsResult {
  const merged: ChatInsightItem[] = [];
  for (const g of groups) {
    merged.push(...smartPlacementInsights(g.groupId, g.title, g.messages));
  }
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  merged.sort((a, b) => order[a.urgency] - order[b.urgency] || a.rank - b.rank);
  merged.forEach((it, i) => {
    it.rank = i + 1;
  });
  return {
    insights: merged.slice(0, 15),
    processingNotes: `Analyzed ${flatCount} message(s) with built-in placement rules (dates, companies, urgency).`,
    usedGemini: false,
    geminiConfigured: false,
    analysisEngine: "smart-rules",
  };
}

export async function analyzeChatMessagesForInsights(
  groups: { groupId: string; title: string; messages: ChatMessageInput[] }[],
  prefs: Pick<IStudentPreferences, "ai" | "telegram" | "timezone"> | null
): Promise<ChatInsightsResult> {
  const nowIso = new Date().toISOString();
  const sensitivity = prefs?.ai?.urgencySensitivity || "medium";
  const tz = prefs?.timezone || "Asia/Kolkata";

  const flatCount = groups.reduce((n, g) => n + g.messages.length, 0);
  if (flatCount === 0) {
    return { insights: [], processingNotes: "No messages in monitored groups." };
  }

  const geminiConfigured = isGeminiConfigured();
  const genAI = getGenAI();
  if (!geminiConfigured || !genAI) {
    return runSmartRulesAnalysis(groups, flatCount);
  }

  const transcript = groups
    .map((g) => {
      const lines = g.messages
        .map(
          (m) =>
            `[${m.sentAt}] id=${m.messageId} ${m.senderName || "user"}: ${m.text.replace(/\s+/g, " ").slice(0, 800)}`
        )
        .join("\n");
      return `### GROUP ${g.title} (id=${g.groupId})\n${lines}`;
    })
    .join("\n\n");

  const prompt = `You are PlaceMint AI — placement decision engine for Indian college students.

Current time (UTC): ${nowIso}
Student timezone: ${tz}
Urgency sensitivity: ${sensitivity}

Analyze the Telegram transcripts below. Students care about NEAR deadlines more than vague announcements.

Return ONLY valid JSON (no markdown):
{
  "processingNotes": "string — brief how you ranked items",
  "insights": [
    {
      "rank": number (1 = most important),
      "title": "string max 100 chars",
      "summary": "string max 500 chars — what to do",
      "urgency": "low" | "medium" | "high" | "critical",
      "category": "deadline" | "reminder" | "info" | "action",
      "confidence": 0-1,
      "groupId": "string",
      "groupTitle": "string",
      "sourceMessageIds": ["message ids from transcript"],
      "whyRanked": "string — date proximity, hiring impact, etc.",
      "extractedDeadline": null OR {
        "company": "string",
        "role": "string",
        "deadline": "ISO 8601 datetime",
        "eligibility": "string",
        "links": ["url"],
        "type": "internship|full-time|both"
      },
      "suggestedReminderOffsetsMinutes": [1440, 360, 60, 15]
    }
  ]
}

Rules:
- Rank by decision urgency: deadlines within 72h = high/critical.
- If multiple messages refer to same company+role, merge into one insight.
- category "deadline" only when a concrete date/time exists or can be inferred.
- suggestedReminderOffsetsMinutes = minutes BEFORE deadline to notify.
- Max 15 insights. Skip spam (confidence < 0.35).
- Prefer actionable placement content over chat noise.

Transcripts:
${transcript.slice(0, 28000)}`;

  const models = ["gemini-2.0-flash", "gemini-1.5-flash"];
  let text = "";
  let lastErr: unknown;
  for (const modelName of models) {
    try {
      const model = genAI!.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      text = result.response.text().replace(/```json\n?|\n?```/g, "").trim();
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!text) throw lastErr;

  try {
    const parsed = JSON.parse(text) as {
      insights?: unknown[];
      processingNotes?: string;
    };

    const insights: ChatInsightItem[] = (Array.isArray(parsed.insights) ? parsed.insights : [])
      .map((raw, i) => {
        const o = raw as Record<string, unknown>;
        const ext = o.extractedDeadline as Record<string, unknown> | null | undefined;
        return {
          rank: Number(o.rank) || i + 1,
          title: String(o.title || "Insight").slice(0, 100),
          summary: String(o.summary || "").slice(0, 500),
          urgency: normalizeUrgency(o.urgency),
          category: normalizeCategory(o.category),
          confidence: Math.min(1, Math.max(0, Number(o.confidence) || 0.5)),
          groupId: String(o.groupId || groups[0]?.groupId || ""),
          groupTitle: String(o.groupTitle || ""),
          sourceMessageIds: Array.isArray(o.sourceMessageIds)
            ? o.sourceMessageIds.map(String)
            : [],
          whyRanked: String(o.whyRanked || "").slice(0, 300),
          extractedDeadline: ext?.company
            ? {
                company: String(ext.company).slice(0, 120),
                role: String(ext.role || "Role").slice(0, 120),
                deadline: String(ext.deadline || ""),
                eligibility: String(ext.eligibility || ""),
                links: Array.isArray(ext.links) ? ext.links.map(String) : [],
                type: String(ext.type || "full-time"),
              }
            : null,
          suggestedReminderOffsetsMinutes: clampOffsets(o.suggestedReminderOffsetsMinutes),
        };
      })
      .filter((x) => x.confidence >= 0.35)
      .sort((a, b) => a.rank - b.rank);

    return {
      insights,
      processingNotes: String(
        parsed.processingNotes || `Gemini analyzed ${flatCount} message(s) across ${groups.length} group(s).`
      ),
      usedGemini: true,
      geminiConfigured: true,
      analysisEngine: "gemini",
    };
  } catch (err) {
    const smart = runSmartRulesAnalysis(groups, flatCount);
    const reason = err instanceof Error ? err.message : "API error";
    return {
      ...smart,
      processingNotes: `${smart.processingNotes} (AI unavailable: ${reason.slice(0, 80)})`,
      geminiConfigured: true,
    };
  }
}
