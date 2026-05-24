import { GoogleGenerativeAI } from "@google/generative-ai";
import type { IStudentPreferences } from "@/models/StudentPreferences";
import { GEMINI_MISSING_HINT, getGeminiApiKey, isGeminiConfigured } from "@/lib/ai/gemini-env";

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

function heuristicInsights(
  groupId: string,
  groupTitle: string,
  messages: ChatMessageInput[]
): ChatInsightsResult {
  const now = Date.now();
  const items: ChatInsightItem[] = [];
  let rank = 1;

  for (const m of messages) {
    const text = m.text || "";
    if (!/deadline|apply|hiring|placement|intern|oa|interview|register|form|closing/i.test(text)) continue;

    const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    let deadlineIso = "";
    let urgency: ChatInsightItem["urgency"] = "medium";
    if (dateMatch) {
      const [, d, mo, y] = dateMatch;
      const year = y.length === 2 ? `20${y}` : y;
      const dt = new Date(`${year}-${mo}-${d}`);
      if (!Number.isNaN(dt.getTime())) {
        deadlineIso = dt.toISOString();
        const hours = (dt.getTime() - now) / (3600 * 1000);
        if (hours < 24) urgency = "critical";
        else if (hours < 72) urgency = "high";
      }
    }
    if (/today|tonight|eod|11:59|last date|closing soon/i.test(text)) urgency = "critical";

    items.push({
      rank: rank++,
      title: text.slice(0, 72).replace(/\n/g, " ") || "Placement update",
      summary: text.slice(0, 400),
      urgency,
      category: deadlineIso ? "deadline" : "action",
      confidence: 0.55,
      groupId,
      groupTitle,
      sourceMessageIds: [m.messageId],
      extractedDeadline: deadlineIso
        ? {
            company: (text.match(/(?:company|org)[:\s]+([A-Za-z0-9\s&.]+)/i)?.[1] || "Unknown").trim(),
            role: (text.match(/(?:role|position)[:\s]+([A-Za-z0-9\s&.]+)/i)?.[1] || "Role").trim(),
            deadline: deadlineIso,
            eligibility: "",
            links: text.match(/https?:\/\/[^\s]+/g) || [],
          }
        : null,
      suggestedReminderOffsetsMinutes: urgency === "critical" ? [6 * 60, 60, 30, 15] : [24 * 60, 6 * 60, 60],
      whyRanked: urgency === "critical" ? "Near-term date or urgent wording" : "Placement keywords detected",
    });
  }

  items.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.urgency] - order[b.urgency] || a.rank - b.rank;
  });
  items.forEach((it, i) => {
    it.rank = i + 1;
  });

  return {
    insights: items.slice(0, 12),
    processingNotes: `Keyword analysis only — Gemini not configured. ${GEMINI_MISSING_HINT}`,
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
    const merged: ChatInsightItem[] = [];
    for (const g of groups) {
      const r = heuristicInsights(g.groupId, g.title, g.messages);
      merged.push(...r.insights);
    }
    merged.sort((a, b) => a.rank - b.rank);
    merged.forEach((it, i) => {
      it.rank = i + 1;
    });
    return {
      insights: merged.slice(0, 15),
      processingNotes: `Analyzed ${flatCount} message(s) with keyword rules only. ${GEMINI_MISSING_HINT}`,
      usedGemini: false,
      geminiConfigured: false,
    };
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

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\n?|\n?```/g, "").trim();
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
    };
  } catch (err) {
    const fallback = heuristicInsights(
      groups[0]?.groupId || "",
      groups[0]?.title || "Group",
      groups.flatMap((g) => g.messages)
    );
    const reason = err instanceof Error ? err.message : "API error";
    return {
      ...fallback,
      processingNotes: `Gemini failed (${reason}). Using keyword fallback for ${flatCount} message(s).`,
      usedGemini: false,
      geminiConfigured: true,
    };
  }
}
