import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Notification } from "@/models/Notification";
import { requireAuth } from "@/lib/api-auth";

export async function GET() {
  try {
    const user = await requireAuth();
    await connectDB();
    const notifications = await Notification.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    return NextResponse.json(notifications);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireAuth();
    const { id, readAll } = await req.json();
    await connectDB();
    if (readAll) {
      await Notification.updateMany({ userId: user.id }, { read: true });
    } else if (id) {
      await Notification.findOneAndUpdate({ _id: id, userId: user.id }, { read: true });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
