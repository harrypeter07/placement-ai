import { TelegramGroup } from "@/models/TelegramGroup";
import { TelegramMessage } from "@/models/TelegramMessage";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";
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

  const sessionDoc = await TelegramWorkerSession.findOne({ key: "default" })
    .select("+sessionString")
    .lean();
  if (!sessionDoc?.sessionString) {
    errors.push("Telegram not connected — connect in Settings first");
    return { fetched, perGroup, errors };
  }

  const cap = Math.min(100, Math.max(5, limit));

  for (const groupId of groupIds) {
    try {
      const msgFilter: Record<string, unknown> = { groupId };
      if (since && !Number.isNaN(since.getTime())) {
        msgFilter.sentAt = { $gte: since };
      }
      const inDb = await TelegramMessage.countDocuments(msgFilter);
      if (inDb >= cap) {
        perGroup[groupId] = 0;
        continue;
      }

      const group = await TelegramGroup.findOne({ groupId }).lean();
      const title = group?.title || groupId;
      const rows = await fetchGroupMessagesFromTelegram(
        sessionDoc.sessionString,
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
