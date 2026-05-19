import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Resume } from "@/models/Resume";
import { requireAuth } from "@/lib/api-auth";
import { analyzeResume } from "@/lib/gemini";

export async function GET() {
  try {
    const user = await requireAuth();
    await connectDB();
    const resumes = await Resume.find({ userId: user.id }).sort({ createdAt: -1 });
    return NextResponse.json(resumes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const text = formData.get("text") as string | null;

    if (!file && !text) {
      return NextResponse.json({ error: "File or text required" }, { status: 400 });
    }

    let resumeText = text || "";
    if (file) {
      resumeText = await file.text();
    }

    const analysis = await analyzeResume(resumeText);
    await connectDB();
    const resume = await Resume.create({
      userId: user.id,
      fileName: file?.name || "resume.txt",
      fileUrl: "/uploads/resume",
      ...analysis,
      analyzedAt: new Date(),
    });
    return NextResponse.json(resume, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
