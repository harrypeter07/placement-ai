/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getStudentPreferences } from "@/lib/db-supabase";
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
    const now = new Date();
    const prefs = await getStudentPreferences(user.id);

    const quiet = isQuietHoursNow(
      prefs?.notifications_config?.quietHoursStart || "22:00",
      prefs?.notifications_config?.quietHoursEnd || "07:00",
      !!prefs?.notifications_config?.quietHoursEnabled
    );

    // Fetch candidate reminders from Supabase
    const { data: candidates, error } = await supabase
      .from("reminders")
      .select("*, deadline:deadlines(*)")
      .eq("user_id", user.id)
      .eq("enabled", true)
      .in("status", ["active", "snoozed"])
      .or(`snooze_until.is.null,snooze_until.lte.${now.toISOString()}`)
      .order("scheduled_at", { ascending: true })
      .limit(40);

    if (error) {
      console.error("[GET reminders/due] Supabase error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const due = [];
    for (const r of (candidates || [])) {
      const escalationLevel = r.escalation_level || priorityToEscalation(r.priority as any);
      if (quiet && (escalationLevel === "soft" || escalationLevel === "normal")) continue;

      const scheduled = new Date(r.scheduled_at);
      const last = r.last_notified_at ? new Date(r.last_notified_at) : null;
      let level = escalationLevel;

      if (now >= scheduled) {
        if (!last) {
          due.push({
            ...r,
            _id: r.id,
            deadlineId: r.deadline ? {
              _id: r.deadline.id,
              id: r.deadline.id,
              company: r.deadline.company,
              role: r.deadline.role,
              deadline: r.deadline.deadline_date,
              status: r.deadline.status,
            } : null,
            escalationLevel: level,
          });
          continue;
        }
        const repeatMs = escalationRepeatMinutes(level as any) * 60 * 1000;
        if (now.getTime() - last.getTime() >= repeatMs) {
          level = nextEscalation(level as any);
          due.push({
            ...r,
            _id: r.id,
            deadlineId: r.deadline ? {
              _id: r.deadline.id,
              id: r.deadline.id,
              company: r.deadline.company,
              role: r.deadline.role,
              deadline: r.deadline.deadline_date,
              status: r.deadline.status,
            } : null,
            escalationLevel: level,
          });
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

    const now = new Date();

    if (parsed.data.action === "ack") {
      // Mark reminders completed in Supabase
      const { error } = await supabase
        .from("reminders")
        .update({ sent: true, status: "completed", updated_at: now.toISOString() })
        .in("id", parsed.data.ids)
        .eq("user_id", user.id);

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === "snooze") {
      const until = new Date(now.getTime() + (parsed.data.snoozeMinutes || 60) * 60 * 1000);
      // Snooze reminders in Supabase
      const { error } = await supabase
        .from("reminders")
        .update({ status: "snoozed", snooze_until: until.toISOString(), sent: false, updated_at: now.toISOString() })
        .in("id", parsed.data.ids)
        .eq("user_id", user.id);

      if (error) throw error;
      return NextResponse.json({ ok: true, snoozeUntil: until });
    }

    if (parsed.data.action === "escalate") {
      // Fetch target reminders
      const { data: reminders, error: fetchErr } = await supabase
        .from("reminders")
        .select("*")
        .in("id", parsed.data.ids)
        .eq("user_id", user.id);

      if (fetchErr) throw fetchErr;

      for (const r of (reminders || [])) {
        const level = nextEscalation((r.escalation_level || "normal") as any);
        
        const { error: updateErr } = await supabase
          .from("reminders")
          .update({
            escalation_level: level,
            escalation_count: (r.escalation_count || 0) + 1,
            last_notified_at: now.toISOString(),
            sent: false,
            updated_at: now.toISOString(),
          })
          .eq("id", r.id);

        if (updateErr) throw updateErr;

        // Log escalation in Supabase
        await supabase
          .from("notification_logs")
          .insert([{
            user_id: user.id,
            reminder_id: r.id,
            channel: "dashboard",
            title: r.title || "Reminder escalated",
            body: r.message || "",
            escalation_level: level,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          }]);

        try {
          await sendPushToUser(String(user.id), {
            title: r.title || "PlaceMint reminder",
            body: r.ai_summary || r.message || "",
            url: "/dashboard/reminders",
            level,
          });
        } catch (pushErr) {
          console.warn("[due POST] push send warning:", pushErr);
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
