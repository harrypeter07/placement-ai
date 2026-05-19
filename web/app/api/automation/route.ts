import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { StudentPreferences, getDefaultStudentPreferences } from "@/models/StudentPreferences";
import { AiAutomationLog } from "@/models/AiAutomationLog";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const automationPatch = z
  .object({
    masterEnabled: z.boolean().optional(),
    aiAutoReminders: z.boolean().optional(),
    autoCalendarSync: z.boolean().optional(),
    autoPriority: z.boolean().optional(),
    duplicateMerge: z.boolean().optional(),
  })
  .strict();

export async function GET() {
  try {
    const user = await requireAuth();
    await connectDB();
    let prefs = await StudentPreferences.findOne({ userId: user.id });
    if (!prefs) {
      prefs = await StudentPreferences.create({ userId: user.id, ...getDefaultStudentPreferences() });
    }
    const logs = await AiAutomationLog.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .limit(80)
      .lean();

    return NextResponse.json({
      automation: prefs.automation,
      logs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = automationPatch.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    await connectDB();
    let prefs = await StudentPreferences.findOne({ userId: user.id });
    if (!prefs) {
      prefs = await StudentPreferences.create({ userId: user.id, ...getDefaultStudentPreferences() });
    }
    Object.assign(prefs.automation, parsed.data);
    await prefs.save();

    await AiAutomationLog.create({
      userId: user.id,
      type: "automation_toggle",
      summary: "Automation preferences updated",
      metadata: parsed.data,
    });

    return NextResponse.json({ automation: prefs.automation });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
