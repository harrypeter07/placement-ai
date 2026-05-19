import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api-auth";
import { StudentPreferences } from "@/models/StudentPreferences";
import { analyzePlacementForReminders } from "@/lib/ai/reminder-intelligence";
import { AiAutomationLog } from "@/models/AiAutomationLog";

export const runtime = "nodejs";

const bodySchema = z.object({
  message: z.string().min(10).max(8000),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    await connectDB();
    const prefs = await StudentPreferences.findOne({ userId: user.id });
    const analysis = await analyzePlacementForReminders(parsed.data.message, prefs);

    await AiAutomationLog.create({
      userId: user.id,
      type: "ai_analysis",
      summary: `AI reminder analysis (${analysis.urgency})`,
      metadata: { confidence: analysis.confidence, isPlacement: analysis.isPlacement },
    });

    return NextResponse.json(analysis);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
