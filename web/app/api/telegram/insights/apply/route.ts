import { NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { hasValidExtractedDeadline } from "@/lib/insight-utils";
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
      return NextResponse.json(
        {
          error: "Invalid input — pick at least one insight with a valid deadline",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const ids = parsed.data.insightIds
      .map((id) => String(id).trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!ids.length) {
      return NextResponse.json({ error: "Invalid insight ids" }, { status: 400 });
    }

    await connectDB();
    const prefs = await StudentPreferences.findOne({ userId: user.id });
    const pinDefault = prefs?.telegram?.insightPinToOverview ?? true;
    const pinToOverview = parsed.data.pinToOverview ?? pinDefault;
    const rows = await PlacementInsight.find({
      _id: { $in: ids },
      userId: user.id,
      status: "draft",
    }).lean();

    const actionable = rows.filter((r) => hasValidExtractedDeadline(r));
    if (!actionable.length) {
      return NextResponse.json(
        {
          error:
            "None of the selected items have a parseable deadline. Info-only messages cannot be applied — use Dismiss or ignore them.",
        },
        { status: 400 }
      );
    }

    const results = [];
    let deadlines = 0;
    let reminders = 0;

    for (const row of actionable) {
      const applied = await applySingleInsight(user.id, row, prefs, {
        createDeadlines: parsed.data.createDeadlines,
        createReminders: parsed.data.createReminders,
        pinToOverview,
        markApplied: true,
      });
      results.push(applied);
      if (applied.deadlineCreated) deadlines += 1;
      reminders += applied.remindersCreated;
    }

    return NextResponse.json({
      ok: true,
      applied: actionable.length,
      skipped: rows.length - actionable.length,
      created: { deadlines, reminders, insights: actionable.length },
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
