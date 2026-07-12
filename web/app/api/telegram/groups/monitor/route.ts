import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { getStudentPreferences } from "@/lib/db-supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const schema = z.object({
  groupId: z.string().min(1),
  enabled: z.boolean(),
});

/** PATCH — toggle monitoring for a Telegram group */
export async function PATCH(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const prefs = await getStudentPreferences(user.id);
    const tgConfig = prefs?.telegram_config || {};
    const ids = new Set(tgConfig.monitoredGroupIds || []);

    if (parsed.data.enabled) {
      ids.add(parsed.data.groupId);
    } else {
      ids.delete(parsed.data.groupId);
    }

    const updatedConfig = {
      ...tgConfig,
      monitoredGroupIds: [...ids],
    };

    // Update preferences in Supabase
    const { data: updated, error: updateError } = await supabase
      .from("student_preferences")
      .update({
        telegram_config: updatedConfig,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      console.error("[PATCH groups/monitor] Supabase error:", updateError);
      return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }

    return NextResponse.json({
      groupId: parsed.data.groupId,
      enabled: parsed.data.enabled,
      monitoredGroupIds: updated.telegram_config.monitoredGroupIds,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
