import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { Deadline } from "@/models/Deadline";
import { CalendarEventMap } from "@/models/CalendarEventMap";
import { requireAuth } from "@/lib/api-auth";
import { StudentPreferences } from "@/models/StudentPreferences";
import { syncDeadlineToGoogleCalendar } from "@/lib/calendar/sync-deadline";
import { listPrimaryCalendarEvents } from "@/lib/calendar/google-calendar";

export const runtime = "nodejs";

type CalendarUserFields = {
  googleCalendarConnected?: boolean;
  googleCalendarRefreshToken?: string;
  googleCalendarAccessToken?: string;
  googleCalendarAccessTokenExpires?: Date;
};

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    await connectDB();

    const { searchParams } = new URL(req.url);
    const fromQ = searchParams.get("from");
    const toQ = searchParams.get("to");

    let timeMin: Date;
    let timeMax: Date;
    if (fromQ && toQ) {
      timeMin = new Date(fromQ);
      timeMax = new Date(toQ);
    } else {
      timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      timeMax = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    }

    const prefs = await StudentPreferences.findOne({ userId: user.id });
    const timeZone = prefs?.timezone || "Asia/Kolkata";

    const dbUser = await User.findById(user.id).select(
      "googleCalendarConnected googleCalendarRefreshToken googleCalendarAccessToken googleCalendarAccessTokenExpires"
    );
    const u = (dbUser?.toObject() || {}) as CalendarUserFields;
    let connected = !!(u.googleCalendarRefreshToken || u.googleCalendarAccessToken);
    if (!connected && u.googleCalendarConnected) {
      connected = true;
    }

    let googleEvents: Awaited<ReturnType<typeof listPrimaryCalendarEvents>> = [];
    let googleFetchError: string | null = null;

    if (u.googleCalendarRefreshToken || u.googleCalendarAccessToken) {
      try {
        googleEvents = await listPrimaryCalendarEvents(user.id, {
          timeMin,
          timeMax,
          maxResults: 500,
        });
        connected = true;
      } catch (e) {
        googleFetchError = e instanceof Error ? e.message : "Could not load Google Calendar";
      }
    }

    const rangePadStart = new Date(timeMin.getTime() - 24 * 60 * 60 * 1000);
    const rangePadEnd = new Date(timeMax.getTime() + 24 * 60 * 60 * 1000);

    const deadlines = await Deadline.find({
      $or: [{ userId: user.id }, { isGlobal: true }],
      deadline: { $gte: rangePadStart, $lte: rangePadEnd },
    })
      .sort({ deadline: 1 })
      .limit(200)
      .lean();

    const maps = await CalendarEventMap.find({ userId: user.id }).lean();
    const mapByDeadline = new Map(maps.map((m) => [String(m.deadlineId), m.googleEventId]));
    const syncedGoogleIds = new Set(
      maps.map((m) => m.googleEventId).filter((id): id is string => typeof id === "string" && id.length > 0)
    );

    const events = deadlines.map((d) => ({
      id: String(d._id),
      source: "placemint" as const,
      title: `${d.company} — ${d.role}`,
      company: d.company,
      role: d.role,
      start: d.deadline instanceof Date ? d.deadline.toISOString() : String(d.deadline),
      status: d.status,
      eligibility: d.eligibility ?? "",
      notes: d.notes ?? "",
      links: d.links ?? [],
      isGlobal: !!d.isGlobal,
      userId: d.userId ? String(d.userId) : null,
      googleEventId: mapByDeadline.get(String(d._id)) ?? null,
    }));

    const googleMapped = googleEvents
      .filter((g) => !syncedGoogleIds.has(g.id))
      .map((g) => ({
        id: g.id,
        source: "google" as const,
        title: g.title,
        start: g.start,
        end: g.end,
        htmlLink: g.htmlLink,
        status: g.status,
        description: g.description ?? null,
        location: g.location ?? null,
        allDay: g.allDay ?? false,
        googleEventId: g.id,
      }));

    const merged = [...events, ...googleMapped].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );

    return NextResponse.json({
      connected,
      googleFetchError,
      timeZone,
      range: { from: timeMin.toISOString(), to: timeMax.toISOString() },
      counts: {
        googleFromApi: googleEvents.length,
        googleShown: googleMapped.length,
        deadlines: events.length,
        merged: merged.length,
        hiddenSyncedGoogle: googleEvents.length - googleMapped.length,
      },
      googleEvents: googleMapped,
      events,
      merged,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const { action } = await req.json();
    await connectDB();

    if (action === "connect") {
      return NextResponse.json({
        connected: false,
        message:
          "Use Sign in with Google (same account) to grant Calendar access — tokens are saved automatically. If you use email/password, add Google login once from the login page.",
        oauthHint: "nextauth_google",
      });
    }

    if (action === "sync") {
      const prefs = await StudentPreferences.findOne({ userId: user.id });
      if (prefs?.automation?.masterEnabled === false) {
        return NextResponse.json({ error: "Automation is turned off" }, { status: 403 });
      }
      if (prefs?.calendar?.autoSync === false) {
        return NextResponse.json({ error: "Calendar auto-sync disabled in settings" }, { status: 403 });
      }

      const dbUser = await User.findById(user.id).select(
        "googleCalendarRefreshToken googleCalendarAccessToken googleCalendarConnected"
      );
      const u = (dbUser?.toObject() || {}) as CalendarUserFields;
      if (!u.googleCalendarRefreshToken && !u.googleCalendarAccessToken) {
        return NextResponse.json(
          { error: "Google Calendar not connected. Sign in with Google to link your calendar." },
          { status: 400 }
        );
      }

      const deadlines = await Deadline.find({
        $or: [{ userId: user.id }, { isGlobal: true }],
        deadline: { $gte: new Date() },
      }).lean();

      let created = 0;
      let updated = 0;
      let errors = 0;
      for (const d of deadlines) {
        try {
          const r = await syncDeadlineToGoogleCalendar(user.id, d);
          if ("action" in r && r.action === "created") created += 1;
          else if ("action" in r && r.action === "updated") updated += 1;
          else if ("error" in r) errors += 1;
        } catch {
          errors += 1;
        }
      }

      return NextResponse.json({
        synced: deadlines.length,
        created,
        updated,
        errors,
        message: `Synced ${deadlines.length} deadline(s) to Google Calendar`,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
