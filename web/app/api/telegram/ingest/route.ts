import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { extractPlacementFromText } from "@/lib/gemini";

const schema = z.object({
  message: z.string(),
  messageId: z.string().optional(),
  groupId: z.string().optional(),
  apiKey: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    if (process.env.TELEGRAM_WORKER_SECRET && parsed.data.apiKey !== process.env.TELEGRAM_WORKER_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const extracted = await extractPlacementFromText(parsed.data.message);
    if (extracted.confidence < 0.3 || !extracted.company) {
      return NextResponse.json({ skipped: true, reason: "Low confidence or not placement", extracted });
    }

    // Query duplicate deadline from Supabase
    const { data: existing } = await supabase
      .from("deadlines")
      .select("*")
      .eq("company", extracted.company)
      .eq("role", extracted.role || "Role TBD")
      .eq("source_message_id", parsed.data.messageId || "")
      .maybeSingle();

    if (existing) {
      const mappedExisting = {
        _id: existing.id,
        id: existing.id,
        company: existing.company,
        role: existing.role,
        deadline: existing.deadline_date,
        eligibility: existing.eligibility,
        status: existing.status,
      };
      return NextResponse.json({ duplicate: true, existing: mappedExisting });
    }

    // Create deadline in Supabase
    const { data: deadline, error: insertError } = await supabase
      .from("deadlines")
      .insert([
        {
          company: extracted.company,
          role: extracted.role || "Role TBD",
          deadline_date: extracted.deadline ? new Date(extracted.deadline).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          eligibility: extracted.eligibility || "",
          type: extracted.type || "full-time",
          links: extracted.links || [],
          salary: extracted.salary || "",
          confidence: extracted.confidence || 0,
          source_message_id: parsed.data.messageId || null,
          telegram_group_id: parsed.data.groupId || null,
          is_global: true,
          status: "pending",
          updated_at: new Date().toISOString(),
        }
      ])
      .select("*")
      .single();

    if (insertError || !deadline) {
      console.error("[POST telegram/ingest] Supabase error:", insertError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const mappedOutput = {
      _id: deadline.id,
      id: deadline.id,
      company: deadline.company,
      role: deadline.role,
      deadline: deadline.deadline_date,
      eligibility: deadline.eligibility,
      type: deadline.type,
      links: deadline.links,
      salary: deadline.salary,
      confidence: deadline.confidence,
      sourceMessageId: deadline.source_message_id,
      telegramGroupId: deadline.telegram_group_id,
      isGlobal: deadline.is_global,
      status: deadline.status,
    };

    return NextResponse.json({ created: true, deadline: mappedOutput, extracted }, { status: 201 });
  } catch (err) {
    console.error("[POST telegram/ingest] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
