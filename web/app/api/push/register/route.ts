import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api-auth";
import { PushToken } from "@/models/PushToken";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(20),
  platform: z.enum(["web", "android", "ios", "unknown"]).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    await connectDB();
    const ua = req.headers.get("user-agent") || undefined;
    await PushToken.findOneAndUpdate(
      { token: parsed.data.token },
      {
        userId: user.id,
        token: parsed.data.token,
        platform: parsed.data.platform || "web",
        userAgent: ua,
        lastUsedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth();
    const token = new URL(req.url).searchParams.get("token");
    await connectDB();
    if (token) {
      await PushToken.deleteOne({ userId: user.id, token });
    } else {
      await PushToken.deleteMany({ userId: user.id });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
