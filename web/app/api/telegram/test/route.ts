/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getTelegramApiCredentials, createTelegramClient } from "@/lib/telegram-gramjs";

export const runtime = "nodejs";

/** GET — diagnose GramJS connection to Telegram from Vercel */
export async function GET() {
  const diagnostics: Record<string, any> = {
    step: "init",
    timestamp: new Date().toISOString(),
    apiId: null,
    apiHashLength: 0,
    envKeys: Object.keys(process.env).filter(k => k.includes("TELEGRAM")),
  };

  try {
    diagnostics.step = "load_credentials";
    const { apiId, apiHash } = getTelegramApiCredentials();
    diagnostics.apiId = apiId;
    diagnostics.apiHashLength = apiHash?.length || 0;

    diagnostics.step = "create_client";
    const client = await createTelegramClient("");
    diagnostics.step = "connect_client";
    
    // Attempt connection
    await client.connect();
    diagnostics.step = "client_connected";
    
    const isConnected = await client.checkAuthorization();
    diagnostics.isConnected = isConnected;
    
    await client.disconnect();
    diagnostics.step = "client_disconnected";
    
    return NextResponse.json({
      ok: true,
      message: "GramJS successfully connected to Telegram from this server!",
      diagnostics
    });
  } catch (err) {
    const errorDetails = {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
      name: err instanceof Error ? err.name : null,
    };
    console.error("[GET telegram/test] GramJS connection failed:", err);
    return NextResponse.json({
      ok: false,
      message: "GramJS connection failed",
      step: diagnostics.step,
      error: errorDetails,
      diagnostics
    }, { status: 500 });
  }
}

/** Test AI parser without Telegram — creates deadline via ingest internally */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/telegram/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: body.message,
        messageId: `test-${Date.now()}`,
        groupId: "test-group",
        apiKey: process.env.TELEGRAM_WORKER_SECRET,
      }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
