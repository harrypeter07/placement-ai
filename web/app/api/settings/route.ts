import { z } from "zod";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { StudentPreferences, getDefaultStudentPreferences } from "@/models/StudentPreferences";
import { requireAuth } from "@/lib/api-auth";
import { AiAutomationLog } from "@/models/AiAutomationLog";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    reset: z.literal(true).optional(),
    timezone: z.string().optional(),
    language: z.string().optional(),
    reminders: z
      .object({
        defaultOffsetsMinutes: z.array(z.number().min(5).max(43200)).optional(),
        sound: z.boolean().optional(),
        vibration: z.boolean().optional(),
        defaultEscalation: z.enum(["soft", "normal", "urgent", "critical"]).optional(),
        smartAiMode: z.boolean().optional(),
      })
      .optional(),
    notifications: z
      .object({
        browser: z.boolean().optional(),
        email: z.boolean().optional(),
        telegram: z.boolean().optional(),
        inApp: z.boolean().optional(),
        push: z.boolean().optional(),
        quietHoursEnabled: z.boolean().optional(),
        quietHoursStart: z.string().optional(),
        quietHoursEnd: z.string().optional(),
      })
      .optional(),
    calendar: z
      .object({
        autoSync: z.boolean().optional(),
        autoCreateEvents: z.boolean().optional(),
        autoUpdateEvents: z.boolean().optional(),
      })
      .optional(),
    ai: z
      .object({
        strictness: z.enum(["strict", "balanced", "relaxed"]).optional(),
        urgencySensitivity: z.enum(["low", "medium", "high"]).optional(),
        spamSensitivity: z.enum(["low", "medium", "high"]).optional(),
      })
      .optional(),
    placement: z
      .object({
        preferredCompanies: z.array(z.string()).optional(),
        preferredRoles: z.array(z.string()).optional(),
        dreamCompanies: z.array(z.string()).optional(),
        minPackageLakh: z.number().nullable().optional(),
      })
      .optional(),
    automation: z
      .object({
        masterEnabled: z.boolean().optional(),
        aiAutoReminders: z.boolean().optional(),
        autoCalendarSync: z.boolean().optional(),
        autoPriority: z.boolean().optional(),
        duplicateMerge: z.boolean().optional(),
      })
      .optional(),
    telegram: z
      .object({
        insightMessageCount: z.number().min(5).max(100).optional(),
        insightSinceDate: z.string().nullable().optional(),
        insightsApplyMode: z.enum(["preview", "all", "none"]).optional(),
        insightPinToOverview: z.boolean().optional(),
        monitoredGroupIds: z.array(z.string()).optional(),
        autoInsights: z.boolean().optional(),
        autoCreateDeadlines: z.boolean().optional(),
        autoCreateReminders: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

export async function GET() {
  try {
    const user = await requireAuth();
    await connectDB();
    let doc = await StudentPreferences.findOne({ userId: user.id });
    if (!doc) {
      const defaults = getDefaultStudentPreferences();
      doc = await StudentPreferences.create({ userId: user.id, ...defaults });
    }
    const obj = doc.toObject();
    const defaults = getDefaultStudentPreferences();
    if (!obj.telegram) obj.telegram = defaults.telegram;
    return NextResponse.json(obj);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    await connectDB();

    if (parsed.data.reset === true) {
      await StudentPreferences.deleteOne({ userId: user.id });
      const defaults = getDefaultStudentPreferences();
      const fresh = await StudentPreferences.create({ userId: user.id, ...defaults });
      await AiAutomationLog.create({
        userId: user.id,
        type: "settings_update",
        summary: "Preferences reset to defaults",
        metadata: {},
      });
      return NextResponse.json(fresh.toObject());
    }

    let doc = await StudentPreferences.findOne({ userId: user.id });
    if (!doc) {
      const defaults = getDefaultStudentPreferences();
      doc = await StudentPreferences.create({ userId: user.id, ...defaults });
    }

    const p = parsed.data;
    if (p.timezone) doc.timezone = p.timezone;
    if (p.language) doc.language = p.language;
    if (p.reminders) Object.assign(doc.reminders, p.reminders);
    if (p.notifications) Object.assign(doc.notifications, p.notifications);
    if (p.calendar) Object.assign(doc.calendar, p.calendar);
    if (p.ai) Object.assign(doc.ai, p.ai);
    if (p.placement) Object.assign(doc.placement, p.placement);
    if (p.automation) Object.assign(doc.automation, p.automation);
    if (p.telegram) {
      if (!doc.telegram) doc.telegram = getDefaultStudentPreferences().telegram;
      const tg = { ...p.telegram };
      if (tg.insightSinceDate !== undefined) {
        doc.telegram.insightSinceDate = tg.insightSinceDate
          ? new Date(tg.insightSinceDate)
          : null;
        delete tg.insightSinceDate;
      }
      Object.assign(doc.telegram, tg);
      doc.markModified("telegram");
    }
    await doc.save();

    await AiAutomationLog.create({
      userId: user.id,
      type: "settings_update",
      summary: "Student preferences updated",
      metadata: { keys: Object.keys(p) },
    });

    return NextResponse.json(doc.toObject());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
