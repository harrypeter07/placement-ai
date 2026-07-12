import { NextResponse } from "next/server";
import {
  getDueReminders,
  markReminderSent,
  getStudentPreferences,
  createNotificationLog,
} from "@/lib/db-supabase";
import { makeReminderPhoneCall } from "@/lib/notifications/twilio";
import { sendPushToUser } from "@/lib/firebase/send-push";
import { checkWorkerSecret } from "@/lib/telegram-worker-auth";
import { isQuietHoursNow } from "@/lib/reminders/quiet-hours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleProcess(req);
}

export async function POST(req: Request) {
  return handleProcess(req);
}

async function handleProcess(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const apiKey = searchParams.get("apiKey") || req.headers.get("x-worker-secret");
    
    if (!checkWorkerSecret(apiKey || undefined)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Fetch all active or snoozed reminders that are due from Supabase
    const candidates = await getDueReminders();
    const processed = [];

    for (const reminder of candidates) {
      const userId = String(reminder.user_id);
      const deadline = reminder.deadlines; // Join returned from getDueReminders

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
      const channels = reminder.channels || [];
      const userWantsPhone = notificationsConfig.phoneCall && channels.includes("phoneCall");

      // 1. Trigger inApp / browser logs in Supabase
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
          console.error(`[ProcessDue] Push failed for user ${userId}:`, err);
        }
      }

      // 3. Trigger Twilio Voice Call (if enabled and phone Call is a valid channel)
      let phoneCallResult = null;
      if (userWantsPhone) {
        const destinationPhone = prefs.twilio_to_phone || prefs.form_profile?.phone || process.env.TWILIO_TO_PHONE_NUMBER || "";
        
        if (destinationPhone) {
          if (quiet) {
            console.log(`[ProcessDue] Quiet hours active. Skipping voice call, sending Telegram DM alert instead.`);
            const dmText = `⚠️ PlaceMint AI Quiet Hours Alert: Reminder for ${deadline.company} - ${deadline.role} is due. (Scheduled call skipped during quiet hours). Details: ${reminder.message || ''}`;
            const { sendTelegramAlertToUser } = await import("@/lib/notifications/twilio");
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
          }
        } else {
          console.warn(`[ProcessDue] No destination phone number for user ${userId}`);
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

    return NextResponse.json({
      ok: true,
      processedCount: processed.length,
      processed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
