import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron hits this route to keep the Render Web Service worker warm.
 * Set TELEGRAM_WORKER_PUBLIC_URL on Vercel (your Render service URL).
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET || process.env.TELEGRAM_WORKER_SECRET;
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const queryKey = new URL(req.url).searchParams.get("key");

  if (cronSecret && bearer !== cronSecret && queryKey !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerUrl = (process.env.TELEGRAM_WORKER_PUBLIC_URL || "").replace(/\/$/, "");
  if (!workerUrl) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_WORKER_PUBLIC_URL not set on Vercel" },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(`${workerUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      worker: body,
      pingedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ping failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
