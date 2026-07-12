/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("snooze"),
    snoozeMinutes: z.number().min(5).max(10080),
  }),
  z.object({
    action: z.literal("pause"),
  }),
  z.object({
    action: z.literal("resume"),
  }),
  z.object({
    action: z.literal("complete"),
  }),
  z.object({
    action: z.literal("edit"),
    title: z.string().optional(),
    message: z.string().optional(),
    scheduledAt: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  }),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Fetch existing reminder from Supabase
    const { data: r, error: fetchErr } = await supabase
      .from("reminders")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr || !r) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = Date.now();
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    switch (parsed.data.action) {
      case "snooze": {
        const base = Math.max(now, new Date(r.scheduled_at).getTime());
        payload.scheduled_at = new Date(base + parsed.data.snoozeMinutes * 60 * 1000).toISOString();
        payload.status = "active";
        payload.snooze_until = new Date(now + parsed.data.snoozeMinutes * 60 * 1000).toISOString();
        break;
      }
      case "pause":
        payload.status = "paused";
        payload.enabled = false;
        break;
      case "resume":
        payload.status = "active";
        payload.enabled = true;
        break;
      case "complete":
        payload.status = "completed";
        payload.sent = true;
        payload.enabled = false;
        break;
      case "edit":
        if (parsed.data.title != null) payload.title = parsed.data.title;
        if (parsed.data.message != null) payload.message = parsed.data.message;
        if (parsed.data.scheduledAt) payload.scheduled_at = new Date(parsed.data.scheduledAt).toISOString();
        if (parsed.data.priority) payload.priority = parsed.data.priority;
        break;
    }

    const { data: updated, error: updateErr } = await supabase
      .from("reminders")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (updateErr || !updated) {
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    const mapped = {
      _id: updated.id,
      id: updated.id,
      userId: updated.user_id,
      deadlineId: updated.deadline_id,
      scheduledAt: updated.scheduled_at,
      offset: updated.offset,
      minutesBeforeDeadline: updated.minutes_before_deadline,
      channels: updated.channels,
      title: updated.title,
      message: updated.message,
      aiSummary: updated.ai_summary,
      priority: updated.priority,
      status: updated.status,
      enabled: updated.enabled,
      aiSuggested: updated.ai_suggested,
      sent: updated.sent,
      repeatRule: updated.repeat_rule,
      escalationLevel: updated.escalation_level,
      escalationCount: updated.escalation_count,
      reminderStyle: updated.reminder_style,
      snoozeUntil: updated.snooze_until,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };

    return NextResponse.json(mapped);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    // Delete from reminders in Supabase
    const { data: deleted, error: deleteErr } = await supabase
      .from("reminders")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();

    if (deleteErr || !deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
