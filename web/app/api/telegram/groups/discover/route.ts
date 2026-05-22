import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { syncGroupCatalogFromSession } from "@/lib/telegram-group-catalog";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST — fetch all Telegram groups/channels using the connected account (Settings login) */
export async function POST() {
  try {
    await requireAuth();
    const result = await syncGroupCatalogFromSession();
    return NextResponse.json({
      ok: true,
      synced: result.synced,
      message:
        result.synced > 0
          ? `Synced ${result.synced} group(s) and channel(s)`
          : "No groups found on this Telegram account",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
