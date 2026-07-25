import { NextResponse } from "next/server";
import { checkWorkerSecret } from "@/lib/telegram-worker-auth";
import { processDueRemindersInternal } from "@/lib/reminders/due-processor";
import { getAuthUser } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleProcess(req);
}

export async function POST(req: Request) {
  return handleProcess(req);
}

async function handleProcess(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const apiKey = searchParams.get("apiKey") || req.headers.get("x-worker-secret");
    const user = await getAuthUser();

    // Authorized if valid worker secret OR logged in user session
    if (!checkWorkerSecret(apiKey || undefined) && !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await processDueRemindersInternal(user?.id);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
