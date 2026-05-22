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
  mediaType?: string;
  hasMedia?: boolean;
}) {
  const preview = input.text.slice(0, 120).replace(/\s+/g, " ").trim();

  await upsertTelegramGroup(input.groupId, input.groupTitle);

  const existing = await TelegramMessage.findOne({
    groupId: input.groupId,
    messageId: input.messageId,
  });

  if (existing) {
    await TelegramMessage.updateOne(
      { _id: existing._id },
      {
        $set: {
          text: input.text,
          senderName: input.senderName,
          sentAt: input.sentAt,
          mediaType: input.mediaType || "none",
          hasMedia: !!input.hasMedia,
        },
      }
    );
    await TelegramGroup.updateOne(
      { groupId: input.groupId },
      {
        $set: {
          title: input.groupTitle,
          lastMessageAt: input.sentAt,
          lastMessagePreview: preview,
        },
      }
    );
    return { created: false, updated: true, message: existing };
  }

  const message = await TelegramMessage.create({
    groupId: input.groupId,
    messageId: input.messageId,
    text: input.text,
    senderName: input.senderName,
    sentAt: input.sentAt,
    mediaType: input.mediaType || "none",
    hasMedia: !!input.hasMedia,
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

export async function bulkStoreTelegramMessages(
  groupId: string,
  groupTitle: string,
  rows: {
    messageId: string;
    text: string;
    senderName?: string;
    sentAt: Date;
    mediaType?: string;
    hasMedia?: boolean;
  }[]
) {
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const r = await storeTelegramMessage({
      groupId,
      groupTitle,
      ...row,
    });
    if (r.created) created++;
    else if (r.updated) updated++;
  }
  return { created, updated, total: rows.length };
}
