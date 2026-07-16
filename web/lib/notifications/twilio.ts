import { getStudentPreferences } from "@/lib/db-supabase";
import { supabase } from "@/lib/supabase";

export async function getTwilioCredentials(userId?: string) {
  try {
    if (userId) {
      const prefs = await getStudentPreferences(userId);
      if (prefs?.twilio_account_sid && prefs?.twilio_auth_token && prefs?.twilio_from_phone) {
        return {
          accountSid: prefs.twilio_account_sid.trim(),
          authToken: prefs.twilio_auth_token.trim(),
          fromPhone: prefs.twilio_from_phone.trim(),
          toPhone: prefs.twilio_to_phone?.trim() || "",
        };
      }
    }

    const { data } = await supabase
      .from("student_preferences")
      .select("twilio_account_sid, twilio_auth_token, twilio_from_phone, twilio_to_phone")
      .not("twilio_account_sid", "eq", "")
      .limit(1)
      .maybeSingle();

    if (data?.twilio_account_sid && data?.twilio_auth_token && data?.twilio_from_phone) {
      return {
        accountSid: data.twilio_account_sid.trim(),
        authToken: data.twilio_auth_token.trim(),
        fromPhone: data.twilio_from_phone.trim(),
        toPhone: data.twilio_to_phone?.trim() || "",
      };
    }
  } catch (err) {
    console.error("[twilio-env] Failed to query Supabase for Twilio config:", err);
  }

  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    fromPhone: process.env.TWILIO_FROM_PHONE_NUMBER || "",
    toPhone: process.env.TWILIO_TO_PHONE_NUMBER || "",
  };
}

export async function makeReminderPhoneCall(
  toPhone: string,
  company: string,
  role: string,
  deadlineDate: Date,
  userId?: string,
  reminderId?: string,
  formUrl?: string
) {
  const creds = await getTwilioCredentials(userId);
  const accountSid = creds.accountSid;
  const authToken = creds.authToken;
  const fromPhone = creds.fromPhone;
  
  const targetPhone = toPhone || creds.toPhone;

  if (!accountSid || !authToken || !fromPhone || !targetPhone) {
    console.warn("[Twilio] Missing Twilio credentials or destination phone number");
    return { error: "missing_credentials" };
  }

  // Load custom Twilio calling options
  let voiceSettings = {
    menuEnabled: true,
    fillViaCallEnabled: true,
    defaultSnoozeMinutes: 60,
    voice: "Polly.Kajal-Neural",
    language: "en-IN",
  };

  if (userId) {
    try {
      const prefs = await getStudentPreferences(userId);
      if (prefs?.twilio_voice_settings) {
        voiceSettings = { ...voiceSettings, ...prefs.twilio_voice_settings };
      }
    } catch (prefErr) {
      console.error("[Twilio] Error fetching user call settings:", prefErr);
    }
  }

  const formattedDate = new Date(deadlineDate).toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const welcome = (voiceSettings as Record<string, unknown>).welcomeMessage as string || "Hello! This is a placement alert from PlaceMint A.I.";
  const announcement = `${welcome} Your deadline for the company ${company}, role ${role}, is approaching on ${formattedDate}.`;

  // Build TwiML block
  let twiml = "";
  const voice = voiceSettings.voice || "Polly.Kajal-Neural";
  const language = voiceSettings.language || "en-IN";

  if (voiceSettings.menuEnabled) {
    const callbackBase = `${process.env.WEB_APP_URL || "https://placemint-web.vercel.app"}/api/twilio/gather-callback`;
    const params = new URLSearchParams();
    if (reminderId) params.append("reminderId", reminderId);
    if (userId) params.append("userId", userId);
    if (formUrl) params.append("formUrl", formUrl);
    const callbackUrl = `${callbackBase}?${params.toString()}`;

    let menuIntro = "";
    if (formUrl && voiceSettings.fillViaCallEnabled) {
      menuIntro += "To fill the application form now, press or say 1. ";
    }
    menuIntro += `To snooze this alert for ${voiceSettings.defaultSnoozeMinutes} minutes, press or say 2. `;
    menuIntro += "To repeat this announcement, press or say 3.";

    twiml = `
      <Response>
        <Say voice="${voice}" language="${language}">${announcement}</Say>
        <Gather input="dtmf speech" numDigits="1" action="${callbackUrl}" timeout="6">
          <Say voice="${voice}" language="${language}">${menuIntro}</Say>
        </Gather>
        <Say voice="${voice}" language="${language}">No input received. Goodbye.</Say>
      </Response>
    `;
  } else {
    // Falls back to announcement-only (no Gather)
    twiml = `
      <Response>
        <Say voice="${voice}" language="${language}">${announcement} Please verify and apply. Good luck!</Say>
      </Response>
    `;
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: fromPhone,
        To: targetPhone,
        Twiml: twiml.trim(),
      }).toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[Twilio] Call failed:", data);
      return { error: data.message || "Twilio API error" };
    }

    console.info(`[Twilio] Call placed successfully to ${targetPhone}. SID: ${data.sid}`);
    return { ok: true, callSid: data.sid };
  } catch (err) {
    console.error("[Twilio] Exception placing call:", err);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendTelegramAlertToUser(text: string) {
  const workerUrl = (process.env.TELEGRAM_WORKER_PUBLIC_URL || "").replace(/\/$/, "");
  const apiKey = process.env.TELEGRAM_WORKER_SECRET;

  if (!workerUrl || !apiKey) {
    console.warn("[TelegramAlert] Missing TELEGRAM_WORKER_PUBLIC_URL or TELEGRAM_WORKER_SECRET");
    return { error: "missing_config" };
  }

  try {
    const res = await fetch(`${workerUrl}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey,
        text,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[TelegramAlert] Failed to send DM via worker:", data);
      return { error: data.error || "Worker API error" };
    }

    return { ok: true };
  } catch (err) {
    console.error("[TelegramAlert] Exception sending DM via worker:", err);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
