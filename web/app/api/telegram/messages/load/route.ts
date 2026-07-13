import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";
import { ensureMessagesForGroups } from "@/lib/telegram-ensure-messages";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({
  groupId: z.string().min(1),
  limit: z.number().min(5).max(500).default(50),
});

/**
 * POST /api/telegram/messages/load
 * Pulls messages from Telegram into the DB for a given group.
 * Does NOT run any AI analysis — just fetches & stores raw messages.
 */
export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { groupId, limit } = parsed.data;
    console.log(`[POST messages/load] Fetching ${limit} msgs for group: ${groupId}`);

    // Force a fresh pull regardless of what's already in DB by passing a large limit
    const result = await ensureMessagesForGroups([groupId], limit, null, true);

    console.log(`[POST messages/load] Done. fetched=${result.fetched}, errors=${result.errors}`);

    if (result.errors.length > 0 && result.fetched === 0) {
      return NextResponse.json({ error: result.errors[0] }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      fetched: result.fetched,
      groupId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(`[POST messages/load] Crash:`, e);
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
