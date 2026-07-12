/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { hasValidExtractedDeadline } from "@/lib/insight-utils";
import { requireAuth } from "@/lib/api-auth";
import { getStudentPreferences } from "@/lib/db-supabase";
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
      .filter((id) => id.length > 10);

    if (!ids.length) {
      return NextResponse.json({ error: "Invalid insight ids" }, { status: 400 });
    }

    const prefs = await getStudentPreferences(user.id);
    const pinDefault = prefs?.telegram_config?.insightPinToOverview ?? true;
    const pinToOverview = parsed.data.pinToOverview ?? pinDefault;

    // Fetch placement insights from Supabase
    const { data: rows, error: fetchErr } = await supabase
      .from("placement_insights")
      .select("*")
      .in("id", ids)
      .eq("user_id", user.id)
      .eq("status", "draft");

    if (fetchErr) {
      console.error("[POST insights/apply] Supabase fetch error:", fetchErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Map extracted_deadline to extractedDeadline for validation
    const mappedRows = (rows || []).map((r: any) => ({
      ...r,
      extractedDeadline: r.extracted_deadline || r.extractedDeadline,
    }));

    const actionable = mappedRows.filter((r) => hasValidExtractedDeadline(r));
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
