/* eslint-disable @typescript-eslint/no-explicit-any */
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
      .contains("channels", ["phoneCall"])
      .order("scheduled_at", { ascending: false });

    if (error) {
      console.error("[GET calls] Supabase error:", error);
      return NextResponse.json({ error: "Database query failed" }, { status: 500 });
    }

    const mapped = (calls || []).map((c: any) => ({
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
      deadline: c.deadline
        ? {
            id: c.deadline.id,
            company: c.deadline.company,
            role: c.deadline.role,
            deadlineDate: c.deadline.deadline_date,
            status: c.deadline.status,
          }
        : null,
    }));

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
    const { id, callStatus, callResponse, formFillStatus } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing reminder ID" }, { status: 400 });
    }

    const updatePayload: any = {};
    if (callStatus !== undefined) updatePayload.call_status = callStatus;
    if (callResponse !== undefined) updatePayload.call_response = callResponse;
    if (formFillStatus !== undefined) updatePayload.form_fill_status = formFillStatus;
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

    return NextResponse.json({
      ok: true,
      call: {
        id: updated.id,
        callStatus: updated.call_status,
        callResponse: updated.call_response,
        formFillStatus: updated.form_fill_status,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
