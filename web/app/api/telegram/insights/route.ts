import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { TelegramMessage } from "@/models/TelegramMessage";
import { TelegramGroup } from "@/models/TelegramGroup";
import { PlacementInsight } from "@/models/PlacementInsight";
import { StudentPreferences } from "@/models/StudentPreferences";
import { requireAuth } from "@/lib/api-auth";
import { analyzeChatMessagesForInsights } from "@/lib/ai/chat-insights";
import {
  applyChatInsightsForUser,
  storeDraftInsights,
} from "@/lib/ai/apply-chat-insights";
import { ensureMessagesForGroups } from "@/lib/telegram-ensure-messages";

export const runtime = "nodejs";
export const maxDuration = 60;

const postSchema = z.object({
  groupId: z.string().optional(),
  messageLimit: z.number().min(5).max(100).optional(),
  sinceDate: z.string().optional(),
  applyMode: z.enum(["preview", "all", "none"]).optional(),
  pinToOverview: z.boolean().optional(),
});

/** GET — stored insights (?groupId= & ?overview=pinned) */
export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");
    const overview = searchParams.get("overview") === "pinned";
    await connectDB();
    const filter: Record<string, unknown> = { userId: user.id };
    if (groupId) filter.groupId = groupId;
    if (overview) {
      filter.pinnedToOverview = true;
      filter.status = "applied";
    }
    const rows = await PlacementInsight.find(filter).sort({ rank: 1, createdAt: -1 }).limit(50).lean();
    return NextResponse.json(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

/** POST — analyze chats; preview stores draft insights, all auto-applies */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const parsed = postSchema.safeParse(body);
    const targetGroupId = parsed.success ? parsed.data.groupId : undefined;
    const messageLimit = parsed.success ? parsed.data.messageLimit : undefined;
    const sinceDate = parsed.success ? parsed.data.sinceDate : undefined;
    const applyMode =
      (parsed.success && parsed.data.applyMode) ||
      (undefined as "preview" | "all" | "none" | undefined);

    await connectDB();

    let prefs = await StudentPreferences.findOne({ userId: user.id });
    if (!prefs) {
      const { getDefaultStudentPreferences } = await import("@/models/StudentPreferences");
      prefs = await StudentPreferences.create({ userId: user.id, ...getDefaultStudentPreferences() });
    }

    const defaultApply = prefs.telegram?.insightsApplyMode || "preview";
    const mode = applyMode || defaultApply;

    let monitored = prefs.telegram?.monitoredGroupIds || [];
    if (targetGroupId) monitored = [targetGroupId];
    if (monitored.length === 0) {
      return NextResponse.json({
        insights: [],
        proposed: [],
        processingNotes: targetGroupId
          ? "Group not found for analysis."
          : "Turn Monitor ON for groups, or open a chat and tap Analyze this group.",
        created: { deadlines: 0, reminders: 0, insights: 0 },
      });
    }

    const limit = Math.min(
      100,
      Math.max(5, messageLimit ?? prefs.telegram?.insightMessageCount ?? 25)
    );
    const since = sinceDate
      ? new Date(sinceDate)
      : prefs.telegram?.insightSinceDate
        ? new Date(prefs.telegram.insightSinceDate)
        : null;

    const groups = await TelegramGroup.find({ groupId: { $in: monitored } }).lean();

    const fetchResult = await ensureMessagesForGroups(monitored, limit, since);
    const fetchNote =
      fetchResult.fetched > 0
        ? `Loaded ${fetchResult.fetched} message(s) from Telegram before analysis. `
        : fetchResult.errors.length > 0
          ? `Could not refresh from Telegram: ${fetchResult.errors[0]}. Using stored messages. `
          : "";

    const payload: {
      groupId: string;
      title: string;
      messages: { messageId: string; text: string; senderName?: string; sentAt: string }[];
    }[] = [];

    for (const g of groups) {
      const msgFilter: Record<string, unknown> = { groupId: g.groupId };
      if (since && !Number.isNaN(since.getTime())) {
        msgFilter.sentAt = { $gte: since };
      }
      const msgs = await TelegramMessage.find(msgFilter).sort({ sentAt: -1 }).limit(limit).lean();
      if (msgs.length === 0 && targetGroupId) {
        return NextResponse.json({
          insights: [],
          proposed: [],
          processingNotes: `No messages for "${g.title}" in this range. Load messages first or widen date/limit.`,
          created: { deadlines: 0, reminders: 0, insights: 0 },
          analyzedMessageCount: 0,
        });
      }
      payload.push({
        groupId: g.groupId,
        title: g.title,
        messages: msgs
          .reverse()
          .map((m) => ({
            messageId: m.messageId,
            text: m.text,
            senderName: m.senderName,
            sentAt: m.sentAt instanceof Date ? m.sentAt.toISOString() : String(m.sentAt),
          })),
      });
    }

    const withMessages = payload.filter((p) => p.messages.length > 0);
    const analyzedMessageCount = withMessages.reduce((n, p) => n + p.messages.length, 0);
    if (withMessages.length === 0) {
      return NextResponse.json({
        insights: [],
        proposed: [],
        processingNotes: "No messages to analyze. Load messages, adjust limit, or pick an earlier since date.",
        created: { deadlines: 0, reminders: 0, insights: 0 },
        analyzedMessageCount: 0,
      });
    }

    const analysis = await analyzeChatMessagesForInsights(withMessages, prefs);
    const processingNotes = `${fetchNote}${analysis.processingNotes || ""}`.trim();

    if (mode === "preview" || mode === "none") {
      await storeDraftInsights(user.id, analysis.insights, targetGroupId);
      const filter: { userId: string; groupId?: string } = { userId: user.id };
      if (targetGroupId) filter.groupId = targetGroupId;
      const stored = await PlacementInsight.find({
        ...filter,
        status: "draft",
      })
        .sort({ rank: 1 })
        .limit(50)
        .lean();

      return NextResponse.json({
        ...analysis,
        processingNotes,
        insights: stored,
        proposed: analysis.insights,
        created: { deadlines: 0, reminders: 0, insights: stored.length },
        analyzedMessageCount,
        analyzedGroupId: targetGroupId,
        applyMode: mode,
        messagesFetched: fetchResult.fetched,
        analysisEngine: analysis.analysisEngine ?? (analysis.usedGemini ? "gemini" : "smart-rules"),
        usedGemini: analysis.usedGemini ?? false,
      });
    }

    const created = await applyChatInsightsForUser(
      user.id,
      analysis.insights,
      prefs,
      targetGroupId,
      { pinToOverview: parsed.success ? parsed.data.pinToOverview : false }
    );

    const filter: { userId: string; groupId?: string } = { userId: user.id };
    if (targetGroupId) filter.groupId = targetGroupId;
    const stored = await PlacementInsight.find(filter).sort({ rank: 1 }).limit(50).lean();

    return NextResponse.json({
      ...analysis,
      processingNotes,
      created,
      insights: stored,
      proposed: analysis.insights,
      analyzedMessageCount,
      analyzedGroupId: targetGroupId,
      applyMode: "all",
      results: created.results,
      messagesFetched: fetchResult.fetched,
      analysisEngine: analysis.analysisEngine ?? (analysis.usedGemini ? "gemini" : "smart-rules"),
      usedGemini: analysis.usedGemini ?? false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
