import { supabase } from "@/lib/supabase";
import { discoverTelegramGroups } from "@/lib/telegram-gramjs";
import { upsertTelegramGroup } from "@/lib/telegram-messages";

export async function syncGroupCatalogFromSession() {
  const { data: sessionDoc } = await supabase
    .from("telegram_worker_sessions")
    .select("session_string")
    .eq("key", "default")
    .maybeSingle();

  if (!sessionDoc?.session_string) {
    throw new Error("Connect Telegram in Settings first");
  }

  const discovered = await discoverTelegramGroups(sessionDoc.session_string);
  for (const g of discovered) {
    await upsertTelegramGroup(g.groupId, g.title, { kind: g.kind, username: g.username });
  }

  return { synced: discovered.length, groups: discovered };
}
