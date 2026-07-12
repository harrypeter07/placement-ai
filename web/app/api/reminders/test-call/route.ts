import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { makeReminderPhoneCall } from "@/lib/notifications/twilio";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { toPhone } = body;

    // Trigger test call
    const result = await makeReminderPhoneCall(
      toPhone || "",
      "Test Company LLC",
      "Software Engineer Associate",
      new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      user.id
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, callSid: result.callSid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
