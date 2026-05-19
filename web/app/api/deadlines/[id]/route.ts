import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Deadline } from "@/models/Deadline";
import { Reminder } from "@/models/Reminder";
import { requireAuth } from "@/lib/api-auth";
import { StudentPreferences } from "@/models/StudentPreferences";
import { syncDeadlineToGoogleCalendar, removeDeadlineFromGoogleCalendar } from "@/lib/calendar/sync-deadline";

export const runtime = "nodejs";

const updateSchema = z.object({
  status: z.enum(["applied", "pending", "missed", "rejected", "oa_scheduled", "interview_scheduled"]).optional(),
  notes: z.string().optional(),
  links: z.array(z.string()).optional(),
  company: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  deadline: z.string().optional(),
  eligibility: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    await connectDB();

    const existing = await Deadline.findOne({
      _id: id,
      $or: [{ userId: user.id }, { isGlobal: true }],
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const wantsCoreEdit =
      parsed.data.company !== undefined ||
      parsed.data.role !== undefined ||
      parsed.data.deadline !== undefined ||
      parsed.data.eligibility !== undefined;

    if (wantsCoreEdit) {
      if (existing.isGlobal || String(existing.userId) !== user.id) {
        return NextResponse.json(
          { error: "You can only edit company, role, or date on deadlines you created." },
          { status: 403 }
        );
      }
    }

    const payload: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) payload.status = parsed.data.status;
    if (parsed.data.notes !== undefined) payload.notes = parsed.data.notes;
    if (parsed.data.links !== undefined) payload.links = parsed.data.links;
    if (parsed.data.company !== undefined) payload.company = parsed.data.company;
    if (parsed.data.role !== undefined) payload.role = parsed.data.role;
    if (parsed.data.deadline !== undefined) payload.deadline = new Date(parsed.data.deadline);
    if (parsed.data.eligibility !== undefined) payload.eligibility = parsed.data.eligibility;

    const deadline = await Deadline.findOneAndUpdate(
      { _id: id, $or: [{ userId: user.id }, { isGlobal: true }] },
      payload,
      { new: true }
    );
    if (!deadline) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const prefs = await StudentPreferences.findOne({ userId: user.id });
    if (
      prefs?.automation?.masterEnabled !== false &&
      prefs?.calendar?.autoSync !== false &&
      prefs?.calendar?.autoUpdateEvents !== false
    ) {
      try {
        await syncDeadlineToGoogleCalendar(user.id, deadline);
      } catch {
        /* calendar optional */
      }
    }

    return NextResponse.json(deadline);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    await connectDB();
    const deleted = await Deadline.findOneAndDelete({ _id: id, userId: user.id });
    if (!deleted) {
      return NextResponse.json({ error: "Not found or not owned" }, { status: 404 });
    }
    await Reminder.deleteMany({ userId: user.id, deadlineId: deleted._id });
    try {
      await removeDeadlineFromGoogleCalendar(user.id, id);
    } catch {
      /* optional */
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
