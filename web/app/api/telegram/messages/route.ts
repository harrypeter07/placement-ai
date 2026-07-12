import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { storeTelegramMessage } from "@/lib/db-supabase";

export const runtime = "nodejs";

const ingestSchema = z.object({
  apiKey: z.string().min(1),
  groupId: z.string(),
  groupTitle: z.string(),
  messageId: z.string(),
  text: z.string(),
  senderName: z.string().optional(),
  sentAt: z.string(),
});

function checkWorkerSecret(apiKey: string | undefined) {
  return !process.env.TELEGRAM_WORKER_SECRET || apiKey === process.env.TELEGRAM_WORKER_SECRET;
}

/** GET — messages for a group ?groupId= */
export async function GET(req: Request) {
  try {
    await requireAuth();
    const groupId = new URL(req.url).searchParams.get("groupId");
    if (!groupId) {
      return NextResponse.json({ error: "groupId required" }, { status: 400 });
    }

    const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") || 50), 100);

    const { data: messages, error } = await supabase
      .from("telegram_messages")
      .select("*")
      .eq("group_id", groupId)
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[GET messages] Supabase error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Map database properties (snake_case) to expected model values (camelCase) if needed
    const mapped = (messages || []).map((m) => ({
      _id: m.id,
      groupId: m.group_id,
      groupTitle: m.group_title,
      messageId: m.message_id,
      text: m.text,
      senderName: m.sender_name,
      sentAt: m.sent_at,
    }));

    return NextResponse.json(mapped.reverse());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

/** POST — worker logs a message */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (!checkWorkerSecret(parsed.data.apiKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const text = parsed.data.text.trim();
    if (!text) {
      return NextResponse.json({ skipped: true, reason: "Empty message" });
    }

    const result = await storeTelegramMessage({
      groupId: parsed.data.groupId,
      groupTitle: parsed.data.groupTitle,
      messageId: parsed.data.messageId,
      text,
      senderName: parsed.data.senderName,
      sentAt: parsed.data.sentAt,
    });

    if (result.created && result.message) {
      // Asynchronously trigger AI parsing and calendar / alarm sync
      void import("@/lib/reminders/auto-setup")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((m) => m.autoProcessNewMessage(result.message as any, parsed.data.groupId))
        .catch((err) => console.error("[AutoProcess] Failed on POST message:", err));
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
