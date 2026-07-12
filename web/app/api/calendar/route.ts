/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getStudentPreferences } from "@/lib/db-supabase";
import { syncDeadlineToGoogleCalendar } from "@/lib/calendar/sync-deadline";
import { listPrimaryCalendarEvents } from "@/lib/calendar/google-calendar";

export const runtime = "nodejs";

type CalendarUserFields = {
  google_calendar_connected?: boolean;
  google_calendar_refresh_token?: string;
  google_calendar_access_token?: string;
  google_calendar_expires_at?: string | number | null;
};

export async function GET(req: Request) {
  try {
    const user = await requireAuth();

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

    const prefs = await getStudentPreferences(user.id);
    const timeZone = prefs?.timezone || "Asia/Kolkata";

    // Query user Google Calendar fields from Supabase
    const { data: dbUser } = await supabase
      .from("users")
      .select("google_calendar_connected, google_calendar_refresh_token, google_calendar_access_token, google_calendar_expires_at")
      .eq("id", user.id)
      .maybeSingle();

    const u = (dbUser || {}) as CalendarUserFields;
    let connected = !!(u.google_calendar_refresh_token || u.google_calendar_access_token);
    if (!connected && u.google_calendar_connected) {
      connected = true;
    }

    let googleEvents: Awaited<ReturnType<typeof listPrimaryCalendarEvents>> = [];
    let googleFetchError: string | null = null;

    if (u.google_calendar_refresh_token || u.google_calendar_access_token) {
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

    // Fetch deadlines from Supabase
    const { data: deadlines, error: dbErr } = await supabase
      .from("deadlines")
      .select("*")
      .or(`user_id.eq.${user.id},is_global.eq.true`)
      .gte("deadline_date", rangePadStart.toISOString())
      .lte("deadline_date", rangePadEnd.toISOString())
      .order("deadline_date", { ascending: true })
      .limit(200);

    if (dbErr) throw dbErr;

    // Fetch calendar event mappings from Supabase
    const { data: maps } = await supabase
      .from("calendar_event_maps")
      .select("*")
      .eq("user_id", user.id);

    const mapByDeadline = new Map((maps || []).map((m) => [String(m.deadline_id), m.google_event_id]));
    const syncedGoogleIds = new Set(
      (maps || []).map((m) => m.google_event_id).filter((id): id is string => typeof id === "string" && id.length > 0)
    );

    const events = (deadlines || []).map((d) => ({
      id: String(d.id),
      source: "placemint" as const,
      title: `${d.company} — ${d.role}`,
      company: d.company,
      role: d.role,
      start: d.deadline_date,
      status: d.status,
      eligibility: d.eligibility ?? "",
      notes: d.notes ?? "",
      links: d.links ?? [],
      isGlobal: !!d.is_global,
      userId: d.user_id ? String(d.user_id) : null,
      googleEventId: mapByDeadline.get(String(d.id)) ?? null,
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

    if (action === "connect") {
      return NextResponse.json({
        connected: false,
        message:
          "Use Sign in with Google (same account) to grant Calendar access — tokens are saved automatically. If you use email/password, add Google login once from the login page.",
        oauthHint: "nextauth_google",
      });
    }

    if (action === "sync") {
      const prefs = await getStudentPreferences(user.id);
      if (prefs?.automation_config?.masterEnabled === false) {
        return NextResponse.json({ error: "Automation is turned off" }, { status: 403 });
      }
      if (prefs?.calendar_config?.autoSync === false) {
        return NextResponse.json({ error: "Calendar auto-sync disabled in settings" }, { status: 403 });
      }

      // Query Google Calendar tokens from Supabase user
      const { data: dbUser } = await supabase
        .from("users")
        .select("google_calendar_refresh_token, google_calendar_access_token")
        .eq("id", user.id)
        .maybeSingle();

      const u = (dbUser || {}) as CalendarUserFields;
      if (!u.google_calendar_refresh_token && !u.google_calendar_access_token) {
        return NextResponse.json(
          { error: "Google Calendar not connected. Sign in with Google to link your calendar." },
          { status: 400 }
        );
      }

      // Fetch upcoming deadlines from Supabase
      const { data: deadlines } = await supabase
        .from("deadlines")
        .select("*")
        .or(`user_id.eq.${user.id},is_global.eq.true`)
        .gte("deadline_date", new Date().toISOString());

      let created = 0;
      let updated = 0;
      let errors = 0;

      for (const d of (deadlines || [])) {
        try {
          const mappedDeadline = {
            _id: d.id,
            company: d.company,
            role: d.role,
            deadline: new Date(d.deadline_date),
            links: d.links || [],
            eligibility: d.eligibility || "",
            telegramGroupId: d.telegram_group_id || undefined,
          };
          const r = await syncDeadlineToGoogleCalendar(user.id, mappedDeadline);
          if ("action" in r && r.action === "created") created += 1;
          else if ("action" in r && r.action === "updated") updated += 1;
          else if ("error" in r) errors += 1;
        } catch {
          errors += 1;
        }
      }

      return NextResponse.json({
        synced: (deadlines || []).length,
        created,
        updated,
        errors,
        message: `Synced ${(deadlines || []).length} deadline(s) to Google Calendar`,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
