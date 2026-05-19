import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Deadline } from "@/models/Deadline";
import { User } from "@/models/User";
import { requireAuth } from "@/lib/api-auth";
import { checkEligibility } from "@/lib/eligibility";

const schema = z.object({
  branch: z.string(),
  cgpa: z.number(),
  backlogs: z.number(),
  graduationYear: z.number(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    await connectDB();
    await User.findByIdAndUpdate(user.id, parsed.data);

    const deadlines = await Deadline.find({ $or: [{ userId: user.id }, { isGlobal: true }] });
    const eligible: typeof deadlines = [];
    const ineligible: { deadline: (typeof deadlines)[0]; reasons: string[] }[] = [];

    for (const d of deadlines) {
      const result = checkEligibility(d.eligibility, parsed.data);
      if (result.eligible) eligible.push(d);
      else ineligible.push({ deadline: d, reasons: result.reasons });
    }

    return NextResponse.json({ eligible, ineligible, profile: parsed.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
