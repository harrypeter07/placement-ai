/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";
import {
  getStudentPreferences,
  updateStudentPreferences,
  createAiAutomationLog,
} from "@/lib/db-supabase";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    reset: z.boolean().optional(),
    timezone: z.string().optional(),
    language: z.string().optional(),
    reminders: z
      .object({
        defaultOffsetsMinutes: z.array(z.number()).optional(),
        sound: z.boolean().optional(),
        vibration: z.boolean().optional(),
        defaultEscalation: z.enum(["soft", "normal", "urgent", "critical"]).optional(),
        smartAiMode: z.boolean().optional(),
      })
      .optional(),
    notifications: z
      .object({
        browser: z.boolean().optional(),
        email: z.boolean().optional(),
        telegram: z.boolean().optional(),
        inApp: z.boolean().optional(),
        push: z.boolean().optional(),
        phoneCall: z.boolean().optional(),
        quietHoursEnabled: z.boolean().optional(),
        quietHoursStart: z.string().optional(),
        quietHoursEnd: z.string().optional(),
      })
      .optional(),
    calendar: z
      .object({
        autoSync: z.boolean().optional(),
        autoCreateEvents: z.boolean().optional(),
        autoUpdateEvents: z.boolean().optional(),
      })
      .optional(),
    ai: z
      .object({
        strictness: z.enum(["strict", "balanced", "relaxed"]).optional(),
        urgencySensitivity: z.enum(["low", "medium", "high"]).optional(),
        spamSensitivity: z.enum(["low", "medium", "high"]).optional(),
      })
      .optional(),
    placement: z
      .object({
        preferredCompanies: z.array(z.string()).optional(),
        preferredRoles: z.array(z.string()).optional(),
        dreamCompanies: z.array(z.string()).optional(),
        minPackageLakh: z.number().nullable().optional(),
      })
      .optional(),
    automation: z.record(z.boolean()).optional(),
    telegram: z
      .object({
        insightMessageCount: z.number().min(5).max(100).optional(),
        insightSinceDate: z.string().nullable().optional(),
        insightsApplyMode: z.enum(["preview", "all", "none"]).optional(),
        insightPinToOverview: z.boolean().optional(),
        monitoredGroupIds: z.array(z.string()).optional(),
        autoInsights: z.boolean().optional(),
        autoCreateDeadlines: z.boolean().optional(),
        autoCreateReminders: z.boolean().optional(),
      })
      .optional(),
    formProfile: z
      .object({
        fullName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        cgpa: z.string().optional(),
        branch: z.string().optional(),
        graduationYear: z.string().optional(),
        resumeLink: z.string().optional(),
        githubLink: z.string().optional(),
        linkedInLink: z.string().optional(),
        rollNumber: z.string().optional(),
        additionalInfo: z.string().optional(),
      })
      .optional(),
    geminiApiKey: z.string().optional(),
    twilioAccountSid: z.string().optional(),
    twilioAuthToken: z.string().optional(),
    twilioFromPhone: z.string().optional(),
    twilioToPhone: z.string().optional(),
    twilioVoiceSettings: z
      .object({
        menuEnabled: z.boolean().optional(),
        fillViaCallEnabled: z.boolean().optional(),
        defaultSnoozeMinutes: z.number().optional(),
        voice: z.string().optional(),
        language: z.string().optional(),
      })
      .optional(),
  })
  .strict();

function mapDbToFrontend(doc: any) {
  return {
    timezone: doc.timezone,
    language: doc.language,
    reminders: doc.reminders_config,
    notifications: doc.notifications_config,
    calendar: doc.calendar_config,
    ai: doc.ai_config,
    placement: doc.placement_config,
    automation: doc.automation_config,
    telegram: doc.telegram_config,
    formProfile: doc.form_profile,
    geminiApiKey: doc.gemini_api_key,
    twilioAccountSid: doc.twilio_account_sid,
    twilioAuthToken: doc.twilio_auth_token,
    twilioFromPhone: doc.twilio_from_phone,
    twilioToPhone: doc.twilio_to_phone,
    twilioVoiceSettings: doc.twilio_voice_settings,
  };
}

