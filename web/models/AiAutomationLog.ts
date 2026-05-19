import mongoose, { Schema, type Model } from "mongoose";

export type AiAutomationLogType =
  | "reminder_created"
  | "reminder_skipped"
  | "calendar_sync"
  | "calendar_error"
  | "ai_analysis"
  | "settings_update"
  | "automation_toggle";

export interface IAiAutomationLog {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: AiAutomationLogType;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AiAutomationLogSchema = new Schema<IAiAutomationLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "reminder_created",
        "reminder_skipped",
        "calendar_sync",
        "calendar_error",
        "ai_analysis",
        "settings_update",
        "automation_toggle",
      ],
      required: true,
    },
    summary: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

AiAutomationLogSchema.index({ userId: 1, createdAt: -1 });

export const AiAutomationLog: Model<IAiAutomationLog> =
  mongoose.models.AiAutomationLog ??
  mongoose.model<IAiAutomationLog>("AiAutomationLog", AiAutomationLogSchema);
