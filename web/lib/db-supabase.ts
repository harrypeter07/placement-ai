/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "./supabase";

export interface StudentPrefData {
  timezone?: string;
  language?: string;
  reminders_config?: Record<string, any>;
  notifications_config?: Record<string, any>;
  calendar_config?: Record<string, any>;
  ai_config?: Record<string, any>;
  placement_config?: Record<string, any>;
  automation_config?: Record<string, any>;
  telegram_config?: Record<string, any>;
  form_profile?: Record<string, any>;
  geminiApiKey?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromPhone?: string;
  twilioToPhone?: string;
}

export async function getStudentPreferences(userId: string) {
  const { data, error } = await supabase
    .from("student_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[db-supabase] getStudentPreferences error:", error);
    throw error;
  }

  if (!data) {
    // Insert defaults if not found
    const { data: inserted, error: insertError } = await supabase
      .from("student_preferences")
      .insert([{ user_id: userId }])
      .select("*")
      .single();

    if (insertError) {
      console.error("[db-supabase] create default preferences error:", insertError);
      throw insertError;
    }
    return inserted;
  }

  return data;
}

export async function updateStudentPreferences(userId: string, data: StudentPrefData) {
  // Translate nested camelCase to snake_case db columns if needed
  const updatePayload: Record<string, any> = { ...data };
  
  const { data: updated, error } = await supabase
    .from("student_preferences")
    .update(updatePayload)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    console.error("[db-supabase] updateStudentPreferences error:", error);
    throw error;
  }

  return updated;
}

export async function findDuplicateDeadline(company: string, role: string, sourceMessageId?: string, telegramGroupId?: string) {
  let query = supabase
    .from("deadlines")
    .select("*")
    .eq("company", company)
    .eq("role", role);

  if (sourceMessageId || telegramGroupId) {
    const filters = [];
    if (sourceMessageId) filters.push(`source_message_id.eq.${sourceMessageId}`);
    if (telegramGroupId) filters.push(`telegram_group_id.eq.${telegramGroupId}`);
    query = query.or(filters.join(","));
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[db-supabase] findDuplicateDeadline error:", error);
  }
  return data;
}

export async function createDeadline(data: Record<string, any>) {
  const { data: inserted, error } = await supabase
    .from("deadlines")
    .insert([{
      company: data.company,
      role: data.role || "Role TBD",
      deadline_date: data.deadline ? new Date(data.deadline).toISOString() : new Date().toISOString(),
      eligibility: data.eligibility || "",
      type: data.type || "full-time",
      links: data.links || [],
      salary: data.salary || "",
      confidence: Number(data.confidence) || 0,
      source_message_id: data.sourceMessageId,
      telegram_group_id: data.telegramGroupId,
      is_global: data.isGlobal ?? true,
      status: data.status || "pending",
    }])
    .select("*")
    .single();

  if (error) {
    console.error("[db-supabase] createDeadline error:", error);
    throw error;
  }
  return inserted;
}

export async function getMonitoredGroupUsers(groupId: string) {
  // Query student_preferences where telegram_config -> monitoredGroupIds contains groupId
  const { data, error } = await supabase
    .from("student_preferences")
    .select("user_id, telegram_config, automation_config, notifications_config, reminders_config, calendar_config, timezone")
    .contains("telegram_config", { monitoredGroupIds: [groupId] });

  if (error) {
    console.error("[db-supabase] getMonitoredGroupUsers error:", error);
    return [];
  }
  return data;
}

export async function deleteUnsentReminders(userId: string, deadlineId: string) {
  const { error } = await supabase
    .from("reminders")
    .delete()
    .eq("user_id", userId)
    .eq("deadline_id", deadlineId)
    .eq("sent", false);

  if (error) {
    console.error("[db-supabase] deleteUnsentReminders error:", error);
  }
}

export async function createReminder(data: Record<string, any>) {
  const { data: inserted, error } = await supabase
    .from("reminders")
    .insert([{
      user_id: data.userId,
      deadline_id: data.deadlineId,
      scheduled_at: new Date(data.scheduledAt).toISOString(),
      minutes_before_deadline: data.minutesBeforeDeadline,
      offset_preset: data.offset || "custom",
      channels: data.channels || ["browser", "dashboard"],
      sent: data.sent ?? false,
      title: data.title,
      message: data.message,
      priority: data.priority || "medium",
      status: data.status || "active",
      enabled: data.enabled ?? true,
      ai_suggested: data.aiSuggested ?? false,
      repeat_rule: data.repeatRule || "none",
      escalation_level: data.escalationLevel || "normal",
      reminder_style: data.reminderStyle || "balanced",
      ai_summary: data.aiSummary,
    }])
    .select("*")
    .single();

  if (error) {
    console.error("[db-supabase] createReminder error:", error);
    throw error;
  }
  return inserted;
}

export async function getDueReminders() {
  const nowStr = new Date().toISOString();
  const { data, error } = await supabase
    .from("reminders")
    .select("*, deadlines(*)")
    .eq("enabled", true)
    .eq("sent", false)
    .in("status", ["active", "snoozed"])
    .lte("scheduled_at", nowStr)
    .or(`snooze_until.is.null,snooze_until.lte.${nowStr}`);

  if (error) {
    console.error("[db-supabase] getDueReminders error:", error);
    throw error;
  }
  return data;
}

