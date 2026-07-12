import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { checkEligibility } from "@/lib/eligibility";

const schema = z.object({
  branch: z.string(),
  cgpa: z.number(),
  backlogs: z.number(),
  graduationYear: z.number(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    // Update user profile details in Supabase
    const { error: updateError } = await supabase
      .from("users")
      .update({
        branch: parsed.data.branch,
        cgpa: parsed.data.cgpa,
        backlogs: parsed.data.backlogs,
        graduation_year: parsed.data.graduationYear,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[POST eligibility] Supabase update user error:", updateError);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    // Query deadlines from Supabase
    const { data: deadlines, error: fetchError } = await supabase
      .from("deadlines")
      .select("*")
      .or(`user_id.eq.${user.id},is_global.eq.true`);

    if (fetchError) {
      console.error("[POST eligibility] Supabase fetch deadlines error:", fetchError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const mappedDeadlines = (deadlines || []).map((d) => ({
      _id: d.id,
      id: d.id,
      company: d.company,
      role: d.role,
      deadline: d.deadline_date,
      eligibility: d.eligibility,
      status: d.status,
      notes: d.notes,
      isGlobal: d.is_global,
    }));

    const eligible = [];
    const ineligible = [];

    for (const d of mappedDeadlines) {
      const result = checkEligibility(d.eligibility || "", parsed.data);
      if (result.eligible) {
        eligible.push(d);
      } else {
        ineligible.push({ deadline: d, reasons: result.reasons });
      }
    }

    return NextResponse.json({ eligible, ineligible, profile: parsed.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
