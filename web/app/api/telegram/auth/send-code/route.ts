import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api-auth";
import {
  TelegramAuthPending,
  TELEGRAM_RESEND_COOLDOWN_MS,
  TELEGRAM_MAX_SENDS_PER_HOUR,
} from "@/models/TelegramAuthPending";
import { sendTelegramCode } from "@/lib/telegram-gramjs";
import { buildPhoneNumber } from "@/lib/telegram-phone";
import mongoose from "mongoose";

export const runtime = "nodejs";

const schema = z.object({
  phone: z.string().min(6).max(20).optional(),
  countryDial: z.string().min(1).max(4).optional(),
  localNumber: z.string().min(6).max(15).optional(),
  resend: z.boolean().optional(),
});

function resolvePhone(body: z.infer<typeof schema>) {
  if (body.countryDial && body.localNumber) {
    return buildPhoneNumber(body.countryDial, body.localNumber);
  }
  if (body.phone) {
    const p = body.phone.trim();
    if (!p.startsWith("+")) throw new Error("Include country code or use country selector");
    return p.replace(/[\s-]/g, "");
  }
  throw new Error("Phone number required");
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    const phoneNumber = resolvePhone(parsed.data);
    const userId = new mongoose.Types.ObjectId(user.id);

    await connectDB();
    const existing = await TelegramAuthPending.findOne({ userId }).select(
      "+authSessionString lastSentAt sendCount phoneNumber"
    );

    if (existing && !parsed.data.resend) {
      const elapsed = Date.now() - new Date(existing.lastSentAt).getTime();
      if (elapsed < TELEGRAM_RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((TELEGRAM_RESEND_COOLDOWN_MS - elapsed) / 1000);
        return NextResponse.json(
          {
            error: `Wait ${waitSec}s before requesting another code`,
            retryAfterSec: waitSec,
          },
          { status: 429 }
        );
      }
    }

    if (existing?.sendCount && existing.sendCount >= TELEGRAM_MAX_SENDS_PER_HOUR) {
      const hourAgo = Date.now() - 60 * 60 * 1000;
      if (new Date(existing.lastSentAt).getTime() > hourAgo) {
        return NextResponse.json(
          { error: "Too many codes sent. Try again in an hour." },
          { status: 429 }
        );
      }
    }

    const sent = await sendTelegramCode(phoneNumber);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const sendCount =
      existing && new Date(existing.lastSentAt).getTime() > Date.now() - 60 * 60 * 1000
        ? (existing.sendCount || 0) + 1
        : 1;

    await TelegramAuthPending.findOneAndUpdate(
      { userId },
      {
        phoneNumber: sent.phoneNumber,
        phoneCodeHash: sent.phoneCodeHash,
        authSessionString: sent.authSessionString,
        isCodeViaApp: sent.isCodeViaApp,
        lastSentAt: new Date(),
        sendCount,
        expiresAt,
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      ok: true,
      phoneNumber: sent.phoneNumber,
      isCodeViaApp: sent.isCodeViaApp,
      retryAfterSec: Math.ceil(TELEGRAM_RESEND_COOLDOWN_MS / 1000),
      message: sent.isCodeViaApp
        ? "Code sent to your Telegram app — enter it within a few minutes"
        : "Code sent via SMS — enter it within a few minutes",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
