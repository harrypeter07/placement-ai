import { connectDB } from "@/lib/mongodb";
import { discoverTelegramGroups } from "@/lib/telegram-gramjs";
import { upsertTelegramGroup } from "@/lib/telegram-messages";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";

export async function syncGroupCatalogFromSession() {
  await connectDB();
  const sessionDoc = await TelegramWorkerSession.findOne({ key: "default" })
    .select("+sessionString")
    .lean();

  if (!sessionDoc?.sessionString) {
    throw new Error("Connect Telegram in Settings first");
  }

  const discovered = await discoverTelegramGroups(sessionDoc.sessionString);
  for (const g of discovered) {
    await upsertTelegramGroup(g.groupId, g.title, { kind: g.kind, username: g.username });
  }

  return { synced: discovered.length, groups: discovered };
}
