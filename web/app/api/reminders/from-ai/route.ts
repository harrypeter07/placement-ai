/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getStudentPreferences } from "@/lib/db-supabase";
import { analyzePlacementForReminders } from "@/lib/ai/reminder-intelligence";
import { priorityToEscalation } from "@/lib/reminders/escalation";

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

    const prefs = await getStudentPreferences(user.id);
    if (prefs?.automation_config?.aiAutoReminders === false || prefs?.automation_config?.masterEnabled === false) {
      return NextResponse.json({ error: "AI auto-reminders disabled" }, { status: 403 });
    }

    // Query deadline from Supabase
    const { data: deadline, error: dlErr } = await supabase
      .from("deadlines")
      .select("*")
      .eq("id", parsed.data.deadlineId)
      .or(`user_id.eq.${user.id},is_global.eq.true`)
      .maybeSingle();

    if (dlErr || !deadline) return NextResponse.json({ error: "Deadline not found" }, { status: 404 });

    const analysis = await analyzePlacementForReminders(parsed.data.message, prefs);
    if (!analysis.shouldRemind || !analysis.isPlacement) {
      // Log skipped action in Supabase
      await supabase.from("ai_automation_logs").insert([{
        user_id: user.id,
        type: "reminder_skipped",
        summary: "AI chose not to create reminders for this text",
        metadata: { confidence: analysis.confidence },
        created_at: new Date().toISOString()
      }]);

      return NextResponse.json({ analysis, created: [] });
    }

    // Delete existing unsent AI suggested reminders for this deadline
    await supabase
      .from("reminders")
      .delete()
      .eq("user_id", user.id)
      .eq("deadline_id", deadline.id)
      .eq("sent", false)
      .eq("ai_suggested", true);

    const minuteList = analysis.suggestedOffsetsMinutes;
    const created = [];
    const dl = new Date(deadline.deadline_date).getTime();

    for (const minutes of minuteList) {
      const scheduledAt = new Date(dl - minutes * 60 * 1000);
      if (scheduledAt <= new Date()) continue;

      const offsetPreset = Object.keys(OFFSET_PRESET_MINUTES).find(
        (k) => k !== "custom" && OFFSET_PRESET_MINUTES[k] === minutes
      ) || "custom";

      const priority =
        analysis.urgency === "critical"
          ? "critical"
          : analysis.urgency === "high"
            ? "high"
            : "medium";

      const payload = {
        user_id: user.id,
        deadline_id: deadline.id,
        scheduled_at: scheduledAt.toISOString(),
        offset: offsetPreset,
        minutes_before_deadline: minutes,
        channels: parsed.data.channels,
        title: analysis.notificationTitle,
        message: analysis.notificationMessage,
        ai_summary: analysis.aiSummary,
        priority,
        status: "active",
        enabled: true,
        ai_suggested: true,
        sent: false,
        escalation_level: priorityToEscalation(priority as any) || "normal",
        escalation_count: 0,
        reminder_style: analysis.reminderStyle,
        updated_at: new Date().toISOString(),
      };

      const { data: doc, error: insertError } = await supabase
        .from("reminders")
        .insert([payload])
        .select("*")
        .single();

      if (insertError) {
        console.error("[POST reminders/from-ai] Supabase insert error:", insertError);
      } else if (doc) {
        created.push({
          ...doc,
          _id: doc.id,
        });
      }
    }

    // Log created action in Supabase
    await supabase.from("ai_automation_logs").insert([{
      user_id: user.id,
      type: "reminder_created",
      summary: `AI created ${created.length} reminder(s) for ${deadline.company}`,
      metadata: { deadlineId: String(deadline.id), urgency: analysis.urgency },
      created_at: new Date().toISOString()
    }]);

    return NextResponse.json({ analysis, created }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
