import { NextResponse } from "next/server";
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

/** GET — latest stored insights */
export async function GET() {
  try {
    const user = await requireAuth();
    await connectDB();
    const rows = await PlacementInsight.find({ userId: user.id })
      .sort({ rank: 1, createdAt: -1 })
      .limit(30)
      .lean();
    return NextResponse.json(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

/** POST — run Gemini on monitored groups, auto-create deadlines/reminders */
export async function POST() {
  try {
    const user = await requireAuth();
    await connectDB();

    let prefs = await StudentPreferences.findOne({ userId: user.id });
    if (!prefs) {
      const { getDefaultStudentPreferences } = await import("@/models/StudentPreferences");
      prefs = await StudentPreferences.create({ userId: user.id, ...getDefaultStudentPreferences() });
    }

    const monitored = prefs.telegram?.monitoredGroupIds || [];
    if (monitored.length === 0) {
      return NextResponse.json({
        insights: [],
        processingNotes: "No groups selected for monitoring. Enable monitoring on Notifications page.",
        created: { deadlines: 0, reminders: 0, insights: 0 },
      });
    }

    const limit = Math.min(100, Math.max(5, prefs.telegram?.insightMessageCount ?? 25));

    const groups = await TelegramGroup.find({ groupId: { $in: monitored } }).lean();
    const payload: { groupId: string; title: string; messages: { messageId: string; text: string; senderName?: string; sentAt: string }[] }[] = [];

    for (const g of groups) {
      const msgs = await TelegramMessage.find({ groupId: g.groupId })
        .sort({ sentAt: -1 })
        .limit(limit)
        .lean();
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

    const analysis = await analyzeChatMessagesForInsights(payload, prefs);
    const created = await applyChatInsightsForUser(user.id, analysis.insights, prefs);

    const stored = await PlacementInsight.find({ userId: user.id }).sort({ rank: 1 }).limit(30).lean();

    return NextResponse.json({
      ...analysis,
      created,
      insights: stored,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
