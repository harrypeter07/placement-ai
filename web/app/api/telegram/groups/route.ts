import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { upsertTelegramGroup } from "@/lib/telegram-messages";
import { checkWorkerSecret } from "@/lib/telegram-worker-auth";

export const runtime = "nodejs";

const syncSchema = z.object({
  apiKey: z.string().min(1),
  groups: z.array(
    z.object({
      groupId: z.string(),
      title: z.string(),
      kind: z.enum(["group", "channel", "supergroup"]).optional(),
      username: z.string().optional(),
    })
  ),
});

/** GET — all discovered groups + per-user monitoring flag */
export async function GET() {
  try {
    const user = await requireAuth();
    
    // Fetch user preferences from Supabase
    const { data: prefs } = await supabase
      .from("student_preferences")
      .select("telegram_config")
      .eq("user_id", user.id)
      .maybeSingle();

    const monitored = new Set(prefs?.telegram_config?.monitoredGroupIds || []);

    // Fetch groups from Supabase
    const { data: groups } = await supabase
      .from("telegram_groups")
      .select("*")
      .order("updated_at", { ascending: false });

    return NextResponse.json(
      (groups || []).map((g) => ({
        _id: g.id,
        groupId: g.group_id,
        title: g.title,
        username: g.username || undefined,
        kind: g.kind || "group",
        lastMessageAt: g.updated_at,
        monitoringEnabled: monitored.has(g.group_id),
      }))
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

/** POST — worker syncs all dialogs from Telegram account */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (!checkWorkerSecret(parsed.data.apiKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    for (const g of parsed.data.groups) {
      await upsertTelegramGroup(g.groupId, g.title, {
        kind: g.kind,
        username: g.username,
      });
    }

    return NextResponse.json({ ok: true, synced: parsed.data.groups.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
