import { supabase } from "@/lib/supabase";

export async function upsertTelegramGroup(
  groupId: string,
  title: string,
  extra?: { kind?: string; username?: string }
) {
  const payload = {
    group_id: groupId,
    title: title,
    username: extra?.username || null,
    active: true,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("telegram_groups")
    .upsert([payload], { onConflict: "group_id" })
    .select("*")
    .single();

  if (error) {
    console.error("[telegram-messages] upsertTelegramGroup error:", error);
  }
  return data;
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
  await upsertTelegramGroup(input.groupId, input.groupTitle);

  const payload = {
    group_id: input.groupId,
    group_title: input.groupTitle,
    message_id: input.messageId,
    text: input.text,
    sender_name: input.senderName || null,
    sent_at: new Date(input.sentAt).toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data: inserted, error } = await supabase
    .from("telegram_messages")
    .upsert([payload], { onConflict: "group_id, message_id" })
    .select("*")
    .single();

  if (error) {
    console.error("[telegram-messages] storeTelegramMessage error:", error);
    return { created: false, updated: false };
  }
  return { created: true, updated: false, message: inserted };
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
  const updated = 0;
  for (const row of rows) {
    const r = await storeTelegramMessage({
      groupId,
      groupTitle,
      ...row,
    });
    if (r.created) created++;
  }
  return { created, updated, total: rows.length };
}
