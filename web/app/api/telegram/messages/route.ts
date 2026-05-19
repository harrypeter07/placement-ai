import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { TelegramMessage } from "@/models/TelegramMessage";
import { requireAuth } from "@/lib/api-auth";
import { storeTelegramMessage } from "@/lib/telegram-messages";

export const runtime = "nodejs";

const ingestSchema = z.object({
  apiKey: z.string().min(1),
  groupId: z.string(),
  groupTitle: z.string(),
  messageId: z.string(),
  text: z.string(),
  senderName: z.string().optional(),
  sentAt: z.string(),
});

function checkWorkerSecret(apiKey: string | undefined) {
  return !process.env.TELEGRAM_WORKER_SECRET || apiKey === process.env.TELEGRAM_WORKER_SECRET;
}

/** GET — messages for a group ?groupId= */
export async function GET(req: Request) {
  try {
    await requireAuth();
    const groupId = new URL(req.url).searchParams.get("groupId");
    if (!groupId) {
      return NextResponse.json({ error: "groupId required" }, { status: 400 });
    }

    const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") || 50), 100);

    await connectDB();
    const messages = await TelegramMessage.find({ groupId })
      .sort({ sentAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json(messages.reverse());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

/** POST — worker logs a message */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (!checkWorkerSecret(parsed.data.apiKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const text = parsed.data.text.trim();
    if (!text) {
      return NextResponse.json({ skipped: true, reason: "Empty message" });
    }

    await connectDB();
    const result = await storeTelegramMessage({
      groupId: parsed.data.groupId,
      groupTitle: parsed.data.groupTitle,
      messageId: parsed.data.messageId,
      text,
      senderName: parsed.data.senderName,
      sentAt: new Date(parsed.data.sentAt),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
