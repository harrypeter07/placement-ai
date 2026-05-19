import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Reminder } from "@/models/Reminder";
import { Deadline } from "@/models/Deadline";
import { requireAuth } from "@/lib/api-auth";
import { StudentPreferences } from "@/models/StudentPreferences";
import { AiAutomationLog } from "@/models/AiAutomationLog";
import type { ReminderOffsetPreset, ReminderPriority } from "@/models/Reminder";

export const runtime = "nodejs";

const OFFSET_PRESET_MINUTES: Record<string, number> = {
  "1d": 24 * 60,
  "6h": 6 * 60,
  "1h": 60,
  "15m": 15,
  custom: 60,
};

function resolveMinutes(r: { minutesBeforeDeadline?: number | null; offset?: string | null }) {
  if (r.minutesBeforeDeadline != null && Number.isFinite(r.minutesBeforeDeadline)) {
    return r.minutesBeforeDeadline;
  }
  if (r.offset && r.offset in OFFSET_PRESET_MINUTES) {
    return OFFSET_PRESET_MINUTES[r.offset];
  }
  return 60;
}

const postSchema = z.object({
  deadlineId: z.string(),
  channels: z.array(z.enum(["browser", "email", "telegram", "dashboard"])),
  offsets: z.array(z.enum(["1d", "6h", "1h", "15m"])).optional(),
  customMinutesBefore: z.array(z.number().min(5).max(43200)).optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  aiSuggested: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await requireAuth();
    await connectDB();
    const reminders = await Reminder.find({ userId: user.id })
      .populate("deadlineId")
      .sort({ scheduledAt: 1 })
      .lean();

    const enriched = reminders.map((r) => ({
      ...r,
      effectiveMinutesBefore: resolveMinutes(r as { minutesBeforeDeadline?: number; offset?: string }),
    }));

    return NextResponse.json(enriched);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    await connectDB();

    const prefs = await StudentPreferences.findOne({ userId: user.id });
    if (prefs?.automation?.masterEnabled === false) {
      return NextResponse.json({ error: "Automation is disabled" }, { status: 403 });
    }

    const deadline = await Deadline.findOne({
      _id: parsed.data.deadlineId,
      $or: [{ userId: user.id }, { isGlobal: true }],
    });
    if (!deadline) {
      return NextResponse.json({ error: "Deadline not found" }, { status: 404 });
    }

    await Reminder.deleteMany({
      userId: user.id,
      deadlineId: deadline._id,
      sent: false,
      status: { $in: ["active", "paused", "snoozed"] },
    });

    const minuteList: number[] =
      parsed.data.customMinutesBefore?.length && parsed.data.customMinutesBefore.length > 0
        ? [...new Set(parsed.data.customMinutesBefore)]
        : (parsed.data.offsets?.length
            ? [...new Set(parsed.data.offsets.map((o) => OFFSET_PRESET_MINUTES[o]))]
            : prefs?.reminders?.defaultOffsetsMinutes?.length
              ? [...new Set(prefs.reminders.defaultOffsetsMinutes)]
              : [24 * 60, 6 * 60, 60]);

    const priority = (parsed.data.priority || "medium") as ReminderPriority;
    const titleBase =
      parsed.data.title ||
      `${deadline.company} — ${deadline.role}`;
    const messageBase =
      parsed.data.message ||
      `Deadline: ${deadline.deadline.toISOString().slice(0, 10)}. Don't miss this opportunity.`;

    const created = [];
    const dl = deadline.deadline.getTime();

    for (const minutes of minuteList) {
      const scheduledAt = new Date(dl - minutes * 60 * 1000);
      if (scheduledAt <= new Date()) continue;

      const offsetPreset = (Object.entries(OFFSET_PRESET_MINUTES).find(([, v]) => v === minutes)?.[0] ||
        "custom") as ReminderOffsetPreset;

      const doc = await Reminder.create({
        userId: user.id,
        deadlineId: deadline._id,
        scheduledAt,
        offset: offsetPreset === "custom" ? "custom" : (offsetPreset as ReminderOffsetPreset),
        minutesBeforeDeadline: minutes,
        channels: parsed.data.channels,
        title: titleBase,
        message: messageBase,
        priority,
        status: "active",
        enabled: true,
        aiSuggested: parsed.data.aiSuggested ?? false,
        sent: false,
      });
      created.push(doc);
    }

    await AiAutomationLog.create({
      userId: user.id,
      type: "reminder_created",
      summary: `Created ${created.length} reminder(s) for ${deadline.company}`,
      metadata: { deadlineId: String(deadline._id) },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
