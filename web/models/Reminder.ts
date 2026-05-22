import mongoose, { Schema, type Model } from "mongoose";

export type ReminderOffsetPreset = "1d" | "6h" | "1h" | "15m" | "custom";
export type ReminderPriority = "low" | "medium" | "high" | "critical";
export type ReminderStatus = "active" | "paused" | "completed" | "snoozed" | "cancelled";
export type EscalationLevel = "soft" | "normal" | "urgent" | "critical";
export type ReminderStyle = "gentle" | "balanced" | "aggressive";

export interface IReminder {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  deadlineId: mongoose.Types.ObjectId;
  scheduledAt: Date;
  /** Legacy preset; prefer minutesBeforeDeadline */
  offset?: ReminderOffsetPreset;
  /** Minutes before deadline at which this reminder fires */
  minutesBeforeDeadline: number;
  channels: ("browser" | "email" | "telegram" | "dashboard")[];
  sent: boolean;
  title?: string;
  message?: string;
  priority: ReminderPriority;
  status: ReminderStatus;
  snoozeUntil?: Date;
  enabled: boolean;
  aiSuggested: boolean;
  /** Simple repeat: "none" | "daily" until deadline */
  repeatRule: "none" | "daily";
  escalationLevel: EscalationLevel;
  escalationCount: number;
  reminderStyle: ReminderStyle;
  lastNotifiedAt?: Date;
  aiSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReminderSchema = new Schema<IReminder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deadlineId: { type: Schema.Types.ObjectId, ref: "Deadline", required: true },
    scheduledAt: { type: Date, required: true },
    offset: {
      type: String,
      enum: ["1d", "6h", "1h", "15m", "custom"],
    },
    minutesBeforeDeadline: { type: Number },
    channels: [{ type: String, enum: ["browser", "email", "telegram", "dashboard"] }],
    sent: { type: Boolean, default: false },
    title: { type: String },
    message: { type: String },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["active", "paused", "completed", "snoozed", "cancelled"],
      default: "active",
    },
    snoozeUntil: { type: Date },
    enabled: { type: Boolean, default: true },
    aiSuggested: { type: Boolean, default: false },
    repeatRule: { type: String, enum: ["none", "daily"], default: "none" },
    escalationLevel: {
      type: String,
      enum: ["soft", "normal", "urgent", "critical"],
      default: "normal",
    },
    escalationCount: { type: Number, default: 0 },
    reminderStyle: {
      type: String,
      enum: ["gentle", "balanced", "aggressive"],
      default: "balanced",
    },
    lastNotifiedAt: { type: Date },
    aiSummary: { type: String },
  },
  { timestamps: true }
);

ReminderSchema.index({ scheduledAt: 1, sent: 1, status: 1 });
ReminderSchema.index({ userId: 1, deadlineId: 1 });
ReminderSchema.index({ userId: 1, status: 1, scheduledAt: 1 });

export const Reminder: Model<IReminder> =
  mongoose.models.Reminder ?? mongoose.model<IReminder>("Reminder", ReminderSchema);
