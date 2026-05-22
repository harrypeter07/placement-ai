import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api-auth";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";
import { TelegramMessage } from "@/models/TelegramMessage";
import { downloadMessagePhoto } from "@/lib/telegram-fetch-history";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET — proxy a photo from Telegram for an authenticated user */
export async function GET(req: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");
    const messageId = searchParams.get("messageId");
    if (!groupId || !messageId) {
      return NextResponse.json({ error: "groupId and messageId required" }, { status: 400 });
    }

    await connectDB();
    const msg = await TelegramMessage.findOne({ groupId, messageId }).lean();
    if (!msg?.hasMedia || msg.mediaType !== "photo") {
      return NextResponse.json({ error: "Not a photo message" }, { status: 404 });
    }

    const sessionDoc = await TelegramWorkerSession.findOne({ key: "default" })
      .select("+sessionString")
      .lean();
    if (!sessionDoc?.sessionString) {
      return NextResponse.json({ error: "Telegram not connected" }, { status: 400 });
    }

    const buf = await downloadMessagePhoto(sessionDoc.sessionString, groupId, messageId);
    if (!buf) {
      return NextResponse.json({ error: "Could not load image" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
