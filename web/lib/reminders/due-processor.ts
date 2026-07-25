import {
  getDueReminders,
  markReminderSent,
  getStudentPreferences,
  createNotificationLog,
} from "@/lib/db-supabase";
import { makeReminderPhoneCall, sendTelegramAlertToUser } from "@/lib/notifications/twilio";
import { sendPushToUser } from "@/lib/firebase/send-push";
import { isQuietHoursNow } from "@/lib/reminders/quiet-hours";

export async function processDueRemindersInternal(targetUserId?: string) {
  try {
    const now = new Date();
    const candidates = await getDueReminders();
    const processed = [];

    for (const reminder of candidates) {
      const userId = String(reminder.user_id);
      
      // If filtering for a specific user
      if (targetUserId && userId !== targetUserId) continue;

      const deadline = reminder.deadlines;

      if (!deadline) {
        // Orphaned reminder - mark sent to avoid loops
        await markReminderSent(reminder.id, now);
        continue;
      }

      const prefs = await getStudentPreferences(userId);
      const notificationsConfig = prefs?.notifications_config || {};

      // Check quiet hours
      const quiet = isQuietHoursNow(
        notificationsConfig.quietHoursStart || "22:00",
        notificationsConfig.quietHoursEnd || "07:00",
        !!notificationsConfig.quietHoursEnabled
      );

      // Skip normal/soft reminders during quiet hours
      if (quiet && (reminder.escalation_level === "soft" || reminder.escalation_level === "normal")) {
        continue;
      }

      // Check which notification channels are enabled
      const channels: string[] = reminder.channels || [];
      const isCallReminder =
        channels.includes("phoneCall") ||
        channels.includes("phone_call") ||
        reminder.offset_preset === "call" ||
        reminder.reminder_style === "aggressive";

      const userWantsPhone = notificationsConfig.phoneCall !== false && isCallReminder;

      // 1. Log inApp / dashboard notification
      await createNotificationLog({
        userId,
        reminderId: reminder.id,
        channel: "dashboard",
        title: reminder.title || "Placement Reminder",
        body: reminder.message || "",
        escalationLevel: reminder.escalation_level || "normal",
      });

      // 2. Trigger Firebase Push
      if (notificationsConfig.push !== false) {
        try {
          await sendPushToUser(userId, {
            title: reminder.title || "PlaceMint Reminder",
            body: reminder.ai_summary || reminder.message || "",
            url: "/dashboard/reminders",
            level: reminder.escalation_level || "normal",
          });
        } catch (err) {
          console.error(`[DueProcessor] Push failed for user ${userId}:`, err);
        }
      }

      // 3. Trigger Twilio Voice Call (if enabled and is a phone call reminder)
      let phoneCallResult = null;
      if (userWantsPhone) {
        const destinationPhone =
          prefs?.twilio_to_phone ||
          prefs?.twilioToPhone ||
          prefs?.form_profile?.phone ||
          prefs?.formProfile?.phone ||
          process.env.TWILIO_TO_PHONE_NUMBER ||
          "";

        if (destinationPhone) {
          if (quiet) {
            console.log(`[DueProcessor] Quiet hours active for ${userId}. Sending Telegram DM fallback.`);
            const dmText = `⚠️ PlaceMint AI Quiet Hours Alert: Reminder for ${deadline.company} - ${deadline.role} is due. (Scheduled call skipped during quiet hours). Details: ${reminder.message || ""}`;
            await sendTelegramAlertToUser(dmText);
          } else {
            const formUrl = (deadline.links || []).find((l: string) =>
              l.includes("forms.gle") || l.includes("docs.google.com/forms")
            ) || "";

            phoneCallResult = await makeReminderPhoneCall(
              destinationPhone,
              deadline.company,
              deadline.role,
              new Date(deadline.deadline_date),
              userId,
              reminder.id,
              formUrl
            );
            console.log(`[DueProcessor] Placed phone call to ${destinationPhone}:`, phoneCallResult);
          }
        } else {
          console.warn(`[DueProcessor] No destination phone number found for user ${userId}`);
        }
      }

      // Update reminder state to sent
      await markReminderSent(reminder.id, now);

      processed.push({
        id: reminder.id,
        company: deadline.company,
        phoneCallPlaced: !!phoneCallResult?.ok,
      });
    }

    return { ok: true, count: processed.length, processed };
  } catch (err) {
    console.error("[DueProcessor] Error processing due reminders:", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
