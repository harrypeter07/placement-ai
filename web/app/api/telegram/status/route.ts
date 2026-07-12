/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabase } from "@/lib/supabase";
import { buildTelegramWorkerDiagnostics } from "@/lib/telegram-worker-diagnostics";
import { isValidTelethonSessionString } from "@/lib/telegram-telethon-session";

export const runtime = "nodejs";

const WORKER_STALE_MS = 2 * 60 * 1000;

function isWorkerOnline(status: string, updatedAt: Date): boolean {
  return status === "online" && Date.now() - updatedAt.getTime() < WORKER_STALE_MS;
}

function isWorkerWaiting(status: string, updatedAt: Date): boolean {
  return status === "waiting" && Date.now() - updatedAt.getTime() < WORKER_STALE_MS;
}

export async function GET() {
  try {
    await requireAuth();

    let heartbeat: {
      status: string;
      groupsMonitored: number;
      updatedAt: Date;
      lastError?: string;
      detailLog?: string;
    } | null = null;
    let lastTelegramDeadline: { createdAt?: Date; company?: string } | null = null;
    let telegramDeadlineCount = 0;

    // Query Worker Heartbeat from Supabase
    try {
      const { data: doc } = await supabase
        .from("worker_heartbeats")
        .select("*")
        .eq("service", "telegram-worker")
        .maybeSingle();

      if (doc) {
        heartbeat = {
          status: doc.status,
          groupsMonitored: doc.groups_monitored || 0,
          updatedAt: new Date(doc.updated_at),
          lastError: doc.last_error || undefined,
          detailLog: doc.detail_log || undefined,
        };
      }

      // Query last deadline from Telegram in Supabase
      const { data: deadlineList } = await supabase
        .from("deadlines")
        .select("created_at, company")
        .not("telegram_group_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (deadlineList && deadlineList.length > 0) {
        lastTelegramDeadline = {
          createdAt: new Date(deadlineList[0].created_at),
          company: deadlineList[0].company,
        };
      }

      // Count deadlines matching Telegram sources in Supabase
      const { count } = await supabase
        .from("deadlines")
        .select("id", { count: "exact", head: true })
        .or("telegram_group_id.neq.,source_message_id.neq.");
      
      telegramDeadlineCount = count || 0;
    } catch (dbErr) {
      console.warn("[telegram/status] Supabase partial fail:", dbErr);
    }

    const workerConfigured = !!process.env.TELEGRAM_WORKER_SECRET;

    let telegramAccountConnected = false;
    let hasTelethonSession = false;

    // Check connected session from Supabase
    try {
      const { data: sessionDoc } = await supabase
        .from("telegram_worker_sessions")
        .select("session_string, telethon_session_string")
        .eq("key", "default")
        .maybeSingle();

      if (sessionDoc) {
        telegramAccountConnected = !!sessionDoc.session_string;
        hasTelethonSession = isValidTelethonSessionString(
          sessionDoc.telethon_session_string
        );
      }
    } catch (sessionErr) {
      console.warn("[telegram/status] Session fetch failed:", sessionErr);
    }

    const workerOnline =
      !!heartbeat && isWorkerOnline(heartbeat.status, heartbeat.updatedAt);
    const heartbeatWaiting =
      !!heartbeat && isWorkerWaiting(heartbeat.status, heartbeat.updatedAt);
    const workerNeedsTelethonSync =
      telegramAccountConnected && !hasTelethonSession;
    const workerWaiting = heartbeatWaiting || workerNeedsTelethonSync;

    const serverDiagnostics =
      workerWaiting || !telegramAccountConnected || !hasTelethonSession
        ? await buildTelegramWorkerDiagnostics()
        : null;

    let workerStatus: string = heartbeat ? "stale" : "offline";
    if (workerOnline) workerStatus = "online";
    else if (workerWaiting) workerStatus = "waiting";

    const displayStatus = workerOnline
      ? "online"
      : workerWaiting
        ? "waiting"
        : workerStatus;

    return NextResponse.json({
      connected: workerOnline,
      telegramAccountConnected,
      hasTelethonSession,
      workerNeedsTelethonSync,
      workerConfigured,
      workerStatus: displayStatus,
      workerWaiting,
      workerLastError:
        workerNeedsTelethonSync && !heartbeat?.lastError
          ? "Session in DB is GramJS-only — click Sync Railway worker session in Settings"
          : heartbeat?.lastError,
      workerDetailLog:
        heartbeat?.detailLog ||
        serverDiagnostics?.detailLog ||
        undefined,
      suggestedFix: serverDiagnostics?.suggestedFix,
      groupsMonitored: heartbeat?.groupsMonitored ?? 0,
      lastWorkerPing: heartbeat?.updatedAt ?? null,
      lastIngestedAt: lastTelegramDeadline?.createdAt ?? null,
      telegramDeadlines: telegramDeadlineCount,
      lastCompany: lastTelegramDeadline?.company ?? null,
      databaseOnline: true,
      setup: {
        step1: "Settings → Connect Telegram (phone + OTP)",
        step2: "Redeploy Railway worker after connecting",
        step3: "Notifications → enable Monitor on placement groups",
        step4: "Post in a monitored group or use Test Parser below",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
