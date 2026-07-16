
import { getStudentPreferences, createFormJob, snoozeReminder } from "@/lib/db-supabase";
import { supabase } from "@/lib/supabase";
import { runFormJobFilling } from "@/lib/forms/executor";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const reminderId = searchParams.get("reminderId") || "";
    const userId = searchParams.get("userId") || "";
    const formUrl = searchParams.get("formUrl") || "";

    const textBody = await req.text();
    const body = new URLSearchParams(textBody);
    
    const digits = body.get("Digits");
    const speechResult = body.get("SpeechResult");

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
      } catch (e) {
        console.error("[Twilio Webhook] Error loading voice settings:", e);
      }
    }

    const voice = voiceSettings.voice || "Polly.Kajal-Neural";
    const language = voiceSettings.language || "en-IN";

    let option = (digits || "").trim();
    if (!option && speechResult) {
      const txt = speechResult.toLowerCase();
      if (txt.includes("one") || txt.includes("fill") || txt.includes("form")) {
        option = "1";
      } else if (txt.includes("two") || txt.includes("snooze") || txt.includes("hour")) {
        option = "2";
      } else if (txt.includes("three") || txt.includes("repeat") || txt.includes("message")) {
        option = "3";
      }
    }

    let xml = "";

    if (option === "1") {
      if (reminderId) {
        await supabase
          .from("reminders")
          .update({
            call_status: "called",
            call_response: "Key 1 pressed (Fill Form triggered)",
            called_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", reminderId);
      }
      if (!formUrl) {
        xml = `
          <Response>
            <Say voice="${voice}" language="${language}">Sorry, no associated application form was found for this alert. Goodbye.</Say>
          </Response>
        `;
      } else if (voiceSettings.fillViaCallEnabled === false) {
        xml = `
          <Response>
            <Say voice="${voice}" language="${language}">Sorry, automatic form filling via voice call is disabled in your dashboard settings. Goodbye.</Say>
          </Response>
        `;
      } else {
        // Fetch student preferences
        const prefs = await getStudentPreferences(userId);
        const profile = prefs?.form_profile || {};

        // 1. Create job with triggerSource: "call"
        const job = await createFormJob({
          userId,
          formUrl,
          status: "pending",
          profileData: {
            fullName: profile.fullName || "",
            email: profile.email || "",
            phone: profile.phone || "",
            cgpa: profile.cgpa || "",
            branch: profile.branch || "",
            graduationYear: profile.graduationYear || "",
            resumeLink: profile.resumeLink || "",
            githubLink: profile.githubLink || "",
            linkedInLink: profile.linkedInLink || "",
            rollNumber: profile.rollNumber || "",
            additionalInfo: profile.additionalInfo || "",
          },
          autoSubmit: false, // HARD RULE
          triggerSource: "call",
        });

        // 2. Trigger asynchronous parsing/prefilling
        void runFormJobFilling(job).catch((err) => {
          console.error("[Twilio Webhook] Async form job filling failed:", err);
        });

        xml = `
          <Response>
            <Say voice="${voice}" language="${language}">Perfect! I am filling out the application form now. I will send you a Telegram review link as soon as it's done. Goodbye.</Say>
          </Response>
        `;
      }
    } else if (option === "2") {
      const snoozeMinutes = voiceSettings.defaultSnoozeMinutes || 60;
      await snoozeReminder(reminderId, snoozeMinutes);
      
      if (reminderId) {
        await supabase
          .from("reminders")
          .update({
            call_status: "called",
            call_response: `Key 2 pressed (Snoozed for ${snoozeMinutes}m)`,
            called_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", reminderId);
      }
      
      xml = `
        <Response>
          <Say voice="${voice}" language="${language}">Alert snoozed for ${snoozeMinutes} minutes. I will call you again once the timer expires. Goodbye.</Say>
        </Response>
      `;
    } else if (option === "3") {
      if (reminderId) {
        await supabase
          .from("reminders")
          .update({
            call_status: "called",
            call_response: "Key 3 pressed (Repeat message)",
            called_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", reminderId);
      }
      // Fetch reminder to replay details
      const { data: reminder } = await supabase
        .from("reminders")
        .select("*, deadlines(*)")
        .eq("id", reminderId)
        .single();
      
      const deadline = reminder?.deadlines;
      let announcement = (voiceSettings as Record<string, unknown>).welcomeMessage as string || "This is a placement alert from PlaceMint.";
      if (deadline) {
        const formattedDate = new Date(deadline.deadline_date).toLocaleDateString("en-IN", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        announcement = `Here is the message again. Your deadline for the company ${deadline.company}, role ${deadline.role}, is approaching on ${formattedDate}.`;
      }

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

      xml = `
        <Response>
          <Say voice="${voice}" language="${language}">${announcement}</Say>
          <Gather input="dtmf speech" numDigits="1" action="${callbackUrl}" timeout="6">
            <Say voice="${voice}" language="${language}">${menuIntro}</Say>
          </Gather>
          <Say voice="${voice}" language="${language}">No input received. Goodbye.</Say>
        </Response>
      `;
    } else {
      if (reminderId) {
        await supabase
          .from("reminders")
          .update({
            call_status: "called",
            call_response: option ? `Key ${option} pressed (Invalid option)` : "No key pressed (Timeout)",
            called_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", reminderId);
      }
      // Invalid input fallback
      xml = `
        <Response>
          <Say voice="${voice}" language="${language}">Sorry, I didn't recognize that option. Goodbye.</Say>
        </Response>
      `;
    }

    return new Response(xml.trim(), {
      headers: {
        "Content-Type": "application/xml",
      },
    });
  } catch (e) {
    console.error("[Twilio Callback] Error:", e);
    const fallbackXml = `<Response><Say voice="Polly.Kajal-Neural" language="en-IN">An internal error occurred. Goodbye.</Say></Response>`;
    return new Response(fallbackXml, {
      headers: { "Content-Type": "application/xml" },
      status: 500,
    });
  }
}
