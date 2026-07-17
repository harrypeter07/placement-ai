import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getStudentPreferences } from "@/lib/db-supabase";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "deadline";
    const nowStr = new Date().toISOString();

    let query = supabase
      .from("deadlines")
      .select("*")
      .or(`user_id.eq.${user.id},is_global.eq.true`);

    if (status === "past") {
      query = query.lt("deadline_date", nowStr);
    } else {
      query = query.gte("deadline_date", nowStr);
      if (status && status !== "all") {
        query = query.eq("status", status);
      }
    }
    if (search) {
      query = query.ilike("company", `%${search}%`);
    }

    if (sort === "urgency" || sort === "deadline") {
      query = query.order("deadline_date", { ascending: true });
    } else {
      query = query.order("company", { ascending: true });
    }

    const { data: deadlines, error } = await query;
    if (error) {
      console.error("[GET deadlines] Supabase error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const messageIds = (deadlines || []).map((d) => d.source_message_id).filter(Boolean);
    const messageMap: Record<string, string> = {};
    if (messageIds.length > 0) {
      const { data: messages } = await supabase
        .from("telegram_messages")
        .select("message_id, text")
        .in("message_id", messageIds);
      if (messages) {
        messages.forEach((m) => {
          messageMap[m.message_id] = m.text;
        });
      }
    }

    const mapped = (deadlines || []).map((d) => ({
      _id: d.id,
      id: d.id,
      company: d.company,
      role: d.role,
      deadline: d.deadline_date,
      deadlineDate: d.deadline_date,
      eligibility: d.eligibility,
      type: d.type,
      links: d.links,
      salary: d.salary,
      status: d.status,
      notes: d.notes,
      confidence: d.confidence,
      isGlobal: d.is_global,
      sourceMessageId: d.source_message_id,
      telegramGroupId: d.telegram_group_id,
      sourceMessageText: d.source_message_id ? messageMap[d.source_message_id] || "" : "",
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));

    return NextResponse.json(mapped);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

const createSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  deadline: z.string(),
  eligibility: z.string().optional(),
  type: z.string().optional(),
  links: z.array(z.string()).optional(),
  salary: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    // Insert deadline into Supabase
    const { data: deadline, error: insertError } = await supabase
      .from("deadlines")
      .insert([
        {
          company: parsed.data.company,
          role: parsed.data.role,
          deadline_date: new Date(parsed.data.deadline).toISOString(),
          eligibility: parsed.data.eligibility || "",
          type: parsed.data.type || "full-time",
          links: parsed.data.links || [],
          salary: parsed.data.salary || "",
          notes: parsed.data.notes || "",
          status: "pending",
          confidence: 1,
          is_global: false,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        },
      ])
      .select("*")
      .single();

    if (insertError || !deadline) {
      console.error("[POST deadlines] Supabase insert error:", insertError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    try {
      const { syncDeadlineToGoogleCalendar } = await import("@/lib/calendar/sync-deadline");
      const prefs = await getStudentPreferences(user.id);
      if (
        prefs?.calendar_config?.autoSync !== false &&
        prefs?.calendar_config?.autoCreateEvents !== false
      ) {
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
      }
    } catch (calErr) {
      console.warn("[POST deadlines] calendar sync warning:", calErr);
    }

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

    return NextResponse.json(mappedOutput, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
