import {
  findDuplicateDeadline,
  createDeadline,
  getMonitoredGroupUsers,
  deleteUnsentReminders,
  createReminder,
} from "@/lib/db-supabase";
import { syncDeadlineToGoogleCalendar } from "@/lib/calendar/sync-deadline";
import { priorityToEscalation } from "@/lib/reminders/escalation";
import { extractPlacementFromText } from "@/lib/gemini";
import type { ITelegramMessage } from "@/models/TelegramMessage";

// Fast regex check to avoid calling Gemini API on casual chat noise
const PLACEMENT_KEYWORDS = /hiring|apply|deadline|intern|job|salary|lpa|stipend|cgpa|eligibility|register/i;

export async function autoProcessNewMessage(message: ITelegramMessage, groupId: string) {
  if (!message.text || !PLACEMENT_KEYWORDS.test(message.text)) {
    return { skipped: true, reason: "noise" };
  }

  const extracted = await extractPlacementFromText(message.text);
  if (extracted.confidence < 0.35 || !extracted.company) {
    return { skipped: true, reason: "low_confidence", extracted };
  }

  // Find if a duplicate global deadline exists (same company, role, and source message)
  const existing = await findDuplicateDeadline(
    extracted.company,
    extracted.role || "Role TBD",
    message.messageId,
    groupId
  );

  let deadlineDoc;
  if (existing) {
    deadlineDoc = existing;
    // We just keep using the existing PostgreSQL row matching it
  } else {
    deadlineDoc = await createDeadline({
      company: extracted.company,
      role: extracted.role || "Role TBD",
      deadline: extracted.deadline ? new Date(extracted.deadline) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      eligibility: extracted.eligibility || "",
      type: extracted.type || "full-time",
      links: extracted.links || [],
      salary: extracted.salary || "",
      confidence: extracted.confidence,
      sourceMessageId: message.messageId,
      telegramGroupId: groupId,
      isGlobal: true,
      status: "pending",
    });
  }

  // Find all students who have turned Monitor ON for this group in Supabase
  const usersPrefs = await getMonitoredGroupUsers(groupId);
  const syncedCount = { calendars: 0, reminders: 0 };

  for (const prefs of usersPrefs) {
    const userId = String(prefs.user_id);
    const automationConfig = prefs.automation_config || {};
    const telegramConfig = prefs.telegram_config || {};
    const remindersConfig = prefs.reminders_config || {};
    const notificationsConfig = prefs.notifications_config || {};

    if (automationConfig.masterEnabled === false) continue;

    // 1. Google Calendar Auto-Sync (if enabled)
    if (
      telegramConfig.autoCreateDeadlines !== false &&
      prefs.calendar_config?.autoSync !== false &&
      prefs.calendar_config?.autoCreateEvents !== false
    ) {
      try {
        // Map postgres row columns back to pick keys expected by sync handler
        await syncDeadlineToGoogleCalendar(userId, {
          _id: deadlineDoc.id,
          company: deadlineDoc.company,
          role: deadlineDoc.role,
          deadline: new Date(deadlineDoc.deadline_date),
          links: deadlineDoc.links,
          eligibility: deadlineDoc.eligibility,
          telegramGroupId: deadlineDoc.telegram_group_id,
        });
        syncedCount.calendars += 1;
      } catch (err) {
        console.error(`[AutoProcess] Calendar sync failed for user ${userId}:`, err);
      }
    }

    // 2. Auto-create Reminder Alarms (if enabled)
    if (
      telegramConfig.autoCreateReminders !== false &&
      automationConfig.aiAutoReminders !== false
    ) {
      const dlTime = new Date(deadlineDoc.deadline_date).getTime();
      const offsets = remindersConfig.defaultOffsetsMinutes || [24 * 60, 6 * 60, 60, 15];

      // Delete existing unsent reminders for this deadline (repost safety)
      await deleteUnsentReminders(userId, deadlineDoc.id);

      const urgency = deadlineDoc.confidence >= 0.85 ? "high" : "medium";
      const priority = urgency === "high" ? "high" : "medium";

      for (const minutes of offsets) {
        const scheduledAt = new Date(dlTime - minutes * 60 * 1000);
        if (scheduledAt <= new Date()) continue; // Skip past dates

        // Default channels: browser, dashboard, and custom phoneCall if enabled
        const channels = ["browser", "dashboard"];
        if (notificationsConfig.phoneCall) {
          channels.push("phoneCall");
        }

        await createReminder({
          userId,
          deadlineId: deadlineDoc.id,
          scheduledAt,
          minutesBeforeDeadline: minutes,
          offset: "custom",
          channels,
          title: `Deadline approaching: ${deadlineDoc.company}`,
          message: `Application deadline for ${deadlineDoc.company} - ${deadlineDoc.role}. Links: ${(deadlineDoc.links || []).join(", ") || "None"}`,
          aiSummary: `${deadlineDoc.company} (${deadlineDoc.role}) deadline`,
          priority,
          status: "active",
          enabled: true,
          aiSuggested: true,
          sent: false,
          repeatRule: "none",
          escalationLevel: priorityToEscalation(priority),
          reminderStyle: priority === "high" ? "aggressive" : "balanced",
        });
        syncedCount.reminders += 1;
      }
    }
  }

  return { ok: true, deadlineId: deadlineDoc.id, syncedCount };
}
