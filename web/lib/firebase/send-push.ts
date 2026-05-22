import { connectDB } from "@/lib/mongodb";
import { PushToken } from "@/models/PushToken";
import type { EscalationLevel } from "@/models/NotificationLog";

/** Sends FCM via legacy HTTP API when FIREBASE_LEGACY_SERVER_KEY is set */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; level?: EscalationLevel }
) {
  const key = process.env.FIREBASE_LEGACY_SERVER_KEY;
  if (!key) return { sent: 0, skipped: true };

  await connectDB();
  const tokens = await PushToken.find({ userId }).lean();
  if (!tokens.length) return { sent: 0 };

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
