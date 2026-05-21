import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api-auth";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";

export const runtime = "nodejs";

function maskPhone(phone: string) {
  if (phone.length < 6) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
}

export async function GET() {
  try {
    await requireAuth();
    await connectDB();
    const doc = await TelegramWorkerSession.findOne({ key: "default" })
      .select("+sessionString phoneNumber telegramUsername displayName connectedAt linkedByUserId")
      .lean();

    if (!doc?.sessionString) {
      return NextResponse.json({
        connected: false,
        apiConfigured: !!(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH),
      });
    }

    return NextResponse.json({
      connected: true,
      apiConfigured: true,
      phoneNumber: maskPhone(doc.phoneNumber),
      telegramUsername: doc.telegramUsername,
      displayName: doc.displayName,
      connectedAt: doc.connectedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
