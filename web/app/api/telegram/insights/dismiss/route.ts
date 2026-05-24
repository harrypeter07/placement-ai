import { NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { PlacementInsight } from "@/models/PlacementInsight";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const schema = z.object({
  insightIds: z.array(z.string()).min(1),
});

/** POST — dismiss info-only insights (no deadline created) */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input — select at least one insight" },
        { status: 400 }
      );
    }

    const ids = parsed.data.insightIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!ids.length) {
      return NextResponse.json({ error: "Invalid insight ids" }, { status: 400 });
    }

    await connectDB();
    const result = await PlacementInsight.updateMany(
      { _id: { $in: ids }, userId: user.id, status: "draft" },
      { $set: { status: "dismissed" } }
    );

    return NextResponse.json({ ok: true, dismissed: result.modifiedCount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
