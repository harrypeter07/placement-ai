import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { PlacementInsight } from "@/models/PlacementInsight";
import { StudentPreferences } from "@/models/StudentPreferences";
import { requireAuth } from "@/lib/api-auth";
import { applySingleInsight } from "@/lib/ai/apply-chat-insights";

export const runtime = "nodejs";

const schema = z.object({
  insightIds: z.array(z.string()).min(1),
  createDeadlines: z.boolean().default(true),
  createReminders: z.boolean().default(true),
  pinToOverview: z.boolean().optional(),
});

/** POST — apply selected draft insights (deadlines + reminders) */
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
    const rows = await PlacementInsight.find({
      _id: { $in: parsed.data.insightIds },
      userId: user.id,
      status: "draft",
    });

    if (!rows.length) {
      return NextResponse.json({ error: "No draft insights found to apply" }, { status: 404 });
    }

    const results = [];
    let deadlines = 0;
    let reminders = 0;

    for (const row of rows) {
      const applied = await applySingleInsight(user.id, row, prefs, {
        createDeadlines: parsed.data.createDeadlines,
        createReminders: parsed.data.createReminders,
        pinToOverview: parsed.data.pinToOverview ?? false,
        markApplied: true,
      });
      results.push(applied);
      if (applied.deadlineCreated) deadlines += 1;
      reminders += applied.remindersCreated;
    }

    return NextResponse.json({
      ok: true,
      applied: rows.length,
      created: { deadlines, reminders, insights: rows.length },
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
