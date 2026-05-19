import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Broadcast } from "@/models/Broadcast";
import { Notification } from "@/models/Notification";
import { User } from "@/models/User";
import { Deadline } from "@/models/Deadline";
import { requireAdmin } from "@/lib/api-auth";

const schema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  company: z.string().optional(),
  deadline: z.string().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    await connectDB();
    const broadcasts = await Broadcast.find().sort({ createdAt: -1 }).limit(50);
    return NextResponse.json(broadcasts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    await connectDB();
    const broadcast = await Broadcast.create({
      adminId: admin.id,
      ...parsed.data,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
    });

    if (parsed.data.company && parsed.data.deadline) {
      await Deadline.create({
        company: parsed.data.company,
        role: "Placement Drive",
        deadline: new Date(parsed.data.deadline),
        eligibility: "",
        isGlobal: true,
        confidence: 1,
        status: "pending",
      });
    }

    const students = await User.find({ role: "student" });
    await Notification.insertMany(
      students.map((s) => ({
        userId: s._id,
        title: parsed.data.title,
        message: parsed.data.message,
        type: "placement" as const,
      }))
    );

    return NextResponse.json(broadcast, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
