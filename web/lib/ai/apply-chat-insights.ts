/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/lib/supabase";
import { syncDeadlineToGoogleCalendar } from "@/lib/calendar/sync-deadline";
import { priorityToEscalation } from "@/lib/reminders/escalation";
import type { ChatInsightItem } from "@/lib/ai/chat-insights";

export type ApplyInsightOptions = {
  createDeadlines?: boolean;
  createReminders?: boolean;
  pinToOverview?: boolean;
  markApplied?: boolean;
};

export type AppliedInsightResult = {
  insightId: string;
  title: string;
  deadlineCreated: boolean;
  deadlineId?: string;
  remindersCreated: number;
  reminderSchedule: { minutesBefore: number; label: string }[];
};

function offsetLabel(minutes: number): string {
  if (minutes >= 24 * 60) return `${Math.round(minutes / (24 * 60))}d before`;
  if (minutes >= 60) return `${Math.round(minutes / 60)}h before`;
  return `${minutes}m before`;
}

/** Persist AI insight rows (draft) without creating deadlines/reminders */
export async function storeDraftInsights(
  userId: string,
  insights: ChatInsightItem[],
  scopeGroupId?: string
) {
  // Delete existing drafts for user/scope
  let deleteQuery = supabase
    .from("placement_insights")
    .delete()
    .eq("user_id", userId)
    .eq("status", "draft");

  if (scopeGroupId) {
    deleteQuery = deleteQuery.eq("group_id", scopeGroupId);
  }

  await deleteQuery;

  const docs: any[] = [];
  for (const item of insights) {
    const preview = item.summary.slice(0, 280);
    const payload = {
      user_id: userId,
      group_id: item.groupId,
      group_title: item.groupTitle,
      rank: item.rank,
      title: item.title,
      summary: item.summary,
      why_ranked: item.whyRanked,
      urgency: item.urgency,
      category: item.category,
      confidence: item.confidence,
      status: "draft",
      pinned_to_overview: false,
      extracted_deadline: item.extractedDeadline || null,
      suggested_reminder_offsets_minutes: item.suggestedReminderOffsetsMinutes || null,
      source_message_ids: item.sourceMessageIds || [],
      source_message_preview: preview,
      reminder_count: 0,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("placement_insights")
      .insert([payload])
      .select("*")
      .single();

    if (error) {
      console.error("[apply-chat-insights] storeDraftInsights insert error:", error);
    } else if (data) {
      docs.push(data);
    }
  }
  return docs;
}

/** Apply one stored insight or raw item — deadlines + reminders */
export async function applySingleInsight(
  userId: string,
  item: ChatInsightItem | any,
  prefs: any,
  opts: ApplyInsightOptions = {}
): Promise<AppliedInsightResult> {
  const createDeadlines = opts.createDeadlines !== false;
  const createReminders = opts.createReminders !== false;
  const master = prefs?.automation?.masterEnabled !== false;
  const autoDl = prefs?.telegram?.autoCreateDeadlines !== false;
  const autoRm = prefs?.telegram?.autoCreateReminders !== false;

  const title = item.title;
  const summary = item.summary;
  const urgency = item.urgency;
  
  const extracted =
    "extracted_deadline" in item && item.extracted_deadline
      ? item.extracted_deadline
      : "extractedDeadline" in item && item.extractedDeadline
        ? item.extractedDeadline
        : null;

  const offsets: number[] =
    "suggested_reminder_offsets_minutes" in item && item.suggested_reminder_offsets_minutes?.length
      ? item.suggested_reminder_offsets_minutes
      : "suggestedReminderOffsetsMinutes" in item && item.suggestedReminderOffsetsMinutes?.length
        ? item.suggestedReminderOffsetsMinutes
        : prefs?.reminders?.defaultOffsetsMinutes?.length
          ? prefs.reminders.defaultOffsetsMinutes
          : [24 * 60, 6 * 60, 60, 15];

  let deadlineId: string | undefined;
  let deadlineCreated = false;
  let remindersCreated = 0;
  const reminderSchedule: { minutesBefore: number; label: string }[] = [];

  if (
    createDeadlines &&
    master &&
    autoDl &&
    extracted?.company &&
    extracted.deadline
  ) {
    const dlDate = new Date(extracted.deadline);
    if (!Number.isNaN(dlDate.getTime()) && dlDate.getTime() > Date.now() - 86400000) {
      // Duplicate check in Supabase
      const { data: existingList } = await supabase
        .from("deadlines")
        .select("id")
        .eq("user_id", userId)
        .ilike("company", extracted.company.trim())
        .ilike("role", (extracted.role || "Role TBD").trim())
        .limit(1);

      const dup = existingList && existingList.length > 0 ? existingList[0] : null;

      if (!dup) {
        const payload = {
          user_id: userId,
          company: extracted.company,
          role: extracted.role || "Role TBD",
          deadline_date: dlDate.toISOString(),
          eligibility: extracted.eligibility || "",
          type: extracted.type || "full-time",
          links: extracted.links || [],
          status: "pending",
          confidence: "confidence" in item ? item.confidence : 0.7,
          is_global: false,
          notes: `From Telegram insight: ${title}`,
          updated_at: new Date().toISOString()
        };

        const { data: doc, error } = await supabase
          .from("deadlines")
          .insert([payload])
          .select("id, company, role, deadline_date, eligibility, type, links, status, confidence, is_global, notes")
          .single();

        if (error) {
          console.error("[apply-chat-insights] insert deadline error:", error);
        } else if (doc) {
          deadlineId = doc.id;
          deadlineCreated = true;
          
          if (prefs?.calendar?.autoSync !== false && prefs?.calendar?.autoCreateEvents !== false) {
            try {
              // Map DB format to what calendar sync expects
              const mappedDoc = {
                id: doc.id,
                userId: userId,
                company: doc.company,
                role: doc.role,
                deadline: new Date(doc.deadline_date),
                eligibility: doc.eligibility,
                type: doc.type,
                links: doc.links,
                status: doc.status,
                confidence: doc.confidence,
                isGlobal: doc.is_global,
                notes: doc.notes
              };
              await syncDeadlineToGoogleCalendar(userId, mappedDoc as any);
            } catch (calErr) {
              console.warn("[apply-chat-insights] calendar sync warning:", calErr);
            }
          }
        }
      } else {
        deadlineId = dup.id;
      }
    }
  }

  if (createReminders && master && autoRm && prefs?.automation?.aiAutoReminders !== false && deadlineId) {
    const { data: deadline } = await supabase
      .from("deadlines")
      .select("id, deadline_date")
      .eq("id", deadlineId)
      .maybeSingle();

    if (deadline) {
      const dl = new Date(deadline.deadline_date).getTime();
      
      // Delete existing active unsent suggestions for this deadline
      await supabase
        .from("reminders")
        .delete()
        .eq("user_id", userId)
        .eq("deadline_id", deadline.id)
        .eq("sent", false)
        .eq("ai_suggested", true);

      const priority = (
        urgency === "critical" ? "critical" : urgency === "high" ? "high" : "medium"
      );

      for (const minutes of offsets) {
        const scheduledAt = new Date(dl - minutes * 60 * 1000);
        if (scheduledAt <= new Date()) continue;

        const payload = {
          user_id: userId,
          deadline_id: deadline.id,
          scheduled_at: scheduledAt.toISOString(),
          minutes_before_deadline: minutes,
          offset: "custom",
          channels: ["browser", "dashboard"],
          title: title.slice(0, 80),
          message: summary.slice(0, 400),
          ai_summary: summary.slice(0, 200),
          priority,
          status: "active",
          enabled: true,
          ai_suggested: true,
          sent: false,
          repeat_rule: "none",
          escalation_level: priorityToEscalation(priority as any),
          escalation_count: 0,
          reminder_style: priority === "critical" || priority === "high" ? "aggressive" : "balanced",
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from("reminders")
          .insert([payload]);

        if (error) {
          console.error("[apply-chat-insights] insert reminder error:", error);
        } else {
          remindersCreated += 1;
          reminderSchedule.push({ minutesBefore: minutes, label: offsetLabel(minutes) });
        }
      }
    }
  }

  if (urgency === "critical" || urgency === "high") {
    const payload = {
      user_id: userId,
      title,
      message: summary,
      type: "placement",
      read: false,
      updated_at: new Date().toISOString()
    };
    await supabase.from("notifications").insert([payload]);
  }

  const insightId = item.id || item._id || "temp";

  if (item.id || item._id) {
    const targetId = item.id || item._id;
    await supabase
      .from("placement_insights")
      .update({
        status: opts.markApplied === false ? "draft" : "applied",
        deadline_id: deadlineId || null,
        reminder_count: remindersCreated,
        pinned_to_overview: opts.pinToOverview ?? false,
        updated_at: new Date().toISOString()
      })
      .eq("id", targetId)
      .eq("user_id", userId);
  }

  return {
    insightId,
    title,
    deadlineCreated,
    deadlineId,
    remindersCreated,
    reminderSchedule,
  };
}

export async function applyChatInsightsForUser(
  userId: string,
  insights: ChatInsightItem[],
  prefs: any,
  scopeGroupId?: string,
  opts?: ApplyInsightOptions
) {
  // Delete drafts and applied insights in scope
  let deleteQuery = supabase
    .from("placement_insights")
    .delete()
    .eq("user_id", userId)
    .in("status", ["draft", "applied"]);

  if (scopeGroupId) {
    deleteQuery = deleteQuery.eq("group_id", scopeGroupId);
  }

  await deleteQuery;

  const created = { deadlines: 0, reminders: 0, insights: 0 };
  const results: AppliedInsightResult[] = [];

  for (const item of insights) {
    const payload = {
      user_id: userId,
      group_id: item.groupId,
      group_title: item.groupTitle,
      rank: item.rank,
      title: item.title,
      summary: item.summary,
      why_ranked: item.whyRanked,
      urgency: item.urgency,
      category: item.category,
      confidence: item.confidence,
      status: "draft",
      extracted_deadline: item.extractedDeadline || null,
      suggested_reminder_offsets_minutes: item.suggestedReminderOffsetsMinutes || null,
      source_message_ids: item.sourceMessageIds || [],
      source_message_preview: item.summary.slice(0, 280),
      updated_at: new Date().toISOString()
    };

    const { data: doc, error } = await supabase
      .from("placement_insights")
      .insert([payload])
      .select("*")
      .single();

    if (error) {
      console.error("[apply-chat-insights] applyChatInsightsForUser insert error:", error);
      continue;
    }

    const applied = await applySingleInsight(userId, doc, prefs, {
      ...opts,
      markApplied: true,
      pinToOverview: opts?.pinToOverview,
    });
    
    results.push(applied);
    if (applied.deadlineCreated) created.deadlines += 1;
    created.reminders += applied.remindersCreated;
    created.insights += 1;
  }

  return { ...created, results };
}
