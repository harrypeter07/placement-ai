import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Deadline } from "@/models/Deadline";
import { Reminder } from "@/models/Reminder";
import { requireAuth } from "@/lib/api-auth";
import { StudentPreferences } from "@/models/StudentPreferences";
import { analyzePlacementForReminders } from "@/lib/ai/reminder-intelligence";
import { AiAutomationLog } from "@/models/AiAutomationLog";

export const runtime = "nodejs";

const OFFSET_PRESET_MINUTES: Record<string, number> = {
  "1d": 24 * 60,
  "6h": 6 * 60,
  "1h": 60,
  "15m": 15,
  custom: 60,
};

const schema = z.object({
  deadlineId: z.string(),
  message: z.string().min(20).max(8000),
  channels: z.array(z.enum(["browser", "email", "telegram", "dashboard"])).default(["browser", "dashboard"]),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    await connectDB();

    const prefs = await StudentPreferences.findOne({ userId: user.id });
    if (prefs?.automation?.aiAutoReminders === false || prefs?.automation?.masterEnabled === false) {
      return NextResponse.json({ error: "AI auto-reminders disabled" }, { status: 403 });
    }

    const deadline = await Deadline.findOne({
      _id: parsed.data.deadlineId,
      $or: [{ userId: user.id }, { isGlobal: true }],
    });
    if (!deadline) return NextResponse.json({ error: "Deadline not found" }, { status: 404 });

    const analysis = await analyzePlacementForReminders(parsed.data.message, prefs);
    if (!analysis.shouldRemind || !analysis.isPlacement) {
      await AiAutomationLog.create({
        userId: user.id,
        type: "reminder_skipped",
        summary: "AI chose not to create reminders for this text",
        metadata: { confidence: analysis.confidence },
      });
      return NextResponse.json({ analysis, created: [] });
    }

    await Reminder.deleteMany({
      userId: user.id,
      deadlineId: deadline._id,
      sent: false,
      aiSuggested: true,
    });

    const minuteList = analysis.suggestedOffsetsMinutes;
    const created = [];
    const dl = deadline.deadline.getTime();

    for (const minutes of minuteList) {
      const scheduledAt = new Date(dl - minutes * 60 * 1000);
      if (scheduledAt <= new Date()) continue;

      const offsetPreset = (Object.keys(OFFSET_PRESET_MINUTES).find(
        (k) => k !== "custom" && OFFSET_PRESET_MINUTES[k] === minutes
      ) || "custom") as "1d" | "6h" | "1h" | "15m" | "custom";

      const doc = await Reminder.create({
        userId: user.id,
        deadlineId: deadline._id,
        scheduledAt,
        offset: offsetPreset,
        minutesBeforeDeadline: minutes,
        channels: parsed.data.channels,
        title: analysis.notificationTitle,
        message: analysis.notificationMessage,
        priority: analysis.urgency === "critical" ? "critical" : analysis.urgency === "high" ? "high" : "medium",
        status: "active",
        enabled: true,
        aiSuggested: true,
        sent: false,
      });
      created.push(doc);
    }

    await AiAutomationLog.create({
      userId: user.id,
      type: "reminder_created",
      summary: `AI created ${created.length} reminder(s) for ${deadline.company}`,
      metadata: { deadlineId: String(deadline._id), urgency: analysis.urgency },
    });

    return NextResponse.json({ analysis, created }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
