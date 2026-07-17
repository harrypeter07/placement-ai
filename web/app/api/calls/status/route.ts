import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getTwilioCredentials } from "@/lib/notifications/twilio";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const sid = searchParams.get("sid");

    if (!sid) {
      return NextResponse.json({ error: "Missing Call SID" }, { status: 400 });
    }

    const creds = await getTwilioCredentials(user.id);
    if (!creds.accountSid || !creds.authToken) {
      return NextResponse.json({ error: "Missing Twilio credentials" }, { status: 400 });
    }

    // Call Twilio REST API to get call details
    const authHeader = `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`;
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Calls/${sid}.json`;

    const res = await fetch(twilioUrl, {
      headers: {
        Authorization: authHeader,
      },
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json({ error: errData.message || "Failed to fetch status from Twilio" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({
      status: data.status, // e.g. queued, ringing, in-progress, completed, failed, busy, no-answer
      duration: data.duration,
      price: data.price,
      direction: data.direction,
      dateCreated: data.date_created,
      dateUpdated: data.date_updated,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
