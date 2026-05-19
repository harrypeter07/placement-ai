import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireAdmin } from "@/lib/api-auth";

export async function GET() {
  try {
    await requireAdmin();
    await connectDB();
    const students = await User.find({ role: "student" })
      .select("-password")
      .sort({ createdAt: -1 });
    return NextResponse.json(students);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
