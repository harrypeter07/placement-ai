import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { WorkerHeartbeat } from "@/models/WorkerHeartbeat";
import { setMemoryHeartbeat } from "@/lib/worker-heartbeat-store";

export const runtime = "nodejs";

const schema = z.object({
  apiKey: z.string().min(1),
  status: z.enum(["online", "offline", "waiting"]).default("online"),
  groupsMonitored: z.coerce.number().default(0),
  lastMessageAt: z.string().nullish(),
  lastError: z.string().nullish(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (
      process.env.TELEGRAM_WORKER_SECRET &&
      parsed.data.apiKey !== process.env.TELEGRAM_WORKER_SECRET
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const memoryPayload = {
      status: parsed.data.status,
      groupsMonitored: parsed.data.groupsMonitored,
      lastMessageAt: parsed.data.lastMessageAt ? new Date(parsed.data.lastMessageAt) : undefined,
      lastError: parsed.data.lastError ?? undefined,
    };

    try {
      await connectDB();
      const heartbeat = await WorkerHeartbeat.findOneAndUpdate(
        { service: "telegram-worker" },
        {
          service: "telegram-worker",
          status: parsed.data.status,
          groupsMonitored: parsed.data.groupsMonitored,
          lastMessageAt: memoryPayload.lastMessageAt,
          lastError: parsed.data.lastError,
        },
        { upsert: true, new: true }
      );
      setMemoryHeartbeat(memoryPayload);
      return NextResponse.json({ ok: true, heartbeat, storage: "database" });
    } catch (dbErr) {
      const message = dbErr instanceof Error ? dbErr.message : "Database unavailable";
      console.error("[heartbeat] DB failed, using memory store:", message);
      const heartbeat = setMemoryHeartbeat(memoryPayload);
      return NextResponse.json({
        ok: true,
        heartbeat,
        storage: "memory",
        warning: "Saved in memory only — MongoDB unreachable. Dashboard worker status will still update.",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[heartbeat]", message);
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === "development" ? message : "Server error",
      },
      { status: 500 }
    );
  }
}
