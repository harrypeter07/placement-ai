import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { TelegramMessage } from "@/models/TelegramMessage";
import { TelegramGroup } from "@/models/TelegramGroup";
import { PlacementInsight } from "@/models/PlacementInsight";
import { StudentPreferences } from "@/models/StudentPreferences";
import { requireAuth } from "@/lib/api-auth";
import { analyzeChatMessagesForInsights } from "@/lib/ai/chat-insights";
import { applyChatInsightsForUser } from "@/lib/ai/apply-chat-insights";

export const runtime = "nodejs";
export const maxDuration = 60;

const postSchema = z.object({
  groupId: z.string().optional(),
});

/** GET — stored insights (?groupId= optional filter) */
export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const groupId = new URL(req.url).searchParams.get("groupId");
    await connectDB();
    const filter: { userId: string; groupId?: string } = { userId: user.id };
    if (groupId) filter.groupId = groupId;
    const rows = await PlacementInsight.find(filter).sort({ rank: 1, createdAt: -1 }).limit(30).lean();
    return NextResponse.json(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

/** POST — Gemini on monitored groups or one groupId */
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

    await connectDB();

    let prefs = await StudentPreferences.findOne({ userId: user.id });
    if (!prefs) {
      const { getDefaultStudentPreferences } = await import("@/models/StudentPreferences");
      prefs = await StudentPreferences.create({ userId: user.id, ...getDefaultStudentPreferences() });
    }

    let monitored = prefs.telegram?.monitoredGroupIds || [];
    if (targetGroupId) {
      monitored = [targetGroupId];
    }
    if (monitored.length === 0) {
      return NextResponse.json({
        insights: [],
        processingNotes: targetGroupId
          ? "Group not found for analysis."
          : "Turn Monitor ON for groups you want AI to watch (toggle on the left), or open a chat and tap Analyze this group.",
        created: { deadlines: 0, reminders: 0, insights: 0 },
      });
    }

    const limit = Math.min(100, Math.max(5, prefs.telegram?.insightMessageCount ?? 25));

    const groups = await TelegramGroup.find({ groupId: { $in: monitored } }).lean();
    const payload: {
      groupId: string;
      title: string;
      messages: { messageId: string; text: string; senderName?: string; sentAt: string }[];
    }[] = [];

    for (const g of groups) {
      const msgs = await TelegramMessage.find({ groupId: g.groupId })
        .sort({ sentAt: -1 })
        .limit(limit)
        .lean();
      if (msgs.length === 0 && targetGroupId) {
        return NextResponse.json({
          insights: [],
          processingNotes: `No messages stored for "${g.title}". Tap Load messages first, then Analyze.`,
          created: { deadlines: 0, reminders: 0, insights: 0 },
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
    if (withMessages.length === 0) {
      return NextResponse.json({
        insights: [],
        processingNotes: "No messages to analyze. Load messages for a group, then run analysis.",
        created: { deadlines: 0, reminders: 0, insights: 0 },
      });
    }

    const analysis = await analyzeChatMessagesForInsights(withMessages, prefs);
    const created = await applyChatInsightsForUser(
      user.id,
      analysis.insights,
      prefs,
      targetGroupId
    );

    const filter: { userId: string; groupId?: string } = { userId: user.id };
    if (targetGroupId) filter.groupId = targetGroupId;
    const stored = await PlacementInsight.find(filter).sort({ rank: 1 }).limit(30).lean();

    return NextResponse.json({
      ...analysis,
      created,
      insights: stored,
      analyzedGroupId: targetGroupId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
