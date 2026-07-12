import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getStudentPreferences } from "@/lib/db-supabase";
import { analyzePlacementForReminders } from "@/lib/ai/reminder-intelligence";

export const runtime = "nodejs";

const bodySchema = z.object({
  message: z.string().min(10).max(8000),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const prefs = await getStudentPreferences(user.id);
    const analysis = await analyzePlacementForReminders(parsed.data.message, prefs);

    // Save logs in Supabase
    await supabase.from("ai_automation_logs").insert([{
      user_id: user.id,
      type: "ai_analysis",
      summary: `AI reminder analysis (${analysis.urgency})`,
      metadata: { confidence: analysis.confidence, isPlacement: analysis.isPlacement },
      created_at: new Date().toISOString()
    }]);

    return NextResponse.json(analysis);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
