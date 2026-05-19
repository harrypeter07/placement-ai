import { connectDB } from "@/lib/mongodb";
import { CalendarEventMap } from "@/models/CalendarEventMap";
import { StudentPreferences } from "@/models/StudentPreferences";
import type { IDeadline } from "@/models/Deadline";
import { insertCalendarEvent, patchCalendarEvent, deleteCalendarEvent } from "@/lib/calendar/google-calendar";
import { AiAutomationLog } from "@/models/AiAutomationLog";

export async function syncDeadlineToGoogleCalendar(
  userId: string,
  deadline: Pick<IDeadline, "_id" | "company" | "role" | "deadline" | "links" | "eligibility">
) {
  await connectDB();
  const prefs = await StudentPreferences.findOne({ userId });
  if (prefs?.calendar?.autoCreateEvents === false && prefs?.calendar?.autoSync === false) {
    return { skipped: true as const, reason: "preferences" };
  }

  const timeZone = prefs?.timezone || "Asia/Kolkata";
  const map = await CalendarEventMap.findOne({ userId, deadlineId: deadline._id });

  try {
    if (map?.googleEventId) {
      if (prefs?.calendar?.autoUpdateEvents === false) {
        return { skipped: true as const, reason: "auto_update_disabled" };
      }
      await patchCalendarEvent(userId, map.googleEventId, deadline, timeZone);
      await AiAutomationLog.create({
        userId,
        type: "calendar_sync",
        summary: `Updated Google Calendar event for ${deadline.company}`,
        metadata: { deadlineId: String(deadline._id), eventId: map.googleEventId },
      });
      return { ok: true as const, action: "updated" as const, eventId: map.googleEventId };
    }

    const inserted = await insertCalendarEvent(userId, deadline, timeZone);
    if ("error" in inserted) {
      await AiAutomationLog.create({
        userId,
        type: "calendar_error",
        summary: `Calendar not connected — could not create event for ${deadline.company}`,
        metadata: { deadlineId: String(deadline._id) },
      });
      return inserted;
    }

    await CalendarEventMap.findOneAndUpdate(
      { userId, deadlineId: deadline._id },
      { userId, deadlineId: deadline._id, googleEventId: inserted.eventId, etag: inserted.etag },
      { upsert: true, new: true }
    );

    await AiAutomationLog.create({
      userId,
      type: "calendar_sync",
      summary: `Created Google Calendar event for ${deadline.company}`,
      metadata: { deadlineId: String(deadline._id), eventId: inserted.eventId },
    });
    return { ok: true as const, action: "created" as const, eventId: inserted.eventId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await AiAutomationLog.create({
      userId,
      type: "calendar_error",
      summary: `Google Calendar error: ${msg}`,
      metadata: { deadlineId: String(deadline._id) },
    });
    throw e;
  }
}

export async function removeDeadlineFromGoogleCalendar(userId: string, deadlineId: string) {
  await connectDB();
  const map = await CalendarEventMap.findOneAndDelete({ userId, deadlineId });
  if (!map?.googleEventId) return { ok: true as const };
  await deleteCalendarEvent(userId, map.googleEventId);
  await AiAutomationLog.create({
    userId,
    type: "calendar_sync",
    summary: "Removed Google Calendar event for deleted or cleared deadline",
    metadata: { deadlineId, eventId: map.googleEventId },
  });
  return { ok: true as const };
}
