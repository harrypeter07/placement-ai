import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api-auth";
import { TelegramAuthPending } from "@/models/TelegramAuthPending";
import { normalizePhone, sendTelegramCode } from "@/lib/telegram-gramjs";
import mongoose from "mongoose";

export const runtime = "nodejs";

const schema = z.object({
  phone: z.string().min(8),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    const phoneNumber = normalizePhone(parsed.data.phone);
    const { phoneCodeHash, isCodeViaApp } = await sendTelegramCode(phoneNumber);

    await connectDB();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await TelegramAuthPending.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(user.id) },
      { phoneNumber, phoneCodeHash, expiresAt },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      ok: true,
      phoneNumber,
      isCodeViaApp,
      message: isCodeViaApp
        ? "Code sent to your Telegram app"
        : "Code sent via SMS — enter it below",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
