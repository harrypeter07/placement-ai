import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const automationPatch = z
  .object({
    masterEnabled: z.boolean().optional(),
    aiAutoReminders: z.boolean().optional(),
    autoCalendarSync: z.boolean().optional(),
    autoPriority: z.boolean().optional(),
    duplicateMerge: z.boolean().optional(),
  })
  .strict();

export async function GET() {
  try {
    const user = await requireAuth();
    
    // Fetch preferences from Supabase
    const { data: prefs } = await supabase
      .from("student_preferences")
      .select("automation_config")
      .eq("user_id", user.id)
      .maybeSingle();

    // Fetch automation logs from Supabase
    const { data: logs } = await supabase
      .from("ai_automation_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(80);

    const mappedLogs = (logs || []).map((l) => ({
      _id: l.id,
      userId: l.user_id,
      type: l.type,
      summary: l.summary,
      metadata: l.metadata,
      createdAt: l.created_at,
    }));

    return NextResponse.json({
      automation: prefs?.automation_config || {
        masterEnabled: true,
        aiAutoReminders: true,
        autoCalendarSync: true,
        autoPriority: true,
        duplicateMerge: true,
      },
      logs: mappedLogs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = automationPatch.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Fetch current settings from Supabase
    const { data: prefs } = await supabase
      .from("student_preferences")
      .select("automation_config")
      .eq("user_id", user.id)
      .maybeSingle();

    const current = prefs?.automation_config || {
      masterEnabled: true,
      aiAutoReminders: true,
      autoCalendarSync: true,
      autoPriority: true,
      duplicateMerge: true,
    };
    
    const updated = { ...current, ...parsed.data };

    // Update preferences in Supabase
    await supabase
      .from("student_preferences")
      .update({ automation_config: updated, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    // Create automation decision log in Supabase
    await supabase.from("ai_automation_logs").insert([{
      user_id: user.id,
      type: "automation_toggle",
      summary: "Automation preferences updated",
      metadata: parsed.data,
      created_at: new Date().toISOString()
    }]);

    return NextResponse.json({ automation: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
