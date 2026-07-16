import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ensureMessagesForGroups } from "@/lib/telegram-ensure-messages";
import { analyzeChatMessagesForInsights } from "@/lib/ai/chat-insights";
import { applySingleInsight } from "@/lib/ai/apply-chat-insights";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 1 minute

export async function GET(req: Request) {
  return handleAutoAnalyze(req);
}

export async function POST(req: Request) {
  return handleAutoAnalyze(req);
}

async function handleAutoAnalyze(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET || process.env.TELEGRAM_WORKER_SECRET;
    const auth = req.headers.get("authorization") || req.headers.get("x-worker-secret");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : auth;
    const queryKey = new URL(req.url).searchParams.get("key");

    if (cronSecret && bearer !== cronSecret && queryKey !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch all student preferences with Telegram config having monitored groups
    const { data: prefsList, error: prefsError } = await supabase
      .from("student_preferences")
      .select("*")
      .not("telegram_config", "is", null);

    if (prefsError) {
      console.error("[Auto-Analyze Cron] Error fetching preferences:", prefsError);
      return NextResponse.json({ error: "Failed to fetch preferences" }, { status: 500 });
    }

    const processedUsers = [];

    for (const prefs of prefsList) {
      const tgConfig = prefs.telegram_config || {};
      const monitored = tgConfig.monitoredGroupIds || [];
      const autoInsights = tgConfig.autoInsights !== false;
      const autoCreateDeadlines = tgConfig.autoCreateDeadlines !== false;

      if (monitored.length === 0 || !autoInsights) continue;

      const userId = prefs.user_id;
      const limit = tgConfig.insightMessageCount || 25;

      console.log(`[Auto-Analyze Cron] Processing user ${userId} for groups:`, monitored);

      // A. Pull messages from Telegram for these groups
      const fetchResult = await ensureMessagesForGroups(monitored, limit, null, true);
      console.log(`[Auto-Analyze Cron] Pulled messages. Fetched: ${fetchResult.fetched}`);

      // B. Load stored messages for these groups
      const groupsData = [];
      for (const groupId of monitored) {
        const { data: msgs } = await supabase
          .from("telegram_messages")
          .select("message_id, text, sender_name, sent_at")
          .eq("group_id", groupId)
          .order("sent_at", { ascending: false })
          .limit(limit);

        if (msgs && msgs.length > 0) {
          const { data: groupDoc } = await supabase
            .from("telegram_groups")
            .select("title")
            .eq("group_id", groupId)
            .maybeSingle();

          groupsData.push({
            groupId,
            title: groupDoc?.title || groupId,
            messages: msgs.map((m) => ({
              messageId: m.message_id,
              text: m.text,
              senderName: m.sender_name,
              sentAt: m.sent_at,
            })),
          });
        }
      }

      if (groupsData.length === 0) continue;

      // C. Run AI / smart analysis
      const analysis = await analyzeChatMessagesForInsights(
        groupsData,
        prefs as unknown as Parameters<typeof analyzeChatMessagesForInsights>[1]
      );

      console.log(`[Auto-Analyze Cron] Analysis returned ${analysis.insights.length} insights.`);

      // D. Apply insights automatically if enabled
      let appliedCount = 0;
      if (autoCreateDeadlines && analysis.insights.length > 0) {
        for (const item of analysis.insights) {
          // If we have an actionable deadline
          if (item.extractedDeadline?.company && item.extractedDeadline?.deadline) {
            try {
              // Apply the insight
              const res = await applySingleInsight(userId, item, prefs, {
                createDeadlines: true,
                createReminders: true,
                pinToOverview: tgConfig.insightPinToOverview ?? false,
                markApplied: true,
                enablePhoneCall: true,
              });
              if (res.deadlineCreated || res.remindersCreated > 0) {
                appliedCount++;
              }
            } catch (err) {
              console.error("[Auto-Analyze Cron] Error applying insight:", err);
            }
          }
        }
      }

      processedUsers.push({
        userId,
        monitoredGroups: monitored,
        insightsFound: analysis.insights.length,
        autoApplied: appliedCount,
      });
    }

    return NextResponse.json({
      ok: true,
      processedCount: processedUsers.length,
      details: processedUsers,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("[Auto-Analyze Cron] Crash:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
