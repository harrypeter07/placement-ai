import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Reminder } from "@/models/Reminder";
import { requireAuth } from "@/lib/api-auth";
export const runtime = "nodejs";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("snooze"),
    snoozeMinutes: z.number().min(5).max(10080),
  }),
  z.object({
    action: z.literal("pause"),
  }),
  z.object({
    action: z.literal("resume"),
  }),
  z.object({
    action: z.literal("complete"),
  }),
  z.object({
    action: z.literal("edit"),
    title: z.string().optional(),
    message: z.string().optional(),
    scheduledAt: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  }),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    await connectDB();
    const r = await Reminder.findOne({ _id: id, userId: user.id });
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = Date.now();

    switch (parsed.data.action) {
      case "snooze": {
        const base = Math.max(now, r.scheduledAt.getTime());
        r.scheduledAt = new Date(base + parsed.data.snoozeMinutes * 60 * 1000);
        r.status = "active";
        r.snoozeUntil = new Date(now + parsed.data.snoozeMinutes * 60 * 1000);
        break;
      }
      case "pause":
        r.status = "paused";
        r.enabled = false;
        break;
      case "resume":
        r.status = "active";
        r.enabled = true;
        break;
      case "complete":
        r.status = "completed";
        r.sent = true;
        r.enabled = false;
        break;
      case "edit":
        if (parsed.data.title != null) r.title = parsed.data.title;
        if (parsed.data.message != null) r.message = parsed.data.message;
        if (parsed.data.scheduledAt) r.scheduledAt = new Date(parsed.data.scheduledAt);
        if (parsed.data.priority) r.priority = parsed.data.priority;
        break;
      default:
        break;
    }
    await r.save();
    return NextResponse.json(r);
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
    const r = await Reminder.findOneAndDelete({ _id: id, userId: user.id });
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
