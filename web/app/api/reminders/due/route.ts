import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Reminder } from "@/models/Reminder";
import { StudentPreferences } from "@/models/StudentPreferences";
import { NotificationLog } from "@/models/NotificationLog";
import { requireAuth } from "@/lib/api-auth";
import {
  escalationRepeatMinutes,
  nextEscalation,
  priorityToEscalation,
} from "@/lib/reminders/escalation";
import { isQuietHoursNow } from "@/lib/reminders/quiet-hours";
import { sendPushToUser } from "@/lib/firebase/send-push";

export const runtime = "nodejs";

const actionSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(["ack", "snooze", "escalate"]),
  snoozeMinutes: z.number().min(5).max(24 * 60).optional(),
});

/** Due reminders with smart escalation */
export async function GET() {
  try {
    const user = await requireAuth();
    await connectDB();
    const now = new Date();
    const prefs = await StudentPreferences.findOne({ userId: user.id }).lean();

    const quiet = isQuietHoursNow(
      prefs?.notifications?.quietHoursStart || "22:00",
      prefs?.notifications?.quietHoursEnd || "07:00",
      !!prefs?.notifications?.quietHoursEnabled
    );

    const candidates = await Reminder.find({
      userId: user.id,
      enabled: true,
      status: { $in: ["active", "snoozed"] },
      $or: [{ snoozeUntil: null }, { snoozeUntil: { $lte: now } }],
    })
      .populate("deadlineId")
      .sort({ scheduledAt: 1 })
      .limit(40)
      .lean();

    const due = [];
    for (const r of candidates) {
      if (quiet && (r.escalationLevel === "soft" || r.escalationLevel === "normal")) continue;

      const scheduled = new Date(r.scheduledAt);
      const last = r.lastNotifiedAt ? new Date(r.lastNotifiedAt) : null;
      let level = r.escalationLevel || priorityToEscalation(r.priority);

      if (now >= scheduled) {
        if (!last) {
          due.push({ ...r, escalationLevel: level });
          continue;
        }
        const repeatMs = escalationRepeatMinutes(level) * 60 * 1000;
        if (now.getTime() - last.getTime() >= repeatMs) {
          level = nextEscalation(level);
          due.push({ ...r, escalationLevel: level });
        }
      }
    }

    return NextResponse.json(due.slice(0, 15));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

/** ack / snooze / escalate after delivery */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    await connectDB();
    const now = new Date();

    if (parsed.data.action === "ack") {
      await Reminder.updateMany(
        { _id: { $in: parsed.data.ids }, userId: user.id },
        { $set: { sent: true, status: "completed" } }
      );
      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === "snooze") {
      const until = new Date(now.getTime() + (parsed.data.snoozeMinutes || 60) * 60 * 1000);
      await Reminder.updateMany(
        { _id: { $in: parsed.data.ids }, userId: user.id },
        { $set: { status: "snoozed", snoozeUntil: until, sent: false } }
      );
      return NextResponse.json({ ok: true, snoozeUntil: until });
    }

    if (parsed.data.action === "escalate") {
      const reminders = await Reminder.find({
        _id: { $in: parsed.data.ids },
        userId: user.id,
      });
      for (const r of reminders) {
        const level = nextEscalation(r.escalationLevel || "normal");
        r.escalationLevel = level;
        r.escalationCount = (r.escalationCount || 0) + 1;
        r.lastNotifiedAt = now;
        r.sent = false;
        await r.save();
        await NotificationLog.create({
          userId: user.id,
          reminderId: r._id,
          channel: "dashboard",
          title: r.title || "Reminder escalated",
          body: r.message || "",
          escalationLevel: level,
        });
        await sendPushToUser(String(user.id), {
          title: r.title || "PlaceMint reminder",
          body: r.aiSummary || r.message || "",
          url: "/dashboard/reminders",
          level,
        });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
