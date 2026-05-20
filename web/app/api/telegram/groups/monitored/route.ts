import { NextResponse } from "next/server";
import { checkWorkerSecret, getUnionMonitoredGroupIds } from "@/lib/telegram-worker-auth";

export const runtime = "nodejs";

/** GET — worker fetches union of all user-enabled monitored group IDs */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const apiKey = searchParams.get("apiKey") || req.headers.get("x-worker-secret") || undefined;
    if (!checkWorkerSecret(apiKey ?? undefined)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const groupIds = await getUnionMonitoredGroupIds();
    return NextResponse.json({ groupIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
