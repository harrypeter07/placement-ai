import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Deadline } from "@/models/Deadline";
import { WorkerHeartbeat } from "@/models/WorkerHeartbeat";
import { requireAuth } from "@/lib/api-auth";
import { getMemoryHeartbeat } from "@/lib/worker-heartbeat-store";

export const runtime = "nodejs";

const WORKER_STALE_MS = 2 * 60 * 1000;

function isWorkerOnline(
  status: string,
  updatedAt: Date,
  groupsMonitored: number
): boolean {
  return (
    status === "online" &&
    Date.now() - updatedAt.getTime() < WORKER_STALE_MS &&
    groupsMonitored >= 0
  );
}

export async function GET() {
  try {
    await requireAuth();

    let heartbeat: {
      status: string;
      groupsMonitored: number;
      updatedAt: Date;
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
        };
      }
    }

    const workerOnline =
      !!heartbeat && isWorkerOnline(heartbeat.status, heartbeat.updatedAt, heartbeat.groupsMonitored);

    const workerConfigured = !!process.env.TELEGRAM_WORKER_SECRET;

    return NextResponse.json({
      connected: workerOnline,
      workerConfigured,
      workerStatus: workerOnline ? "online" : heartbeat ? "stale" : "offline",
      groupsMonitored: heartbeat?.groupsMonitored ?? 0,
      lastWorkerPing: heartbeat?.updatedAt ?? null,
      lastIngestedAt: lastTelegramDeadline?.createdAt ?? null,
      telegramDeadlines: telegramDeadlineCount,
      lastCompany: lastTelegramDeadline?.company ?? null,
      databaseOnline: dbOnline,
      setup: {
        step1: "Run web app: npm run dev (from repo root)",
        step2: "Run worker: cd telegram-worker && python listener.py",
        step3: "Set TELEGRAM_GROUP_IDS in telegram-worker/.env to your placement group chat IDs",
        step4: "Post a placement message in the group or use Test Parser in Settings",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
