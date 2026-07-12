import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const schema = z.object({
  insightIds: z.array(z.string()).min(1),
});

/** POST — dismiss info-only insights (no deadline created) */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input — select at least one insight" },
        { status: 400 }
      );
    }

    const ids = parsed.data.insightIds.filter((id) => id.length > 10);
    if (!ids.length) {
      return NextResponse.json({ error: "Invalid insight ids" }, { status: 400 });
    }

    // Dismiss insights in Supabase
    const { data, error } = await supabase
      .from("placement_insights")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .in("id", ids)
      .eq("user_id", user.id)
      .eq("status", "draft")
      .select("id");

    if (error) {
      console.error("[POST insights/dismiss] Supabase error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, dismissed: data?.length || 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