export async function GET() {
  try {
    const user = await requireAuth();
    const doc = await getStudentPreferences(user.id);
    const obj = mapDbToFrontend(doc);

    // Seed credentials from environment variables if not already saved in the database
    if (!obj.geminiApiKey && process.env.GEMINI_API_KEY) {
      obj.geminiApiKey = process.env.GEMINI_API_KEY;
    }
    if (!obj.twilioAccountSid && process.env.TWILIO_ACCOUNT_SID) {
      obj.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    }
    if (!obj.twilioAuthToken && process.env.TWILIO_AUTH_TOKEN) {
      obj.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    }
    if (!obj.twilioFromPhone && process.env.TWILIO_FROM_PHONE_NUMBER) {
      obj.twilioFromPhone = process.env.TWILIO_FROM_PHONE_NUMBER;
    }
    if (!obj.twilioToPhone && process.env.TWILIO_TO_PHONE_NUMBER) {
      obj.twilioToPhone = process.env.TWILIO_TO_PHONE_NUMBER;
    }

    return NextResponse.json(obj);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.reset === true) {
      const resetData = {
        timezone: "Asia/Kolkata",
        language: "en",
        reminders_config: { defaultOffsetsMinutes: [1440, 360, 60, 15], sound: true, vibration: true, defaultEscalation: "normal", smartAiMode: true },
        notifications_config: { browser: true, email: false, telegram: false, inApp: true, push: true, phoneCall: false, quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "07:00" },
        calendar_config: { autoSync: true, autoCreateEvents: true, autoUpdateEvents: true },
        ai_config: { strictness: "balanced", urgencySensitivity: "medium", spamSensitivity: "medium" },
        placement_config: { preferredCompanies: [], preferredRoles: [], dreamCompanies: [], minPackageLakh: null },
        automation_config: { masterEnabled: true, aiAutoReminders: true, autoCalendarSync: true, autoPriority: true, duplicateMerge: true },
        telegram_config: { insightMessageCount: 25, monitoredGroupIds: [], autoInsights: true, autoCreateDeadlines: true, autoCreateReminders: true },
        form_profile: { fullName: "", email: "", phone: "", cgpa: "", branch: "", graduationYear: "", resumeLink: "", githubLink: "", linkedInLink: "", rollNumber: "", additionalInfo: "" },
        gemini_api_key: "",
        twilio_account_sid: "",
        twilio_auth_token: "",
        twilio_from_phone: "",
        twilio_to_phone: "",
      };
      
      const fresh = await updateStudentPreferences(user.id, resetData);
      await createAiAutomationLog({
        userId: user.id,
        type: "settings_update",
        summary: "Preferences reset to defaults",
        metadata: {},
      });
      return NextResponse.json(mapDbToFrontend(fresh));
    }

    const p = parsed.data;
    const updatePayload: any = {};
    
    if (p.timezone) updatePayload.timezone = p.timezone;
    if (p.language) updatePayload.language = p.language;
    if (p.reminders) updatePayload.reminders_config = p.reminders;
    if (p.notifications) updatePayload.notifications_config = p.notifications;
    if (p.calendar) updatePayload.calendar_config = p.calendar;
    if (p.ai) updatePayload.ai_config = p.ai;
    if (p.placement) updatePayload.placement_config = p.placement;
    if (p.automation) updatePayload.automation_config = p.automation;
    if (p.telegram) updatePayload.telegram_config = p.telegram;
    if (p.formProfile) updatePayload.form_profile = p.formProfile;
    if (p.geminiApiKey !== undefined) updatePayload.gemini_api_key = p.geminiApiKey;
    if (p.twilioAccountSid !== undefined) updatePayload.twilio_account_sid = p.twilioAccountSid;
    if (p.twilioAuthToken !== undefined) updatePayload.twilio_auth_token = p.twilioAuthToken;
    if (p.twilioFromPhone !== undefined) updatePayload.twilio_from_phone = p.twilioFromPhone;
    if (p.twilioToPhone !== undefined) updatePayload.twilio_to_phone = p.twilioToPhone;
    if (p.twilioVoiceSettings) updatePayload.twilio_voice_settings = p.twilioVoiceSettings;

    const updated = await updateStudentPreferences(user.id, updatePayload);

    await createAiAutomationLog({
      userId: user.id,
      type: "settings_update",
      summary: "Student preferences updated",
      metadata: { keys: Object.keys(p) },
    });

    return NextResponse.json(mapDbToFrontend(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
