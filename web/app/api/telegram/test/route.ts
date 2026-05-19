import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";

const schema = z.object({
  message: z.string().min(20),
});

/** Test AI parser without Telegram — creates deadline via ingest internally */
export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Message too short (min 20 chars)" }, { status: 400 });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/telegram/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: parsed.data.message,
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
