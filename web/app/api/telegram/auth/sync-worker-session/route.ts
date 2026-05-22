import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api-auth";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";
import { createTelegramClient } from "@/lib/telegram-gramjs";
import { exportTelethonSessionString } from "@/lib/telegram-telethon-session";

export const runtime = "nodejs";

/** Re-export Telethon session from existing GramJS login (fixes Render worker without new OTP) */
export async function POST() {
  try {
    await requireAuth();
    await connectDB();
    const doc = await TelegramWorkerSession.findOne({ key: "default" }).select("+sessionString");
    if (!doc?.sessionString) {
      return NextResponse.json({ error: "Connect Telegram in Settings first" }, { status: 400 });
    }

    const client = await createTelegramClient(doc.sessionString);
    try {
      if (!(await client.checkAuthorization())) {
        return NextResponse.json({ error: "Telegram session expired — sign in again" }, { status: 400 });
      }
      const telethonSessionString = exportTelethonSessionString(client);
      if (!telethonSessionString) {
        return NextResponse.json(
          { error: "Could not export worker session — sign out and connect Telegram again" },
          { status: 500 }
        );
      }
      await TelegramWorkerSession.updateOne(
        { key: "default" },
        { $set: { telethonSessionString } }
      );
      return NextResponse.json({ ok: true, message: "Render worker session synced" });
    } finally {
      await client.disconnect();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
