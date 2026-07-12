import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getStudentPreferences } from "@/lib/db-supabase";
import { syncDeadlineToGoogleCalendar, removeDeadlineFromGoogleCalendar } from "@/lib/calendar/sync-deadline";

export const runtime = "nodejs";

const updateSchema = z.object({
  status: z.enum(["applied", "pending", "missed", "rejected", "oa_scheduled", "interview_scheduled"]).optional(),
  notes: z.string().optional(),
  links: z.array(z.string()).optional(),
  company: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  deadline: z.string().optional(),
  eligibility: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    // Fetch existing deadline from Supabase
    const { data: existing, error: fetchErr } = await supabase
      .from("deadlines")
      .select("*")
      .eq("id", id)
      .or(`user_id.eq.${user.id},is_global.eq.true`)
      .maybeSingle();

    if (fetchErr || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const wantsCoreEdit =
      parsed.data.company !== undefined ||
      parsed.data.role !== undefined ||
      parsed.data.deadline !== undefined ||
      parsed.data.eligibility !== undefined;

    if (wantsCoreEdit) {
      if (existing.is_global || String(existing.user_id) !== user.id) {
        return NextResponse.json(
          { error: "You can only edit company, role, or date on deadlines you created." },
          { status: 403 }
        );
      }
    }

    const payload: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) payload.status = parsed.data.status;
    if (parsed.data.notes !== undefined) payload.notes = parsed.data.notes;
    if (parsed.data.links !== undefined) payload.links = parsed.data.links;
    if (parsed.data.company !== undefined) payload.company = parsed.data.company;
    if (parsed.data.role !== undefined) payload.role = parsed.data.role;
    if (parsed.data.deadline !== undefined) payload.deadline_date = new Date(parsed.data.deadline).toISOString();
    if (parsed.data.eligibility !== undefined) payload.eligibility = parsed.data.eligibility;
    payload.updated_at = new Date().toISOString();

    const { data: deadline, error: updateErr } = await supabase
      .from("deadlines")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (updateErr || !deadline) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const prefs = await getStudentPreferences(user.id);
    if (
      prefs?.automation_config?.masterEnabled !== false &&
      prefs?.calendar_config?.autoSync !== false &&
      prefs?.calendar_config?.autoCreateEvents !== false
    ) {
      try {
        const mappedDeadline = {
          _id: deadline.id,
          company: deadline.company,
          role: deadline.role,
          deadline: new Date(deadline.deadline_date),
          links: deadline.links || [],
          eligibility: deadline.eligibility || "",
          telegramGroupId: deadline.telegram_group_id || undefined,
        };
        await syncDeadlineToGoogleCalendar(user.id, mappedDeadline);
      } catch (calErr) {
        console.warn("[PATCH deadline] calendar sync warning:", calErr);
      }
    }

    // Map output to match frontend camelCase/Mongoose expectations
    const mappedOutput = {
      _id: deadline.id,
      id: deadline.id,
      company: deadline.company,
      role: deadline.role,
      deadline: deadline.deadline_date,
      deadlineDate: deadline.deadline_date,
      eligibility: deadline.eligibility,
      type: deadline.type,
      links: deadline.links,
      salary: deadline.salary,
      status: deadline.status,
      notes: deadline.notes,
      confidence: deadline.confidence,
      isGlobal: deadline.is_global,
      createdAt: deadline.created_at,
      updatedAt: deadline.updated_at,
    };

    return NextResponse.json(mappedOutput);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    // Delete from deadlines in Supabase
    const { data: deleted, error: deleteErr } = await supabase
      .from("deadlines")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();

    if (deleteErr || !deleted) {
      return NextResponse.json({ error: "Not found or not owned" }, { status: 404 });
    }

    // Delete reminders associated with the deadline
    await supabase
      .from("reminders")
      .delete()
      .eq("user_id", user.id)
      .eq("deadline_id", id);

    try {
      await removeDeadlineFromGoogleCalendar(user.id, id);
    } catch (calErr) {
      console.warn("[DELETE deadline] calendar remove warning:", calErr);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
