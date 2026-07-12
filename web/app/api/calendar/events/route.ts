import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";
import { getStudentPreferences } from "@/lib/db-supabase";
import { createPrimaryCalendarEvent } from "@/lib/calendar/google-calendar";

export const runtime = "nodejs";

const postSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  allDay: z.boolean().default(false),
  start: z.string().min(1),
  end: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const prefs = await getStudentPreferences(user.id);
    const timeZone = prefs?.timezone || "Asia/Kolkata";

    const r = await createPrimaryCalendarEvent(user.id, {
      summary: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      allDay: parsed.data.allDay,
      start: parsed.data.start,
      end: parsed.data.end,
      timeZone,
    });

    if ("error" in r) {
      return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 });
    }

    return NextResponse.json({ id: r.id, htmlLink: r.htmlLink }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
