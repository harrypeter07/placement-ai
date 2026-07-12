import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(20),
  platform: z.enum(["web", "android", "ios", "unknown"]).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const ua = req.headers.get("user-agent");
    const { error } = await supabase
      .from("push_tokens")
      .upsert([
        {
          user_id: user.id,
          token: parsed.data.token,
          platform: parsed.data.platform || "web",
          user_agent: ua || null,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ], { onConflict: "token" });

    if (error) {
      console.error("[POST push/register] Supabase upsert error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth();
    const token = new URL(req.url).searchParams.get("token");

    if (token) {
      const { error } = await supabase
        .from("push_tokens")
        .delete()
        .eq("user_id", user.id)
        .eq("token", token);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("push_tokens")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
