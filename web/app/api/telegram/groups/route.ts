import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { TelegramGroup } from "@/models/TelegramGroup";
import { requireAuth } from "@/lib/api-auth";
import { StudentPreferences, getDefaultStudentPreferences } from "@/models/StudentPreferences";
import { upsertTelegramGroup } from "@/lib/telegram-messages";
import { checkWorkerSecret } from "@/lib/telegram-worker-auth";

export const runtime = "nodejs";

const syncSchema = z.object({
  apiKey: z.string().min(1),
  groups: z.array(
    z.object({
      groupId: z.string(),
      title: z.string(),
      kind: z.enum(["group", "channel", "supergroup"]).optional(),
      username: z.string().optional(),
    })
  ),
});

/** GET — all discovered groups + per-user monitoring flag */
export async function GET() {
  try {
    const user = await requireAuth();
    await connectDB();
    let prefs = await StudentPreferences.findOne({ userId: user.id });
    if (!prefs) {
      prefs = await StudentPreferences.create({ userId: user.id, ...getDefaultStudentPreferences() });
    }
    const monitored = new Set(prefs.telegram?.monitoredGroupIds || []);
    const groups = await TelegramGroup.find().sort({ title: 1 }).lean();
    return NextResponse.json(
      groups.map((g) => ({
        ...g,
        monitoringEnabled: monitored.has(g.groupId),
      }))
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

/** POST — worker syncs all dialogs from Telegram account */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (!checkWorkerSecret(parsed.data.apiKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    for (const g of parsed.data.groups) {
      await upsertTelegramGroup(g.groupId, g.title, {
        kind: g.kind,
        username: g.username,
      });
    }

    return NextResponse.json({ ok: true, synced: parsed.data.groups.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
