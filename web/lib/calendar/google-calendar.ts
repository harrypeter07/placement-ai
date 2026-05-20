import { google } from "googleapis";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import type { IDeadline } from "@/models/Deadline";

const CALLBACK_PATH = "/api/auth/callback/google";

function getOAuthRedirectUri() {
  const base = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${CALLBACK_PATH}`;
}

export async function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, getOAuthRedirectUri());
}

export async function getCalendarClientForUser(userId: string) {
  await connectDB();
  const oauth2 = await getOAuth2Client();
  if (!oauth2) return null;

  const user = await User.findById(userId).select(
    "googleCalendarRefreshToken googleCalendarAccessToken googleCalendarAccessTokenExpires"
  );
  if (!user?.googleCalendarRefreshToken && !user?.googleCalendarAccessToken) {
    return null;
  }

  oauth2.setCredentials({
    refresh_token: user.googleCalendarRefreshToken || undefined,
    access_token: user.googleCalendarAccessToken || undefined,
    expiry_date: user.googleCalendarAccessTokenExpires,
  });

  oauth2.on("tokens", async (tokens) => {
    await User.findByIdAndUpdate(userId, {
      ...(tokens.access_token && { googleCalendarAccessToken: tokens.access_token }),
      ...(tokens.expiry_date != null && { googleCalendarAccessTokenExpires: tokens.expiry_date }),
      ...(tokens.refresh_token && { googleCalendarRefreshToken: tokens.refresh_token }),
    });
  });

  return google.calendar({ version: "v3", auth: oauth2 });
}

export function buildDeadlineEventBody(
  deadline: Pick<IDeadline, "company" | "role" | "deadline" | "links" | "eligibility">,
  timeZone: string
) {
  const start = new Date(deadline.deadline);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const desc = [
    deadline.eligibility ? `Eligibility: ${deadline.eligibility}` : "",
    deadline.links?.length ? `Links:\n${deadline.links.join("\n")}` : "",
    "\n— PlaceMint AI",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    summary: `${deadline.company} — ${deadline.role}`,
    description: desc,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
  };
}

export async function insertCalendarEvent(
  userId: string,
  deadline: Pick<IDeadline, "company" | "role" | "deadline" | "links" | "eligibility">,
  timeZone: string
) {
  const cal = await getCalendarClientForUser(userId);
  if (!cal) return { error: "not_connected" as const };

  const body = buildDeadlineEventBody(deadline, timeZone);
  const res = await cal.events.insert({
    calendarId: "primary",
    requestBody: body,
  });
  return { eventId: res.data.id!, etag: res.data.etag };
}

export async function patchCalendarEvent(
  userId: string,
  eventId: string,
  deadline: Pick<IDeadline, "company" | "role" | "deadline" | "links" | "eligibility">,
  timeZone: string
) {
  const cal = await getCalendarClientForUser(userId);
  if (!cal) return { error: "not_connected" as const };

  const body = buildDeadlineEventBody(deadline, timeZone);
  await cal.events.patch({
    calendarId: "primary",
    eventId,
    requestBody: body,
  });
  return { ok: true as const };
}

export async function deleteCalendarEvent(userId: string, eventId: string) {
  const cal = await getCalendarClientForUser(userId);
  if (!cal) return { error: "not_connected" as const };
  try {
    await cal.events.delete({ calendarId: "primary", eventId });
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err?.code === 404) return { ok: true as const };
    throw e;
  }
  return { ok: true as const };
}

export type GoogleCalendarListItem = {
  id: string;
  title: string;
  start: string;
  end?: string;
  htmlLink?: string | null;
  status?: string | null;
  description?: string | null;
  location?: string | null;
  allDay?: boolean;
};

function mapListItem(e: {
  id?: string | null;
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  htmlLink?: string | null;
  status?: string | null;
  description?: string | null;
  location?: string | null;
}): GoogleCalendarListItem | null {
  if (!e.id) return null;
  const start = e.start?.dateTime || e.start?.date || "";
  const end = e.end?.dateTime || e.end?.date || undefined;
  if (!start) return null;
  const allDay = !!(e.start?.date && !e.start?.dateTime);
  return {
    id: e.id,
    title: e.summary || "(No title)",
    start,
    end,
    htmlLink: e.htmlLink,
    status: e.status,
    description: e.description,
    location: e.location,
    allDay,
  };
}

export type ListPrimaryOptions = {
  timeMin?: Date;
  timeMax?: Date;
  daysAhead?: number;
  maxResults?: number;
};

export async function listPrimaryCalendarEvents(
  userId: string,
  options?: ListPrimaryOptions
): Promise<GoogleCalendarListItem[]> {
  const cal = await getCalendarClientForUser(userId);
  if (!cal) return [];

  let timeMin: Date;
  let timeMax: Date;
  if (options?.timeMin && options?.timeMax) {
    timeMin = options.timeMin;
    timeMax = options.timeMax;
  } else {
    const days = options?.daysAhead ?? 21;
    timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
  const maxTotal = options?.maxResults ?? 500;
  // Google treats timeMax as exclusive — pad so last day of the grid is included
  const timeMaxPadded = new Date(timeMax.getTime() + 24 * 60 * 60 * 1000);

  type GEvent = Parameters<typeof mapListItem>[0];
  const items: GEvent[] = [];
  let pageToken: string | undefined;

  do {
    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMaxPadded.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: Math.min(250, maxTotal - items.length),
      pageToken,
    });
    if (res.data.items?.length) items.push(...(res.data.items as GEvent[]));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && items.length < maxTotal);

  return items.map((ev) => mapListItem(ev)).filter((ev): ev is GoogleCalendarListItem => ev !== null);
}

export type GoogleCalendarEventDetail = GoogleCalendarListItem & {
  updated?: string | null;
};

export async function getPrimaryCalendarEvent(
  userId: string,
  eventId: string
): Promise<GoogleCalendarEventDetail | { error: "not_connected" } | { error: "not_found" }> {
  const cal = await getCalendarClientForUser(userId);
  if (!cal) return { error: "not_connected" };
  try {
    const res = await cal.events.get({ calendarId: "primary", eventId });
    const mapped = mapListItem(res.data);
    if (!mapped) return { error: "not_found" };
    return { ...mapped, updated: res.data.updated ?? null };
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err?.code === 404) return { error: "not_found" };
    throw e;
  }
}

export type CreateCalendarEventInput = {
  summary: string;
  description?: string;
  location?: string;
  allDay: boolean;
  /** ISO datetime or YYYY-MM-DD when allDay */
  start: string;
  /** ISO datetime or YYYY-MM-DD (exclusive end day for all-day) when allDay */
  end?: string;
  timeZone: string;
};

export async function createPrimaryCalendarEvent(
  userId: string,
  input: CreateCalendarEventInput
): Promise<{ id: string; htmlLink?: string | null } | { error: "not_connected" }> {
  const cal = await getCalendarClientForUser(userId);
  if (!cal) return { error: "not_connected" };

  let requestBody: Record<string, unknown>;
  if (input.allDay) {
    const startDate = input.start.slice(0, 10);
    let endDate = input.end?.slice(0, 10);
    if (!endDate || endDate <= startDate) {
      const d = new Date(startDate + "T12:00:00");
      d.setUTCDate(d.getUTCDate() + 1);
      endDate = d.toISOString().slice(0, 10);
    }
    requestBody = {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: { date: startDate },
      end: { date: endDate },
    };
  } else {
    const start = new Date(input.start);
    const end = input.end ? new Date(input.end) : new Date(start.getTime() + 60 * 60 * 1000);
    requestBody = {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: { dateTime: start.toISOString(), timeZone: input.timeZone },
      end: { dateTime: end.toISOString(), timeZone: input.timeZone },
    };
  }

  const res = await cal.events.insert({
    calendarId: "primary",
    requestBody,
  });
  return { id: res.data.id!, htmlLink: res.data.htmlLink };
}

export type UpdateCalendarEventInput = Partial<CreateCalendarEventInput>;

export async function updatePrimaryCalendarEvent(
  userId: string,
  eventId: string,
  input: UpdateCalendarEventInput
): Promise<{ ok: true } | { error: "not_connected" | "not_found" }> {
  const cal = await getCalendarClientForUser(userId);
  if (!cal) return { error: "not_connected" };

  let existing;
  try {
    existing = await cal.events.get({ calendarId: "primary", eventId });
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err?.code === 404) return { error: "not_found" };
    throw e;
  }

  const wasAllDay = !!(existing.data.start?.date && !existing.data.start?.dateTime);
  const useAllDay = input.allDay !== undefined ? input.allDay : wasAllDay;
  const tz = input.timeZone || "UTC";
  const summary = input.summary ?? existing.data.summary ?? "(No title)";
  const description = input.description ?? existing.data.description ?? undefined;
  const location = input.location ?? existing.data.location ?? undefined;

  let requestBody: Record<string, unknown>;
  if (useAllDay) {
    const startDate =
      input.start?.slice(0, 10) || existing.data.start?.date || new Date().toISOString().slice(0, 10);
    let endDate =
      input.end?.slice(0, 10) ||
      existing.data.end?.date ||
      (() => {
        const d = new Date(startDate + "T12:00:00");
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().slice(0, 10);
      })();
    if (endDate <= startDate) {
      const d = new Date(startDate + "T12:00:00");
      d.setUTCDate(d.getUTCDate() + 1);
      endDate = d.toISOString().slice(0, 10);
    }
    requestBody = {
      summary,
      description,
      location,
      start: { date: startDate },
      end: { date: endDate },
    };
  } else {
    const startIso =
      input.start ||
      existing.data.start?.dateTime ||
      (existing.data.start?.date ? `${existing.data.start.date}T12:00:00.000Z` : undefined) ||
      new Date().toISOString();
    const endIso =
      input.end ||
      existing.data.end?.dateTime ||
      (existing.data.end?.date ? `${existing.data.end.date}T12:00:00.000Z` : undefined) ||
      new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();
    requestBody = {
      summary,
      description,
      location,
      start: { dateTime: new Date(startIso).toISOString(), timeZone: tz },
      end: { dateTime: new Date(endIso).toISOString(), timeZone: tz },
    };
  }

  try {
    await cal.events.patch({
      calendarId: "primary",
      eventId,
      requestBody,
    });
    return { ok: true };
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err?.code === 404) return { error: "not_found" };
    throw e;
  }
}
