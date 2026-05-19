import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { StudentPreferences, getDefaultStudentPreferences } from "@/models/StudentPreferences";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const schema = z.object({
  groupId: z.string().min(1),
  enabled: z.boolean(),
});

/** PATCH — toggle monitoring for a Telegram group */
export async function PATCH(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    await connectDB();
    let prefs = await StudentPreferences.findOne({ userId: user.id });
    if (!prefs) {
      prefs = await StudentPreferences.create({ userId: user.id, ...getDefaultStudentPreferences() });
    }

    const ids = new Set(prefs.telegram?.monitoredGroupIds || []);
    if (parsed.data.enabled) ids.add(parsed.data.groupId);
    else ids.delete(parsed.data.groupId);

    if (!prefs.telegram) {
      prefs.telegram = getDefaultStudentPreferences().telegram;
    }
    prefs.telegram.monitoredGroupIds = [...ids];
    prefs.markModified("telegram");
    await prefs.save();

    return NextResponse.json({
      groupId: parsed.data.groupId,
      enabled: parsed.data.enabled,
      monitoredGroupIds: prefs.telegram.monitoredGroupIds,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
