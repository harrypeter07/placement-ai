import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { makeReminderPhoneCall } from "@/lib/notifications/twilio";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { reminderId, toPhone } = body;

    let company = "Test Company LLC";
    let role = "Software Engineer Associate";
    let deadlineDate = new Date(Date.now() + 60 * 60 * 1000);
    let formUrl = "";

    if (reminderId) {
      const { data: reminder } = await supabase
        .from("reminders")
        .select("*, deadlines(*)")
        .eq("id", reminderId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (reminder) {
        company = reminder.deadlines?.company || reminder.title || company;
        role = reminder.deadlines?.role || "Role";
        deadlineDate = new Date(reminder.deadlines?.deadline_date || reminder.scheduled_at);
        formUrl = reminder.deadlines?.links?.[0] || "";
      }
    }

    // Trigger test call
    const result = await makeReminderPhoneCall(
      toPhone || "",
      company,
      role,
      deadlineDate,
      user.id,
      reminderId,
      formUrl
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (reminderId) {
      await supabase
        .from("reminders")
        .update({
          call_status: "called",
          called_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", reminderId);
    }

    return NextResponse.json({ ok: true, callSid: result.callSid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
