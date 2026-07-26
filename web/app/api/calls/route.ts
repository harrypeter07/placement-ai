import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/calls
 * Fetches all reminders that are configured for phone calls,
 * enriched with their related deadline info.
 */
export async function GET() {
  try {
    const user = await requireAuth();

    const { data: calls, error } = await supabase
      .from("reminders")
      .select("*, deadline:deadlines(*)")
      .eq("user_id", user.id)
      .or("channels.cs.{phoneCall},channels.cs.{phone_call},offset_preset.eq.call,reminder_style.eq.aggressive")
      .order("scheduled_at", { ascending: false });

    if (error) {
      console.error("[GET calls] Supabase error:", error);
      return NextResponse.json({ error: "Database query failed" }, { status: 500 });
    }

    const mapped = (calls || []).map((c: Record<string, unknown>) => {
      const deadline = c.deadline as Record<string, unknown> | null;
      return {
        id: c.id,
        title: c.title,
        message: c.message,
        scheduledAt: c.scheduled_at,
        priority: c.priority,
        status: c.status,
        sent: c.sent,
        callTime: c.call_time,
        callStatus: c.call_status || "pending",
        callResponse: c.call_response,
        formFillStatus: c.form_fill_status,
        calledAt: c.called_at,
        deadline: deadline
          ? {
              id: deadline.id,
              company: deadline.company,
              role: deadline.role,
              deadlineDate: deadline.deadline_date,
              status: deadline.status,
            }
          : null,
      };
    });

    return NextResponse.json(mapped);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

/**
 * PATCH /api/calls
 * Updates a call's status, callResponse, formFillStatus, or schedules/cancels calls.
 */
export async function PATCH(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { id, callStatus, callResponse, formFillStatus, scheduledAt, rescheduleOffsetHours } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing reminder ID" }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};
    if (callStatus !== undefined) updatePayload.call_status = callStatus;
    if (callResponse !== undefined) updatePayload.call_response = callResponse;
    if (formFillStatus !== undefined) updatePayload.form_fill_status = formFillStatus;

    if (scheduledAt !== undefined) {
      updatePayload.scheduled_at = new Date(scheduledAt).toISOString();
      updatePayload.sent = false;
      updatePayload.enabled = true;
      updatePayload.status = "active";
      updatePayload.call_status = "pending";
      updatePayload.call_response = null;
      updatePayload.snooze_until = null;
      updatePayload.channels = ["phoneCall", "dashboard"];
    } else if (rescheduleOffsetHours !== undefined) {
      const newTime = new Date(Date.now() + Number(rescheduleOffsetHours) * 60 * 60 * 1000).toISOString();
      updatePayload.scheduled_at = newTime;
      updatePayload.sent = false;
      updatePayload.enabled = true;
      updatePayload.status = "active";
      updatePayload.call_status = "pending";
      updatePayload.call_response = null;
      updatePayload.snooze_until = null;
      updatePayload.channels = ["phoneCall", "dashboard"];
    }

    updatePayload.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from("reminders")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) {
      console.error("[PATCH calls] Supabase error:", error);
      return NextResponse.json({ error: "Failed to update call status" }, { status: 500 });
    }

    // Sync updated deadline date to associated deadline row if present
    if (updated?.deadline_id && updatePayload.scheduled_at) {
      await supabase
        .from("deadlines")
        .update({
          deadline_date: updatePayload.scheduled_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", updated.deadline_id)
        .eq("user_id", user.id);
    }

    return NextResponse.json({
      ok: true,
      call: {
        id: updated.id,
        callStatus: updated.call_status,
        callResponse: updated.call_response,
        formFillStatus: updated.form_fill_status,
        scheduledAt: updated.scheduled_at,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
