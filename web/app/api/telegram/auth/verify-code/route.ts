import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api-auth";
import { TelegramAuthPending } from "@/models/TelegramAuthPending";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";
import { completeTelegramLogin } from "@/lib/telegram-gramjs";
import mongoose from "mongoose";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().min(4).max(10),
  password: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    await connectDB();
    const pending = await TelegramAuthPending.findOne({
      userId: new mongoose.Types.ObjectId(user.id),
    });
    if (!pending || pending.expiresAt < new Date()) {
      return NextResponse.json({ error: "Code expired — send a new code" }, { status: 400 });
    }

    const login = await completeTelegramLogin(
      pending.phoneNumber,
      pending.phoneCodeHash,
      parsed.data.code,
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const needs2fa = msg.includes("Two-factor") || msg.includes("PASSWORD");
    return NextResponse.json(
      { error: msg, needs2fa },
      { status: needs2fa ? 400 : msg === "Unauthorized" ? 401 : 500 }
    );
  }
}
