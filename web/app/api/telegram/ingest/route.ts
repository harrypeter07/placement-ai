import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Deadline } from "@/models/Deadline";
import { extractPlacementFromText } from "@/lib/gemini";

const schema = z.object({
  message: z.string(),
  messageId: z.string().optional(),
  groupId: z.string().optional(),
  apiKey: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    if (process.env.TELEGRAM_WORKER_SECRET && parsed.data.apiKey !== process.env.TELEGRAM_WORKER_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const extracted = await extractPlacementFromText(parsed.data.message);
    if (extracted.confidence < 0.3 || !extracted.company) {
      return NextResponse.json({ skipped: true, reason: "Low confidence or not placement", extracted });
    }

    await connectDB();
    const existing = await Deadline.findOne({
      company: extracted.company,
      role: extracted.role || "Role TBD",
      sourceMessageId: parsed.data.messageId,
    });
    if (existing) {
      return NextResponse.json({ duplicate: true, existing });
    }

    const deadline = await Deadline.create({
      company: extracted.company,
      role: extracted.role || "Role TBD",
      deadline: extracted.deadline ? new Date(extracted.deadline) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      eligibility: extracted.eligibility,
      type: extracted.type,
      links: extracted.links,
      salary: extracted.salary,
      confidence: extracted.confidence,
      sourceMessageId: parsed.data.messageId,
      telegramGroupId: parsed.data.groupId,
      isGlobal: true,
      status: "pending",
    });

    return NextResponse.json({ created: true, deadline, extracted }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
