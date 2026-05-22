import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api-auth";
import { TelegramAuthPending } from "@/models/TelegramAuthPending";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";
import { completeTelegramLogin, sanitizeOtpCode } from "@/lib/telegram-gramjs";
import mongoose from "mongoose";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().min(4).max(12),
  password: z.string().max(256).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
    }

    const otp = sanitizeOtpCode(parsed.data.code);
    if (otp.length < 4) {
      return NextResponse.json({ error: "Enter the full login code" }, { status: 400 });
    }

    await connectDB();
    const pending = await TelegramAuthPending.findOne({
      userId: new mongoose.Types.ObjectId(user.id),
    }).select("+authSessionString");

    if (!pending) {
      return NextResponse.json(
        { error: "No active login — send a code first", errorCode: "NO_PENDING" },
        { status: 400 }
      );
    }
    if (pending.expiresAt < new Date()) {
      await TelegramAuthPending.deleteOne({ _id: pending._id });
      return NextResponse.json(
        {
          error: "Login session expired — tap Resend code",
          errorCode: "PHONE_CODE_EXPIRED",
          expired: true,
        },
        { status: 400 }
      );
    }
    if (!pending.authSessionString) {
      return NextResponse.json(
        { error: "Login session invalid — resend code", errorCode: "SESSION_MISSING", expired: true },
        { status: 400 }
      );
    }

    try {
      const login = await completeTelegramLogin(
        pending.phoneNumber,
        pending.phoneCodeHash,
        pending.authSessionString,
        otp,
        parsed.data.password
      );

      await TelegramWorkerSession.findOneAndUpdate(
        { key: "default" },
        {
          sessionString: login.sessionString,
          phoneNumber: login.phoneNumber,
          telegramUserId: login.telegramUserId,
          telegramUsername: login.telegramUsername,
          displayName: login.displayName,
          linkedByUserId: new mongoose.Types.ObjectId(user.id),
          connectedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      await TelegramAuthPending.deleteOne({ userId: pending.userId });

      return NextResponse.json({
        ok: true,
        displayName: login.displayName,
        telegramUsername: login.telegramUsername,
      });
    } catch (loginErr: unknown) {
      const err = loginErr as Error & {
        needs2fa?: boolean;
        errorCode?: string;
        expired?: boolean;
        invalidCode?: boolean;
      };

      if (err.expired || err.errorCode === "PHONE_CODE_EXPIRED") {
        await TelegramAuthPending.deleteOne({ userId: pending.userId });
      }

      return NextResponse.json(
        {
          error: err.message || "Verification failed",
          needs2fa: !!err.needs2fa,
          errorCode: err.errorCode,
          expired: !!err.expired,
          invalidCode: !!err.invalidCode,
        },
        { status: 400 }
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
