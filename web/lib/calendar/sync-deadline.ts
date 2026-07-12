/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  getStudentPreferences,
  getCalendarEventMap,
  linkDeadlineIdToEventMap,
  createCalendarEventMap,
  deleteCalendarEventMap,
  createAiAutomationLog,
} from "@/lib/db-supabase";
import { insertCalendarEvent, patchCalendarEvent, deleteCalendarEvent } from "@/lib/calendar/google-calendar";

export async function syncDeadlineToGoogleCalendar(
  userId: string,
  deadline: { _id: any; company: string; role: string; deadline: Date; links: string[]; eligibility: string; telegramGroupId?: string }
) {
  const prefs = await getStudentPreferences(userId);
  const calendarConfig = prefs?.calendar_config || {};
  if (calendarConfig.autoCreateEvents === false && calendarConfig.autoSync === false) {
    return { skipped: true as const, reason: "preferences" };
  }

  const timeZone = prefs?.timezone || "Asia/Kolkata";
  
  // Calculate unique de-duplication key
  const companyClean = (deadline.company || "").trim().toLowerCase();
  const dlDateStr = deadline.deadline ? new Date(deadline.deadline).toISOString().slice(0, 10) : "";
  const groupClean = (deadline.telegramGroupId || "").trim();
  const dedupKey = companyClean && dlDateStr && groupClean ? `${companyClean}|${dlDateStr}|${groupClean}` : undefined;

  const map = await getCalendarEventMap(userId, String(deadline._id), dedupKey);
  if (map && String(map.deadline_id) !== String(deadline._id)) {
    // Found via dedupKey, let's link the new ID
    await linkDeadlineIdToEventMap(map.id, String(deadline._id));
  }

  try {
    if (map?.google_event_id) {
      if (calendarConfig.autoUpdateEvents === false) {
        return { skipped: true as const, reason: "auto_update_disabled" };
      }
      await patchCalendarEvent(userId, map.google_event_id, deadline, timeZone);
      await createAiAutomationLog({
        userId,
        type: "calendar_sync",
        summary: `Updated Google Calendar event for ${deadline.company} (repost/edit)`,
        metadata: { deadlineId: String(deadline._id), eventId: map.google_event_id },
      });
      return { ok: true as const, action: "updated" as const, eventId: map.google_event_id };
    }

    const inserted = await insertCalendarEvent(userId, deadline, timeZone);
    if ("error" in inserted) {
      await createAiAutomationLog({
        userId,
        type: "calendar_error",
        summary: `Calendar not connected — could not create event for ${deadline.company}`,
        metadata: { deadlineId: String(deadline._id) },
      });
      return inserted;
    }

    await createCalendarEventMap(userId, String(deadline._id), inserted.eventId, dedupKey, inserted.etag || undefined);

    await createAiAutomationLog({
      userId,
      type: "calendar_sync",
      summary: `Created Google Calendar event for ${deadline.company}`,
      metadata: { deadlineId: String(deadline._id), eventId: inserted.eventId },
    });
    return { ok: true as const, action: "created" as const, eventId: inserted.eventId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    
    // Check if Google Calendar API refresh token expired or failed
    if (msg.includes("invalid_grant") || msg.includes("refresh_token") || msg.includes("No access, refresh or API key is set")) {
      try {
        const { sendTelegramAlertToUser } = await import("@/lib/notifications/twilio");
        await sendTelegramAlertToUser(
          "⚠️ PlaceMint AI Alert: Your Google Calendar integration is disconnected (OAuth token expired). Please open your dashboard settings and click Connect Google Calendar to resume automated syncing."
        );
      } catch (tgErr) {
        console.error("[syncDeadlineToGoogleCalendar] Failed to send DM:", tgErr);
      }
    }

    await createAiAutomationLog({
      userId,
      type: "calendar_error",
      summary: `Google Calendar error: ${msg}`,
      metadata: { deadlineId: String(deadline._id) },
    });
    throw e;
  }
}

export async function removeDeadlineFromGoogleCalendar(userId: string, deadlineId: string) {
  const map = await deleteCalendarEventMap(userId, deadlineId);
  if (!map?.google_event_id) return { ok: true as const };
  await deleteCalendarEvent(userId, map.google_event_id);
  await createAiAutomationLog({
    userId,
    type: "calendar_sync",
    summary: "Removed Google Calendar event for deleted or cleared deadline",
    metadata: { deadlineId, eventId: map.google_event_id },
  });
  return { ok: true as const };
}
