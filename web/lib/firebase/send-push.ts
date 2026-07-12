import { supabase } from "@/lib/supabase";

/** Sends FCM via legacy HTTP API when FIREBASE_LEGACY_SERVER_KEY is set */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; level?: string }
) {
  const key = process.env.FIREBASE_LEGACY_SERVER_KEY;
  if (!key) return { sent: 0, skipped: true };

  // Query push tokens from Supabase
  const { data: tokens, error } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", userId);

  if (error || !tokens || !tokens.length) return { sent: 0 };

  let sent = 0;
  for (const t of tokens) {
    try {
      const res = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          Authorization: `key=${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: t.token,
          notification: {
            title: payload.title,
            body: payload.body,
            icon: "/icons/icon-192.png",
          },
          data: {
            url: payload.url || "/dashboard/reminders",
            level: payload.level || "normal",
          },
        }),
      });
      if (res.ok) sent++;
    } catch {
      /* continue */
    }
  }
  return { sent };
}
