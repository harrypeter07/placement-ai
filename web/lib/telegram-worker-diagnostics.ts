import { supabase } from "@/lib/supabase";

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
  lines.push(`Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "MISSING"}`);
  lines.push(`TELEGRAM_WORKER_PUBLIC_URL (cron ping): ${workerUrl || "not set (optional)"}`);

  let sessionInDb = false;
  let hasGramjs = false;
  let hasTelethon = false;
  let phoneHint = "";
  let dbOk = false;

  try {
    dbOk = true;
    const { data: doc } = await supabase
      .from("telegram_worker_sessions")
      .select("session_string, telethon_session_string, phone_number, connected_at")
      .eq("key", "default")
      .maybeSingle();

    if (doc?.session_string) {
      sessionInDb = true;
      hasGramjs = doc.session_string.length > 20;
      hasTelethon = isValidTelethonPrefix(doc.telethon_session_string);
      phoneHint = doc.phone_number || "";
      lines.push("");
      lines.push("=== Supabase session (telegram_worker_sessions) ===");
      lines.push(`Record found: yes`);
      lines.push(`Phone: ${phoneHint || "unknown"}`);
      lines.push(`Connected at: ${doc.connected_at ? new Date(doc.connected_at).toISOString() : "?"}`);
      lines.push(`GramJS session (web): ${hasGramjs ? `yes (${doc.session_string.length} chars)` : "no"}`);
      lines.push(
        `Telethon session (Railway worker): ${hasTelethon ? `yes (${(doc.telethon_session_string || "").length} chars)` : "NO — click Sync Railway worker session in Settings"}`
      );
    } else {
      lines.push("");
      lines.push("=== Supabase session ===");
      lines.push("No telegram_worker_sessions — Connect Telegram in Settings (phone + OTP)");
    }

    const { data: hb } = await supabase
      .from("worker_heartbeats")
      .select("*")
      .eq("service", "telegram-worker")
      .maybeSingle();

    if (hb) {
      lines.push("");
      lines.push("=== Last worker heartbeat ===");
      lines.push(`Status: ${hb.status}`);
      lines.push(`Updated: ${hb.updated_at ? new Date(hb.updated_at).toISOString() : "?"}`);
      lines.push(`Groups monitored: ${hb.groups_monitored}`);
      if (hb.last_error) lines.push(`Summary: ${hb.last_error}`);
      if (hb.detail_log) {
        lines.push("");
        lines.push("--- Worker detail log ---");
        lines.push(hb.detail_log);
      }
    }
  } catch (e) {
    lines.push("");
    lines.push(`=== Database error ===`);
    lines.push(e instanceof Error ? e.message : "Could not query Supabase");
  }

  lines.push("");
  lines.push("=== What Railway worker needs ===");
  lines.push(`NEXT_PUBLIC_APP_URL on Railway must be: ${webUrl || "(your Vercel URL)"}`);
  lines.push("TELEGRAM_WORKER_SECRET on Railway = same value as Vercel");
  lines.push("NEXT_PUBLIC_SUPABASE_URL on Railway = same as Vercel");
  if (sessionInDb && !hasTelethon) {
    lines.push("");
    lines.push("FIX: Settings → Sync Railway worker session (or reconnect Telegram)");
  }
  if (!sessionInDb) {
    lines.push("");
    lines.push("FIX: Settings → Connect Telegram → then Sync Railway worker session");
  }

  let suggestedFix = "Connect Telegram in Settings, then Sync Railway worker session.";
  if (!process.env.TELEGRAM_WORKER_SECRET) {
    suggestedFix = "Set TELEGRAM_WORKER_SECRET on Vercel and Railway (must match).";
  } else if (!dbOk) {
    suggestedFix = "Fix Supabase connection variables — database unreachable.";
  } else if (!sessionInDb) {
    suggestedFix = "Connect Telegram in Settings (phone + OTP).";
  } else if (!hasTelethon) {
    suggestedFix = "Click Sync Railway worker session in Settings.";
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
