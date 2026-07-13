/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getStudentPreferences } from "@/lib/db-supabase";
import { priorityToEscalation } from "@/lib/reminders/escalation";

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
  channels: z.array(z.enum(["browser", "email", "telegram", "dashboard", "phoneCall"])),
  offsets: z.array(z.enum(["1d", "6h", "1h", "15m"])).optional(),
  customMinutesBefore: z.array(z.number().min(5).max(43200)).optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  aiSuggested: z.boolean().optional(),
  callTime: z.string().optional(),
});

export async function GET() {
  try {
    const user = await requireAuth();

    // Query reminders from Supabase with embedded deadline details
    const { data: reminders, error: fetchErr } = await supabase
      .from("reminders")
      .select("*, deadline:deadlines(*)")
      .eq("user_id", user.id)
      .order("scheduled_at", { ascending: true });

    if (fetchErr) {
      console.error("[GET reminders] Supabase error:", fetchErr);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const enriched = (reminders || []).map((r: any) => ({
      _id: r.id,
      id: r.id,
      userId: r.user_id,
      deadlineId: r.deadline ? {
        _id: r.deadline.id,
        id: r.deadline.id,
        company: r.deadline.company,
        role: r.deadline.role,
        deadline: r.deadline.deadline_date,
        status: r.deadline.status,
      } : null,
      scheduledAt: r.scheduled_at,
      offset: r.offset,
      minutesBeforeDeadline: r.minutes_before_deadline,
      channels: r.channels,
      title: r.title,
      message: r.message,
      aiSummary: r.ai_summary,
      priority: r.priority,
      status: r.status,
      enabled: r.enabled,
      aiSuggested: r.ai_suggested,
      sent: r.sent,
      repeatRule: r.repeat_rule,
      escalationLevel: r.escalation_level,
      escalationCount: r.escalation_count,
      reminderStyle: r.reminder_style,
      effectiveMinutesBefore: resolveMinutes({
        minutesBeforeDeadline: r.minutes_before_deadline,
        offset: r.offset,
      }),
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

    const prefs = await getStudentPreferences(user.id);
    if (prefs?.automation_config?.masterEnabled === false) {
      return NextResponse.json({ error: "Automation is disabled" }, { status: 403 });
    }

    // Query deadline from Supabase
    const { data: deadline, error: deadlineErr } = await supabase
      .from("deadlines")
      .select("*")
      .eq("id", parsed.data.deadlineId)
      .or(`user_id.eq.${user.id},is_global.eq.true`)
      .maybeSingle();

    if (deadlineErr || !deadline) {
      return NextResponse.json({ error: "Deadline not found" }, { status: 404 });
    }

    // Delete existing active unsent reminders for this deadline
    await supabase
      .from("reminders")
      .delete()
      .eq("user_id", user.id)
      .eq("deadline_id", deadline.id)
      .eq("sent", false)
      .in("status", ["active", "paused", "snoozed"]);

    const priority = parsed.data.priority || "medium";
    const titleBase = parsed.data.title || `${deadline.company} — ${deadline.role}`;
    const messageBase =
      parsed.data.message ||
      `Deadline: ${new Date(deadline.deadline_date).toISOString().slice(0, 10)}. Don't miss this opportunity.`;

    const created = [];
    const dl = new Date(deadline.deadline_date).getTime();

    const standardChannels = parsed.data.channels.filter((c) => c !== "phoneCall");
    const hasPhoneCall = parsed.data.channels.includes("phoneCall");

    if (standardChannels.length > 0) {
      const minuteList: number[] =
        parsed.data.customMinutesBefore?.length && parsed.data.customMinutesBefore.length > 0
          ? [...new Set(parsed.data.customMinutesBefore)]
          : (parsed.data.offsets?.length
              ? [...new Set(parsed.data.offsets.map((o) => OFFSET_PRESET_MINUTES[o]))]
              : prefs?.reminders_config?.defaultOffsetsMinutes?.length
                ? [...new Set(prefs.reminders_config.defaultOffsetsMinutes as number[])]
                : [24 * 60, 6 * 60, 60]);

      for (const minutes of minuteList) {
        const scheduledAt = new Date(dl - minutes * 60 * 1000);
        if (scheduledAt <= new Date()) continue;

        const offsetPreset = Object.entries(OFFSET_PRESET_MINUTES).find(([, v]) => v === minutes)?.[0] || "custom";

        const escalationLevel =
          priorityToEscalation(priority as any) ||
          prefs?.reminders_config?.defaultEscalation ||
          "normal";

        const payload = {
          user_id: user.id,
          deadline_id: deadline.id,
          scheduled_at: scheduledAt.toISOString(),
          offset: offsetPreset === "custom" ? "custom" : offsetPreset,
          minutes_before_deadline: minutes,
          channels: standardChannels,
          title: titleBase,
          message: messageBase,
          priority,
          status: "active",
          enabled: true,
          ai_suggested: parsed.data.aiSuggested ?? false,
          sent: false,
          escalation_level: escalationLevel,
          escalation_count: 0,
          reminder_style: priority === "critical" || priority === "high" ? "aggressive" : "balanced",
          updated_at: new Date().toISOString(),
        };

        const { data: doc, error: insertError } = await supabase
          .from("reminders")
          .insert([payload])
          .select("*")
          .single();

        if (insertError) {
          console.error("[POST reminders] Supabase insert error:", insertError);
        } else if (doc) {
          created.push({
            ...doc,
            _id: doc.id,
          });
        }
      }
    }

    if (hasPhoneCall) {
      const defaultTime = prefs?.twilio_voice_settings?.defaultCallTime || "09:00";
      const callTimeStr = parsed.data.callTime || defaultTime;
      const datePart = new Date(deadline.deadline_date).toISOString().slice(0, 10);
      const scheduledCallAt = new Date(`${datePart}T${callTimeStr}:00+05:30`);

      if (scheduledCallAt > new Date()) {
        const escalationLevel =
          priorityToEscalation(priority as any) ||
          prefs?.reminders_config?.defaultEscalation ||
          "normal";

        const callPayload = {
          user_id: user.id,
          deadline_id: deadline.id,
          scheduled_at: scheduledCallAt.toISOString(),
          offset: "call",
          minutes_before_deadline: 0,
          channels: ["phoneCall"],
          title: `${deadline.company} — Call Alert`,
          message: `Phone call alert: Deadline for ${deadline.company} (${deadline.role}) is today!`,
          priority,
          status: "active",
          enabled: true,
          ai_suggested: parsed.data.aiSuggested ?? false,
          sent: false,
          escalation_level: escalationLevel,
          escalation_count: 0,
          reminder_style: "aggressive",
          call_time: callTimeStr,
          call_status: "pending",
          updated_at: new Date().toISOString(),
        };

        const { data: callDoc, error: callInsertError } = await supabase
          .from("reminders")
          .insert([callPayload])
          .select("*")
          .single();

        if (callInsertError) {
          console.error("[POST reminders] Supabase call insert error:", callInsertError);
        } else if (callDoc) {
          created.push({
            ...callDoc,
            _id: callDoc.id,
          });
        }
      }
    }

    // Log automation decisions in Supabase
    await supabase.from("ai_automation_logs").insert([{
      user_id: user.id,
      type: "reminder_created",
      summary: `Created ${created.length} reminder(s) for ${deadline.company}`,
      metadata: { deadlineId: String(deadline.id) },
      created_at: new Date().toISOString()
    }]);

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
