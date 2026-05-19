import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { StudentPreferences } from "@/models/StudentPreferences";
import { requireAuth } from "@/lib/api-auth";
import {
  deleteCalendarEvent,
  getPrimaryCalendarEvent,
  updatePrimaryCalendarEvent,
} from "@/lib/calendar/google-calendar";

export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  allDay: z.boolean().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await requireAuth();
    const { eventId } = await params;
    const r = await getPrimaryCalendarEvent(user.id, eventId);
    if ("error" in r) {
      if (r.error === "not_connected") {
        return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });
      }
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await requireAuth();
    const { eventId } = await params;
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    await connectDB();
    const prefs = await StudentPreferences.findOne({ userId: user.id });
    const timeZone = prefs?.timezone || "Asia/Kolkata";

    const r = await updatePrimaryCalendarEvent(user.id, eventId, {
      summary: parsed.data.title,
      description: parsed.data.description ?? undefined,
      location: parsed.data.location ?? undefined,
      allDay: parsed.data.allDay,
      start: parsed.data.start,
      end: parsed.data.end,
      timeZone,
    });

    if ("error" in r) {
      if (r.error === "not_connected") {
        return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });
      }
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const fresh = await getPrimaryCalendarEvent(user.id, eventId);
    if ("error" in fresh) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(fresh);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await requireAuth();
    const { eventId } = await params;
    const r = await deleteCalendarEvent(user.id, eventId);
    if ("error" in r) {
      return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
