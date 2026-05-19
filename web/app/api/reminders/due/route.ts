import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Reminder } from "@/models/Reminder";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const ackSchema = z.object({
  ids: z.array(z.string()).min(1),
});

/** Due reminders — poll from client or future cron */
export async function GET() {
  try {
    const user = await requireAuth();
    await connectDB();
    const now = new Date();
    const list = await Reminder.find({
      userId: user.id,
      enabled: true,
      sent: false,
      status: { $in: ["active", "snoozed"] },
      scheduledAt: { $lte: now },
    })
      .populate("deadlineId")
      .sort({ scheduledAt: 1 })
      .limit(20)
      .lean();

    return NextResponse.json(list);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

/** Mark delivered reminders as sent */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = ackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    await connectDB();
    await Reminder.updateMany(
      { _id: { $in: parsed.data.ids }, userId: user.id },
      { $set: { sent: true, status: "completed" } }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
