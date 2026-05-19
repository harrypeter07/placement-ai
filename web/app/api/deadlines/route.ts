import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Deadline } from "@/models/Deadline";
import { requireAuth } from "@/lib/api-auth";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    await connectDB();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "deadline";

    const baseOr = [{ userId: user.id }, { isGlobal: true }];
    const filter: Record<string, unknown> = { $or: baseOr };
    if (status) filter.status = status;
    if (search) {
      filter.$and = [{ $or: baseOr }, { company: { $regex: search, $options: "i" } }];
      delete filter.$or;
    }

    const deadlines = await Deadline.find(filter).sort(
      sort === "urgency" ? { deadline: 1 } : { [sort]: 1 }
    );
    return NextResponse.json(deadlines);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

const createSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  deadline: z.string(),
  eligibility: z.string().optional(),
  type: z.string().optional(),
  links: z.array(z.string()).optional(),
  salary: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    await connectDB();
    const deadline = await Deadline.create({
      ...parsed.data,
      deadline: new Date(parsed.data.deadline),
      userId: user.id,
      status: "pending",
      confidence: 1,
    });

    try {
      const { syncDeadlineToGoogleCalendar } = await import("@/lib/calendar/sync-deadline");
      const prefs = await import("@/models/StudentPreferences").then((m) =>
        m.StudentPreferences.findOne({ userId: user.id })
      );
      if (prefs?.calendar?.autoSync !== false && prefs?.calendar?.autoCreateEvents !== false) {
        await syncDeadlineToGoogleCalendar(user.id, deadline);
      }
    } catch {
      /* optional */
    }

    return NextResponse.json(deadline, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