export async function markReminderSent(reminderId: string, now: Date) {
  const { error } = await supabase
    .from("reminders")
    .update({
      sent: true,
      status: "completed",
      last_notified_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", reminderId);

  if (error) {
    console.error("[db-supabase] markReminderSent error:", error);
    throw error;
  }
}

export async function snoozeReminder(reminderId: string, snoozeMinutes: number) {
  const snoozeUntil = new Date(Date.now() + snoozeMinutes * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("reminders")
    .update({
      status: "snoozed",
      sent: false,
      snooze_until: snoozeUntil,
      updated_at: new Date().toISOString()
    })
    .eq("id", reminderId);

  if (error) {
    console.error("[db-supabase] snoozeReminder error:", error);
    throw error;
  }
}

export async function getCalendarEventMap(userId: string, deadlineId: string, dedupKey?: string) {
  let query = supabase
    .from("calendar_event_maps")
    .select("*")
    .eq("user_id", userId);

  if (dedupKey) {
    query = query.or(`deadline_id.eq.${deadlineId},dedup_key.eq.${dedupKey}`);
  } else {
    query = query.eq("deadline_id", deadlineId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[db-supabase] getCalendarEventMap error:", error);
  }
  return data;
}

export async function linkDeadlineIdToEventMap(mapId: string, deadlineId: string) {
  const { error } = await supabase
    .from("calendar_event_maps")
    .update({ deadline_id: deadlineId })
    .eq("id", mapId);

  if (error) {
    console.error("[db-supabase] linkDeadlineIdToEventMap error:", error);
  }
}

export async function createCalendarEventMap(userId: string, deadlineId: string, googleEventId: string, dedupKey?: string, etag?: string) {
  const { data, error } = await supabase
    .from("calendar_event_maps")
    .upsert([{
      user_id: userId,
      deadline_id: deadlineId,
      google_event_id: googleEventId,
      dedup_key: dedupKey,
      etag: etag,
    }], { onConflict: "user_id, deadline_id" })
    .select("*")
    .single();

  if (error) {
    console.error("[db-supabase] createCalendarEventMap error:", error);
    throw error;
  }
  return data;
}

export async function deleteCalendarEventMap(userId: string, deadlineId: string) {
  const { data, error } = await supabase
    .from("calendar_event_maps")
    .delete()
    .eq("user_id", userId)
    .eq("deadline_id", deadlineId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[db-supabase] deleteCalendarEventMap error:", error);
  }
  return data;
}

export async function createNotificationLog(data: Record<string, any>) {
  const { data: inserted, error } = await supabase
    .from("notification_logs")
    .insert([{
      user_id: data.userId,
      reminder_id: data.reminderId,
      channel: data.channel,
      title: data.title,
      body: data.body,
      escalation_level: data.escalationLevel || "normal",
    }])
    .select("*")
    .single();

  if (error) {
    console.error("[db-supabase] createNotificationLog error:", error);
  }
  return inserted;
}

export async function createAiAutomationLog(data: Record<string, any>) {
  const { data: inserted, error } = await supabase
    .from("ai_automation_logs")
    .insert([{
      user_id: data.userId,
      type: data.type,
      summary: data.summary,
      metadata: data.metadata || {},
    }])
    .select("*")
    .single();

  if (error) {
    console.error("[db-supabase] createAiAutomationLog error:", error);
  }
  return inserted;
}

export async function storeTelegramMessage(data: Record<string, any>) {
  const { data: inserted, error } = await supabase
    .from("telegram_messages")
    .upsert([{
      group_id: data.groupId,
      group_title: data.groupTitle,
      message_id: data.messageId,
      text: data.text,
      sender_name: data.senderName,
      sent_at: new Date(data.sentAt).toISOString(),
    }], { onConflict: "group_id, message_id" })
    .select("*")
    .single();

  if (error) {
    console.error("[db-supabase] storeTelegramMessage error:", error);
    return { created: false };
  }
  return { created: true, message: inserted };
}

export async function createFormJob(data: Record<string, any>) {
  const { data: inserted, error } = await supabase
    .from("form_jobs")
    .insert([{
      user_id: data.userId,
      form_url: data.formUrl,
      status: data.status || "pending",
      profile_data: data.profileData,
      auto_submit: data.autoSubmit ?? false,
      trigger_source: data.triggerSource || "dashboard",
      filled_data: data.filledData || {},
    }])
    .select("*")
    .single();

  if (error) {
    console.error("[db-supabase] createFormJob error:", error);
    throw error;
  }
  return inserted;
}

export async function updateFormJob(jobId: string, updateData: Record<string, any>) {
  const { data: updated, error } = await supabase
    .from("form_jobs")
    .update(updateData)
    .eq("id", jobId)
    .select("*")
    .single();

  if (error) {
    console.error("[db-supabase] updateFormJob error:", error);
    throw error;
  }
  return updated;
}

export async function getFormJob(jobId: string, userId: string) {
  const { data, error } = await supabase
    .from("form_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[db-supabase] getFormJob error:", error);
  }
  return data;
}

export async function getFormJobs(userId: string) {
  const { data, error } = await supabase
    .from("form_jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[db-supabase] getFormJobs error:", error);
    return [];
  }
  return data;
}
