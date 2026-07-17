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
    // 1. Keep render worker warm
    try {
      await fetch(`${workerUrl}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }).catch(() => undefined);
    } catch {}

    // 2. Trigger auto-analyze groups in background
    let autoAnalyzeResult = null;
    try {
      const host = req.headers.get("host") || "plarm.vercel.app";
      const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
      const autoAnalyzeBase = `${protocol}://${host}/api/cron/auto-analyze`;
      const res = await fetch(autoAnalyzeBase, {
        method: "POST",
        headers: {
          "x-worker-secret": cronSecret || "",
        },
        signal: AbortSignal.timeout(20_000),
      });
      autoAnalyzeResult = await res.json().catch(() => ({}));
    } catch (e: unknown) {
      autoAnalyzeResult = { error: e instanceof Error ? e.message : String(e) };
    }

    // 3. Trigger process-due reminders in background
    let processDueResult = null;
    try {
      const host = req.headers.get("host") || "plarm.vercel.app";
      const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
      const processDueUrl = `${protocol}://${host}/api/reminders/process-due`;
      const res = await fetch(processDueUrl, {
        method: "POST",
        headers: {
          "x-worker-secret": cronSecret || "",
        },
        signal: AbortSignal.timeout(20_000),
      });
      processDueResult = await res.json().catch(() => ({}));
    } catch (e: unknown) {
      processDueResult = { error: e instanceof Error ? e.message : String(e) };
    }

    return NextResponse.json({
      ok: true,
      pingedAt: new Date().toISOString(),
      autoAnalyze: autoAnalyzeResult,
      processDue: processDueResult,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ping failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
