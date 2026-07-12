/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
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

    // 1. Fetch user preferences to find monitored groups
    const { data: prefs } = await supabase
      .from("student_preferences")
      .select("telegram_config")
      .eq("user_id", user.id)
      .maybeSingle();

    const monitored = prefs?.telegram_config?.monitoredGroupIds || [];
    if (monitored.length === 0) {
      return NextResponse.json([]);
    }

    // 2. Query insights from monitored groups only
    let query = supabase
      .from("placement_insights")
      .select("*")
      .eq("user_id", user.id)
      .in("group_id", monitored);

    if (groupId) {
      query = query.eq("group_id", groupId);
    }
    if (overview) {
      query = query.eq("pinned_to_overview", true).eq("status", "applied");
    }

    const { data: rows, error } = await query
      .order("rank", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[GET insights] Supabase error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Map snake_case database fields to camelCase expected by the client
    const mapped = (rows || []).map((r) => ({
      _id: r.id,
      groupId: r.group_id,
      groupTitle: r.group_title,
      rank: r.rank,
      title: r.title,
      summary: r.summary,
      whyRanked: r.why_ranked,
      urgency: r.urgency,
      category: r.category,
      confidence: r.confidence,
      status: r.status,
      pinnedToOverview: r.pinned_to_overview,
      extractedDeadline: r.extracted_deadline,
      suggestedReminderOffsetsMinutes: r.suggested_reminder_offsets_minutes,
      sourceMessageIds: r.source_message_ids,
      sourceMessagePreview: r.source_message_preview,
      reminderCount: r.reminder_count,
      createdAt: r.created_at,
    }));

    return NextResponse.json(mapped);
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

    // Fetch user preferences
    const { data: prefs } = await supabase
      .from("student_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!prefs) {
      return NextResponse.json({ error: "Settings not found" }, { status: 400 });
    }

    const defaultApply = prefs.telegram_config?.insightsApplyMode || "preview";
    const mode = applyMode || defaultApply;

    let monitored = prefs.telegram_config?.monitoredGroupIds || [];
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
      Math.max(5, messageLimit ?? prefs.telegram_config?.insightMessageCount ?? 25)
    );
    const since = sinceDate
      ? new Date(sinceDate)
      : prefs.telegram_config?.insightSinceDate
        ? new Date(prefs.telegram_config.insightSinceDate)
        : null;

    // Query telegram groups from Supabase
    const { data: groups } = await supabase
      .from("telegram_groups")
      .select("*")
      .in("group_id", monitored);

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

    for (const g of (groups || [])) {
      let msgQuery = supabase
        .from("telegram_messages")
        .select("message_id, text, sender_name, sent_at")
        .eq("group_id", g.group_id);
      if (since) {
        msgQuery = msgQuery.gte("sent_at", since.toISOString());
      }

      const { data: msgs } = await msgQuery
        .order("sent_at", { ascending: false })
        .limit(limit);

      if ((!msgs || msgs.length === 0) && targetGroupId) {
        return NextResponse.json({
          insights: [],
          proposed: [],
          processingNotes: `No messages for "${g.title}" in this range. Load messages first or widen date/limit.`,
          created: { deadlines: 0, reminders: 0, insights: 0 },
          analyzedMessageCount: 0,
        });
      }

      payload.push({
        groupId: g.group_id,
        title: g.title,
        messages: (msgs || [])
          .reverse()
          .map((m) => ({
            messageId: m.message_id,
            text: m.text,
            senderName: m.sender_name || undefined,
            sentAt: m.sent_at,
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

    // Adapt prefs schema to camelCase expected by AI analysis
    const mappedPrefs = {
      ai: prefs.ai_config,
      telegram: prefs.telegram_config,
    };

    const analysis = await analyzeChatMessagesForInsights(withMessages, mappedPrefs as any);
    const processingNotes = `${fetchNote}${analysis.processingNotes || ""}`.trim();

    if (mode === "preview" || mode === "none") {
      await storeDraftInsights(user.id, analysis.insights, targetGroupId);
      
      let storedQuery = supabase
        .from("placement_insights")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "draft");

      if (targetGroupId) {
        storedQuery = storedQuery.eq("group_id", targetGroupId);
      }

      const { data: stored } = await storedQuery
        .order("rank", { ascending: true })
        .limit(50);

      // Map back to camelCase
      const mappedStored = (stored || []).map((r) => ({
        _id: r.id,
        groupId: r.group_id,
        groupTitle: r.group_title,
        rank: r.rank,
        title: r.title,
        summary: r.summary,
        whyRanked: r.why_ranked,
        urgency: r.urgency,
        category: r.category,
        confidence: r.confidence,
        status: r.status,
        pinnedToOverview: r.pinned_to_overview,
        extractedDeadline: r.extracted_deadline,
        suggestedReminderOffsetsMinutes: r.suggested_reminder_offsets_minutes,
        sourceMessageIds: r.source_message_ids,
        sourceMessagePreview: r.source_message_preview,
        reminderCount: r.reminder_count,
        createdAt: r.created_at,
      }));

      return NextResponse.json({
        ...analysis,
        processingNotes,
        insights: mappedStored,
        proposed: analysis.insights,
        created: { deadlines: 0, reminders: 0, insights: mappedStored.length },
        analyzedMessageCount,
        analyzedGroupId: targetGroupId,
        applyMode: mode,
        messagesFetched: fetchResult.fetched,
        analysisEngine: analysis.analysisEngine ?? (analysis.usedGemini ? "gemini" : "smart-rules"),
        usedGemini: analysis.usedGemini ?? false,
      });
    }

    // Map db preferences config
    const automationMappedPrefs = {
      automation: prefs.automation_config,
      telegram: prefs.telegram_config,
      reminders: prefs.reminders_config,
      calendar: prefs.calendar_config,
    };

    const created = await applyChatInsightsForUser(
      user.id,
      analysis.insights,
      automationMappedPrefs as any,
      targetGroupId,
      { pinToOverview: parsed.success ? parsed.data.pinToOverview : false }
    );

    let storedQuery = supabase
      .from("placement_insights")
      .select("*")
      .eq("user_id", user.id);

    if (targetGroupId) {
      storedQuery = storedQuery.eq("group_id", targetGroupId);
    }

    const { data: stored } = await storedQuery
      .order("rank", { ascending: true })
      .limit(50);

    const mappedStored = (stored || []).map((r) => ({
      _id: r.id,
      groupId: r.group_id,
      groupTitle: r.group_title,
      rank: r.rank,
      title: r.title,
      summary: r.summary,
      whyRanked: r.why_ranked,
      urgency: r.urgency,
      category: r.category,
      confidence: r.confidence,
      status: r.status,
      pinnedToOverview: r.pinned_to_overview,
      extractedDeadline: r.extracted_deadline,
      suggestedReminderOffsetsMinutes: r.suggested_reminder_offsets_minutes,
      sourceMessageIds: r.source_message_ids,
      sourceMessagePreview: r.source_message_preview,
      reminderCount: r.reminder_count,
      createdAt: r.created_at,
    }));

    return NextResponse.json({
      ...analysis,
      processingNotes,
      created,
      insights: mappedStored,
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
