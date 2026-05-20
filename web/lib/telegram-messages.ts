import { TelegramGroup } from "@/models/TelegramGroup";
import { TelegramMessage } from "@/models/TelegramMessage";

export async function upsertTelegramGroup(
  groupId: string,
  title: string,
  extra?: { kind?: string; username?: string }
) {
  const now = new Date();
  return TelegramGroup.findOneAndUpdate(
    { groupId },
    {
      $setOnInsert: { groupId },
      $set: {
        title,
        lastDiscoveredAt: now,
        ...(extra?.kind ? { kind: extra.kind } : {}),
        ...(extra?.username ? { username: extra.username } : {}),
      },
    },
    { upsert: true, new: true }
  );
}

export async function storeTelegramMessage(input: {
  groupId: string;
  groupTitle: string;
  messageId: string;
  text: string;
  senderName?: string;
  sentAt: Date;
}) {
  const preview = input.text.slice(0, 120).replace(/\s+/g, " ").trim();

  await upsertTelegramGroup(input.groupId, input.groupTitle);

  const existing = await TelegramMessage.findOne({
    groupId: input.groupId,
    messageId: input.messageId,
  });
  if (existing) return { created: false, message: existing };

  const message = await TelegramMessage.create({
    groupId: input.groupId,
    messageId: input.messageId,
    text: input.text,
    senderName: input.senderName,
    sentAt: input.sentAt,
  });

  await TelegramGroup.updateOne(
    { groupId: input.groupId },
    {
      $set: {
        title: input.groupTitle,
        lastMessageAt: input.sentAt,
        lastMessagePreview: preview,
      },
      $inc: { messageCount: 1 },
    }
  );

  return { created: true, message };
}
