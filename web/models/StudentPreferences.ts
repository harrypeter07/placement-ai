import mongoose, { Schema, type Model } from "mongoose";

export interface IStudentPreferences {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  timezone: string;
  language: string;
  reminders: {
    defaultOffsetsMinutes: number[];
    sound: boolean;
    vibration: boolean;
    defaultEscalation: "soft" | "normal" | "urgent" | "critical";
    smartAiMode: boolean;
  };
  notifications: {
    browser: boolean;
    email: boolean;
    telegram: boolean;
    inApp: boolean;
    push: boolean;
    phoneCall: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
  };
  calendar: {
    autoSync: boolean;
    autoCreateEvents: boolean;
    autoUpdateEvents: boolean;
  };
  ai: {
    strictness: "strict" | "balanced" | "relaxed";
    urgencySensitivity: "low" | "medium" | "high";
    spamSensitivity: "low" | "medium" | "high";
  };
  placement: {
    preferredCompanies: string[];
    preferredRoles: string[];
    dreamCompanies: string[];
    minPackageLakh: number | null;
  };
  automation: {
    masterEnabled: boolean;
    aiAutoReminders: boolean;
    autoCalendarSync: boolean;
    autoPriority: boolean;
    duplicateMerge: boolean;
  };
  telegram: {
    /** Last N messages per monitored group for Gemini */
    insightMessageCount: number;
    /** Only analyze messages on or after this date (optional) */
    insightSinceDate?: Date | null;
    /** preview = show drafts first; all = auto-apply; none = insights only */
    insightsApplyMode: "preview" | "all" | "none";
    /** Pin applied insights on dashboard overview */
    insightPinToOverview: boolean;
    /** groupId values with monitoring on */
    monitoredGroupIds: string[];
    autoInsights: boolean;
    autoCreateDeadlines: boolean;
    autoCreateReminders: boolean;
  };
  formProfile: {
    fullName: string;
    email: string;
    phone: string;
    cgpa: string;
    branch: string;
    graduationYear: string;
    resumeLink: string;
    githubLink: string;
    linkedInLink: string;
    rollNumber: string;
    additionalInfo: string;
  };
  geminiApiKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromPhone: string;
  twilioToPhone: string;
  updatedAt: Date;
  createdAt: Date;
}

const defaults = {
  timezone: "Asia/Kolkata",
  language: "en",
  reminders: {
    defaultOffsetsMinutes: [24 * 60, 6 * 60, 60, 15],
    sound: true,
    vibration: true,
    defaultEscalation: "normal" as const,
    smartAiMode: true,
  },
  notifications: {
    browser: true,
    email: false,
    telegram: false,
    inApp: true,
    push: true,
    phoneCall: false,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
  },
  calendar: {
    autoSync: true,
    autoCreateEvents: true,
    autoUpdateEvents: true,
  },
  ai: {
    strictness: "balanced" as const,
    urgencySensitivity: "medium" as const,
    spamSensitivity: "medium" as const,
  },
  placement: {
    preferredCompanies: [] as string[],
    preferredRoles: [] as string[],
    dreamCompanies: [] as string[],
    minPackageLakh: null as number | null,
  },
  automation: {
    masterEnabled: true,
    aiAutoReminders: true,
    autoCalendarSync: true,
    autoPriority: true,
    duplicateMerge: true,
  },
  telegram: {
    insightMessageCount: 25,
    insightSinceDate: null as Date | null,
    insightsApplyMode: "preview" as const,
    insightPinToOverview: true,
    monitoredGroupIds: [] as string[],
    autoInsights: true,
    autoCreateDeadlines: true,
    autoCreateReminders: true,
  },
  formProfile: {
    fullName: "",
    email: "",
    phone: "",
    cgpa: "",
    branch: "",
    graduationYear: "",
    resumeLink: "",
    githubLink: "",
    linkedInLink: "",
    rollNumber: "",
    additionalInfo: "",
  },
  geminiApiKey: "",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioFromPhone: "",
  twilioToPhone: "",
};

