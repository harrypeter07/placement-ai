import { connectDB } from "@/lib/mongodb";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";
import { WorkerHeartbeat } from "@/models/WorkerHeartbeat";

function maskSecret(set: boolean) {
  return set ? "set (length ok)" : "MISSING";
}

function isValidTelethonPrefix(s: string | undefined) {
  const t = (s || "").trim();
  return t.length >= 40 && t.startsWith("1");
}

/** Server-side checks shown in dashboard when worker is waiting */
export async function buildTelegramWorkerDiagnostics() {
  const lines: string[] = [];
  const webUrl = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(
    /\/$/,
    ""
  );
  const workerUrl = (process.env.TELEGRAM_WORKER_PUBLIC_URL || "").replace(/\/$/, "");

  lines.push("=== Vercel (web app) ===");
  lines.push(`NEXTAUTH_URL / app URL: ${webUrl || "MISSING"}`);
  lines.push(`TELEGRAM_WORKER_SECRET: ${maskSecret(!!process.env.TELEGRAM_WORKER_SECRET)}`);
  lines.push(`TELEGRAM_API_ID: ${process.env.TELEGRAM_API_ID ? "set" : "MISSING"}`);
  lines.push(`TELEGRAM_API_HASH: ${process.env.TELEGRAM_API_HASH ? "set" : "MISSING"}`);
  lines.push(`MONGODB_URI: ${process.env.MONGODB_URI ? "set" : "MISSING"}`);
  lines.push(`TELEGRAM_WORKER_PUBLIC_URL (cron ping): ${workerUrl || "not set (optional)"}`);

  let sessionInDb = false;
  let hasGramjs = false;
  let hasTelethon = false;
  let phoneHint = "";
  let dbOk = false;

  try {
    await connectDB();
    dbOk = true;
    const doc = await TelegramWorkerSession.findOne({ key: "default" })
      .select("+sessionString +telethonSessionString phoneNumber connectedAt")
      .lean();
    if (doc?.sessionString) {
      sessionInDb = true;
      hasGramjs = doc.sessionString.length > 20;
      hasTelethon = isValidTelethonPrefix(doc.telethonSessionString);
      phoneHint = doc.phoneNumber || "";
      lines.push("");
      lines.push("=== MongoDB session (TelegramWorkerSession) ===");
      lines.push(`Record found: yes`);
      lines.push(`Phone: ${phoneHint || "unknown"}`);
      lines.push(`Connected at: ${doc.connectedAt ? new Date(doc.connectedAt).toISOString() : "?"}`);
      lines.push(`GramJS session (web): ${hasGramjs ? `yes (${doc.sessionString.length} chars)` : "no"}`);
      lines.push(
        `Telethon session (Render worker): ${hasTelethon ? `yes (${(doc.telethonSessionString || "").length} chars)` : "NO — click Sync Render worker session in Settings"}`
      );
    } else {
      lines.push("");
      lines.push("=== MongoDB session ===");
      lines.push("No TelegramWorkerSession — Connect Telegram in Settings (phone + OTP)");
    }

    const hb = await WorkerHeartbeat.findOne({ service: "telegram-worker" })
      .sort({ updatedAt: -1 })
      .lean();
    if (hb) {
      lines.push("");
      lines.push("=== Last worker heartbeat ===");
      lines.push(`Status: ${hb.status}`);
      lines.push(`Updated: ${hb.updatedAt ? new Date(hb.updatedAt).toISOString() : "?"}`);
      lines.push(`Groups monitored: ${hb.groupsMonitored}`);
      if (hb.lastError) lines.push(`Summary: ${hb.lastError}`);
      if (hb.detailLog) {
        lines.push("");
        lines.push("--- Worker detail log ---");
        lines.push(hb.detailLog);
      }
    }
  } catch (e) {
    lines.push("");
    lines.push(`=== Database error ===`);
    lines.push(e instanceof Error ? e.message : "Could not query MongoDB");
  }

  lines.push("");
  lines.push("=== What Render worker needs ===");
  lines.push(`WEB_APP_URL on Render must be: ${webUrl || "(your Vercel URL)"}`);
  lines.push("TELEGRAM_WORKER_SECRET on Render = same value as Vercel");
  lines.push("MONGODB_URI on Render = same as Vercel");
  if (sessionInDb && !hasTelethon) {
    lines.push("");
    lines.push("FIX: Settings → Sync Render worker session (or reconnect Telegram)");
  }
  if (!sessionInDb) {
    lines.push("");
    lines.push("FIX: Settings → Connect Telegram → then Sync Render worker session");
  }

  let suggestedFix = "Connect Telegram in Settings, then Sync Render worker session.";
  if (!process.env.TELEGRAM_WORKER_SECRET) {
    suggestedFix = "Set TELEGRAM_WORKER_SECRET on Vercel and Render (must match).";
  } else if (!dbOk) {
    suggestedFix = "Fix MONGODB_URI on Vercel — database unreachable.";
  } else if (!sessionInDb) {
    suggestedFix = "Connect Telegram in Settings (phone + OTP).";
  } else if (!hasTelethon) {
    suggestedFix = "Click Sync Render worker session in Settings.";
  } else if (!hasGramjs) {
    suggestedFix = "Reconnect Telegram in Settings.";
  }

  return {
    lines,
    detailLog: lines.join("\n"),
    sessionInDb,
    hasTelethonSession: hasTelethon,
    hasGramjsSession: hasGramjs,
    databaseOnline: dbOk,
    suggestedFix,
  };
}
