import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api-auth";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";
import { TelegramAuthPending } from "@/models/TelegramAuthPending";
import mongoose from "mongoose";

export const runtime = "nodejs";

export async function DELETE() {
  try {
    const user = await requireAuth();
    await connectDB();
    await TelegramWorkerSession.deleteOne({ key: "default" });
    await TelegramAuthPending.deleteOne({ userId: new mongoose.Types.ObjectId(user.id) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
