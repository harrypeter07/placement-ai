import mongoose, { Schema, type Model } from "mongoose";

export interface IStudentPreferences {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  timezone: string;
  language: string;
  reminders: {
    defaultOffsetsMinutes: number[];
    sound: boolean;
  };
  notifications: {
    browser: boolean;
    email: boolean;
    telegram: boolean;
    inApp: boolean;
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
    /** groupId values with monitoring on */
    monitoredGroupIds: string[];
    autoInsights: boolean;
    autoCreateDeadlines: boolean;
    autoCreateReminders: boolean;
  };
  updatedAt: Date;
  createdAt: Date;
}

const defaults = {
  timezone: "Asia/Kolkata",
  language: "en",
  reminders: {
    defaultOffsetsMinutes: [24 * 60, 6 * 60, 60, 15],
    sound: true,
  },
  notifications: {
    browser: true,
    email: false,
    telegram: false,
    inApp: true,
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
    monitoredGroupIds: [] as string[],
    autoInsights: true,
    autoCreateDeadlines: true,
    autoCreateReminders: true,
  },
};

const StudentPreferencesSchema = new Schema<IStudentPreferences>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    timezone: { type: String, default: defaults.timezone },
    language: { type: String, default: defaults.language },
    reminders: {
      defaultOffsetsMinutes: { type: [Number], default: defaults.reminders.defaultOffsetsMinutes },
      sound: { type: Boolean, default: defaults.reminders.sound },
    },
    notifications: {
      browser: { type: Boolean, default: defaults.notifications.browser },
      email: { type: Boolean, default: defaults.notifications.email },
      telegram: { type: Boolean, default: defaults.notifications.telegram },
      inApp: { type: Boolean, default: defaults.notifications.inApp },
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
      monitoredGroupIds: { type: [String], default: defaults.telegram.monitoredGroupIds },
      autoInsights: { type: Boolean, default: defaults.telegram.autoInsights },
      autoCreateDeadlines: { type: Boolean, default: defaults.telegram.autoCreateDeadlines },
      autoCreateReminders: { type: Boolean, default: defaults.telegram.autoCreateReminders },
    },
  },
  { timestamps: true }
);

export const StudentPreferences: Model<IStudentPreferences> =
  mongoose.models.StudentPreferences ??
  mongoose.model<IStudentPreferences>("StudentPreferences", StudentPreferencesSchema);

export function getDefaultStudentPreferences(): Omit<IStudentPreferences, "_id" | "userId" | "createdAt" | "updatedAt"> {
  return JSON.parse(JSON.stringify(defaults)) as Omit<IStudentPreferences, "_id" | "userId" | "createdAt" | "updatedAt">;
}
