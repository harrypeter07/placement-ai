import { supabase } from "@/lib/supabase";
import { fetchGroupMessagesFromTelegram } from "@/lib/telegram-fetch-history";
import { bulkStoreTelegramMessages } from "@/lib/telegram-messages";

/**
 * Pull up to `limit` recent messages from Telegram for each group when DB has fewer than needed.
 */
export async function ensureMessagesForGroups(
  groupIds: string[],
  limit: number,
  since?: Date | null
): Promise<{ fetched: number; perGroup: Record<string, number>; errors: string[] }> {
  const perGroup: Record<string, number> = {};
  const errors: string[] = [];
  let fetched = 0;

  if (groupIds.length === 0) return { fetched, perGroup, errors };

  const { data: sessionDoc } = await supabase
    .from("telegram_worker_sessions")
    .select("session_string")
    .eq("key", "default")
    .maybeSingle();

  if (!sessionDoc?.session_string) {
    errors.push("Telegram not connected — connect in Settings first");
    return { fetched, perGroup, errors };
  }

  const cap = Math.min(100, Math.max(5, limit));

  for (const groupId of groupIds) {
    try {
      let query = supabase
        .from("telegram_messages")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId);

      if (since && !Number.isNaN(since.getTime())) {
        query = query.gte("sent_at", since.toISOString());
      }

      const { count } = await query;
      const inDb = count || 0;
      if (inDb >= cap) {
        perGroup[groupId] = 0;
        continue;
      }

      const { data: group } = await supabase
        .from("telegram_groups")
        .select("title")
        .eq("group_id", groupId)
        .maybeSingle();

      const title = group?.title || groupId;
      const rows = await fetchGroupMessagesFromTelegram(
        sessionDoc.session_string,
        groupId,
        cap
      );
      await bulkStoreTelegramMessages(groupId, title, rows);
      perGroup[groupId] = rows.length;
      fetched += rows.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${groupId}: ${msg}`);
      perGroup[groupId] = 0;
    }
  }

  return { fetched, perGroup, errors };
}