const StudentPreferencesSchema = new Schema<IStudentPreferences>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    timezone: { type: String, default: defaults.timezone },
    language: { type: String, default: defaults.language },
    reminders: {
      defaultOffsetsMinutes: { type: [Number], default: defaults.reminders.defaultOffsetsMinutes },
      sound: { type: Boolean, default: defaults.reminders.sound },
      vibration: { type: Boolean, default: defaults.reminders.vibration },
      defaultEscalation: {
        type: String,
        enum: ["soft", "normal", "urgent", "critical"],
        default: defaults.reminders.defaultEscalation,
      },
      smartAiMode: { type: Boolean, default: defaults.reminders.smartAiMode },
    },
    notifications: {
      browser: { type: Boolean, default: defaults.notifications.browser },
      email: { type: Boolean, default: defaults.notifications.email },
      telegram: { type: Boolean, default: defaults.notifications.telegram },
      inApp: { type: Boolean, default: defaults.notifications.inApp },
      push: { type: Boolean, default: defaults.notifications.push },
      phoneCall: { type: Boolean, default: defaults.notifications.phoneCall },
      quietHoursEnabled: { type: Boolean, default: defaults.notifications.quietHoursEnabled },
      quietHoursStart: { type: String, default: defaults.notifications.quietHoursStart },
      quietHoursEnd: { type: String, default: defaults.notifications.quietHoursEnd },
    },
    calendar: {
      autoSync: { type: Boolean, default: defaults.calendar.autoSync },
      autoCreateEvents: { type: Boolean, default: defaults.calendar.autoCreateEvents },
      autoUpdateEvents: { type: Boolean, default: defaults.calendar.autoUpdateEvents },
    },
    ai: {
      strictness: { type: String, enum: ["strict", "balanced", "relaxed"], default: defaults.ai.strictness },
      urgencySensitivity: { type: String, enum: ["low", "medium", "high"], default: defaults.ai.urgencySensitivity },
      spamSensitivity: { type: String, enum: ["low", "medium", "high"], default: defaults.ai.spamSensitivity },
    },
    placement: {
      preferredCompanies: [{ type: String }],
      preferredRoles: [{ type: String }],
      dreamCompanies: [{ type: String }],
      minPackageLakh: { type: Number, default: null },
    },
    automation: {
      masterEnabled: { type: Boolean, default: defaults.automation.masterEnabled },
      aiAutoReminders: { type: Boolean, default: defaults.automation.aiAutoReminders },
      autoCalendarSync: { type: Boolean, default: defaults.automation.autoCalendarSync },
      autoPriority: { type: Boolean, default: defaults.automation.autoPriority },
      duplicateMerge: { type: Boolean, default: defaults.automation.duplicateMerge },
    },
    telegram: {
      insightMessageCount: { type: Number, default: defaults.telegram.insightMessageCount, min: 5, max: 100 },
      insightSinceDate: { type: Date, default: null },
      insightsApplyMode: {
        type: String,
        enum: ["preview", "all", "none"],
        default: defaults.telegram.insightsApplyMode,
      },
      insightPinToOverview: { type: Boolean, default: defaults.telegram.insightPinToOverview },
      monitoredGroupIds: { type: [String], default: defaults.telegram.monitoredGroupIds },
      autoInsights: { type: Boolean, default: defaults.telegram.autoInsights },
      autoCreateDeadlines: { type: Boolean, default: defaults.telegram.autoCreateDeadlines },
      autoCreateReminders: { type: Boolean, default: defaults.telegram.autoCreateReminders },
    },
    formProfile: {
      fullName: { type: String, default: defaults.formProfile.fullName },
      email: { type: String, default: defaults.formProfile.email },
      phone: { type: String, default: defaults.formProfile.phone },
      cgpa: { type: String, default: defaults.formProfile.cgpa },
      branch: { type: String, default: defaults.formProfile.branch },
      graduationYear: { type: String, default: defaults.formProfile.graduationYear },
      resumeLink: { type: String, default: defaults.formProfile.resumeLink },
      githubLink: { type: String, default: defaults.formProfile.githubLink },
      linkedInLink: { type: String, default: defaults.formProfile.linkedInLink },
      rollNumber: { type: String, default: defaults.formProfile.rollNumber },
      additionalInfo: { type: String, default: defaults.formProfile.additionalInfo },
    },
    geminiApiKey: { type: String, default: defaults.geminiApiKey },
    twilioAccountSid: { type: String, default: defaults.twilioAccountSid },
    twilioAuthToken: { type: String, default: defaults.twilioAuthToken },
    twilioFromPhone: { type: String, default: defaults.twilioFromPhone },
    twilioToPhone: { type: String, default: defaults.twilioToPhone },
  },
  { timestamps: true }
);

export const StudentPreferences: Model<IStudentPreferences> =
  mongoose.models.StudentPreferences ??
  mongoose.model<IStudentPreferences>("StudentPreferences", StudentPreferencesSchema);

export function getDefaultStudentPreferences(): Omit<IStudentPreferences, "_id" | "userId" | "createdAt" | "updatedAt"> {
  return JSON.parse(JSON.stringify(defaults)) as Omit<IStudentPreferences, "_id" | "userId" | "createdAt" | "updatedAt">;
}
