/**
 * Upstash QStash Scheduler Helper for Placement AI
 * Schedules exact-second HTTP callbacks to /api/reminders/process-due
 * when calls or reminders are created / rescheduled.
 */
export async function scheduleQStashCallAlert(reminderId: string, scheduledAtIso: string) {
  const token = process.env.QSTASH_TOKEN || process.env.UPSTASH_QSTASH_TOKEN;
  if (!token) {
    console.log("[QStash] No QSTASH_TOKEN configured in env. Falling back to Vercel Cron & Poller.");
    return { ok: false, reason: "no_token" };
  }

  try {
    const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.WEB_APP_URL || "https://plarm.vercel.app";
    const publicAppUrl = rawAppUrl.includes("localhost") ? "https://plarm.vercel.app" : rawAppUrl;
    const targetUrl = `${publicAppUrl.replace(/\/$/, "")}/api/reminders/process-due`;
    
    const notBeforeSeconds = Math.floor(new Date(scheduledAtIso).getTime() / 1000);
    const workerSecret = process.env.TELEGRAM_WORKER_SECRET || "placemint_secure_worker_2026";

    const qstashHost = (process.env.QSTASH_URL || "https://qstash.upstash.io").replace(/\/$/, "");
    const res = await fetch(`${qstashHost}/v2/publish/${targetUrl}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Upstash-Not-Before": String(notBeforeSeconds),
        "Upstash-Retries": "3",
        "x-worker-secret": workerSecret,
      },
      body: JSON.stringify({ reminderId }),
    });

    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      console.error("[QStash] Publish failed:", data);
      return { ok: false, error: data };
    }

    console.log("[QStash] Successfully scheduled delayed trigger messageId:", data.messageId);
    return { ok: true, messageId: data.messageId };
  } catch (e) {
    console.error("[QStash] Exception scheduling call alert:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
