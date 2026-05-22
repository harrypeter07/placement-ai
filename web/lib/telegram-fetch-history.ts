import { Api } from "telegram";
import { createTelegramClient } from "@/lib/telegram-gramjs";

export type FetchedTelegramMessage = {
  messageId: string;
  text: string;
  senderName?: string;
  sentAt: Date;
  mediaType: "none" | "photo" | "video" | "document" | "sticker" | "voice" | "other";
  hasMedia: boolean;
};

function messageToRow(msg: Api.Message): FetchedTelegramMessage | null {
  if (!(msg instanceof Api.Message) || !msg.id) return null;

  const text = msg.message || "";
  let mediaType: FetchedTelegramMessage["mediaType"] = "none";
  let mediaLabel = "";

  if (msg.photo) {
    mediaType = "photo";
    mediaLabel = "[Photo]";
  } else if (msg.video) {
    mediaType = "video";
    mediaLabel = "[Video]";
  } else if (msg.document) {
    mediaType = "document";
    const docName = (msg.document as { fileName?: string }).fileName;
    mediaLabel = docName ? `[Document: ${docName}]` : "[Document]";
  } else if (msg.sticker) {
    mediaType = "sticker";
    mediaLabel = "[Sticker]";
  } else if (msg.voice) {
    mediaType = "voice";
    mediaLabel = "[Voice message]";
  } else if (msg.media) {
    mediaType = "other";
    mediaLabel = "[Media]";
  }

  const displayText = text.trim() || mediaLabel;
  if (!displayText) return null;

  const raw = msg.date as number | undefined;
  const date =
    typeof raw === "number"
      ? new Date(raw > 1e12 ? raw : raw * 1000)
      : new Date();

  return {
    messageId: String(msg.id),
    text: displayText,
    senderName: undefined,
    sentAt: date,
    mediaType,
    hasMedia: mediaType !== "none",
  };
}

/** Pull recent messages for one group/channel from Telegram and return normalized rows. */
export async function fetchGroupMessagesFromTelegram(
  sessionString: string,
  groupId: string,
  limit = 50
): Promise<FetchedTelegramMessage[]> {
  const client = await createTelegramClient(sessionString);
  const cap = Math.min(100, Math.max(10, limit));
  try {
    const entity = await client.getInputEntity(groupId);
    const messages = await client.getMessages(entity, { limit: cap });
    const rows: FetchedTelegramMessage[] = [];

    for (const msg of messages) {
      const row = messageToRow(msg);
      if (!row) continue;
      try {
        const sender = await msg.getSender();
        if (sender) {
          if ("firstName" in sender && sender.firstName) {
            row.senderName = [sender.firstName, "lastName" in sender ? sender.lastName : ""]
              .filter(Boolean)
              .join(" ");
          } else if ("title" in sender && sender.title) {
            row.senderName = String(sender.title);
          } else if ("username" in sender && sender.username) {
            row.senderName = `@${sender.username}`;
          }
        }
      } catch {
        /* sender optional */
      }
      rows.push(row);
    }

    return rows.reverse();
  } finally {
    await client.disconnect();
  }
}

/** Download photo bytes for a message (for media proxy). */
export async function downloadMessagePhoto(
  sessionString: string,
  groupId: string,
  messageId: string
): Promise<Buffer | null> {
  const client = await createTelegramClient(sessionString);
  try {
    const entity = await client.getInputEntity(groupId);
    const msg = await client.getMessages(entity, { ids: [Number(messageId)] });
    const first = msg[0];
    if (!first || !(first instanceof Api.Message) || !first.photo) return null;
    const buf = await client.downloadMedia(first, {});
    if (!buf || !(buf instanceof Buffer)) return null;
    if (buf.length > 4 * 1024 * 1024) return null;
    return buf;
  } finally {
    await client.disconnect();
  }
}
