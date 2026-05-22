import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api-auth";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";
import { TelegramGroup } from "@/models/TelegramGroup";
import { fetchGroupMessagesFromTelegram } from "@/lib/telegram-fetch-history";
import { bulkStoreTelegramMessages } from "@/lib/telegram-messages";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  groupId: z.string().min(1),
  limit: z.coerce.number().min(10).max(100).optional(),
});

/** POST — pull messages from Telegram for one group into the database */
export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    await connectDB();
    const sessionDoc = await TelegramWorkerSession.findOne({ key: "default" })
      .select("+sessionString")
      .lean();
    if (!sessionDoc?.sessionString) {
      return NextResponse.json({ error: "Connect Telegram in Settings first" }, { status: 400 });
    }

    const group = await TelegramGroup.findOne({ groupId: parsed.data.groupId }).lean();
    const title = group?.title || parsed.data.groupId;

    const rows = await fetchGroupMessagesFromTelegram(
      sessionDoc.sessionString,
      parsed.data.groupId,
      parsed.data.limit ?? 50
    );

    const stored = await bulkStoreTelegramMessages(parsed.data.groupId, title, rows);

    return NextResponse.json({
      ok: true,
      fetched: rows.length,
      ...stored,
      message:
        rows.length > 0
          ? `Loaded ${rows.length} message(s) from Telegram`
          : "No messages found in this chat",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
