import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Deadline } from "@/models/Deadline";
import { WorkerHeartbeat } from "@/models/WorkerHeartbeat";
import { requireAuth } from "@/lib/api-auth";
import { getMemoryHeartbeat } from "@/lib/worker-heartbeat-store";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";
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
    let dbOnline = false;

    try {
      await connectDB();
      dbOnline = true;
      const doc = await WorkerHeartbeat.findOne({ service: "telegram-worker" }).sort({
        updatedAt: -1,
      });
      if (doc) {
        heartbeat = {
          status: doc.status,
          groupsMonitored: doc.groupsMonitored,
          updatedAt: doc.updatedAt,
          lastError: doc.lastError,
          detailLog: doc.detailLog,
        };
      }
      lastTelegramDeadline = await Deadline.findOne({
        telegramGroupId: { $exists: true, $ne: null },
      }).sort({ createdAt: -1 });
      telegramDeadlineCount = await Deadline.countDocuments({
        $or: [
          { telegramGroupId: { $exists: true, $ne: "" } },
          { sourceMessageId: { $exists: true, $ne: "" } },
        ],
      });
    } catch (dbErr) {
      console.warn("[telegram/status] DB partial fail:", dbErr instanceof Error ? dbErr.message : dbErr);
    }

    if (!heartbeat) {
      const mem = getMemoryHeartbeat();
      if (mem) {
        heartbeat = {
          status: mem.status,
          groupsMonitored: mem.groupsMonitored,
          updatedAt: mem.updatedAt,
          lastError: mem.lastError,
          detailLog: mem.detailLog,
        };
      }
    }

    const workerConfigured = !!process.env.TELEGRAM_WORKER_SECRET;

    let telegramAccountConnected = false;
    let hasTelethonSession = false;
    if (dbOnline) {
      const sessionDoc = await TelegramWorkerSession.findOne({ key: "default" })
        .select("+sessionString +telethonSessionString")
        .lean();
      telegramAccountConnected = !!sessionDoc?.sessionString;
      hasTelethonSession = isValidTelethonSessionString(
        sessionDoc?.telethonSessionString
      );
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
          ? "Session in DB is GramJS-only — click Sync Render worker session in Settings"
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
      databaseOnline: dbOnline,
      setup: {
        step1: "Settings → Connect Telegram (phone + OTP)",
        step2: "Redeploy Render worker after connecting",
        step3: "Notifications → enable Monitor on placement groups",
        step4: "Post in a monitored group or use Test Parser below",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
