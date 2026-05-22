import mongoose, { Schema, type Model } from "mongoose";

export type EscalationLevel = "soft" | "normal" | "urgent" | "critical";

export interface INotificationLog {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  reminderId?: mongoose.Types.ObjectId;
  channel: "browser" | "push" | "dashboard" | "email";
  title: string;
  body: string;
  escalationLevel: EscalationLevel;
  delivered: boolean;
  clicked: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reminderId: { type: Schema.Types.ObjectId, ref: "Reminder" },
    channel: { type: String, enum: ["browser", "push", "dashboard", "email"], default: "browser" },
    title: { type: String, required: true },
    body: { type: String, required: true },
    escalationLevel: {
      type: String,
      enum: ["soft", "normal", "urgent", "critical"],
      default: "normal",
    },
    delivered: { type: Boolean, default: true },
    clicked: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

NotificationLogSchema.index({ userId: 1, createdAt: -1 });

export const NotificationLog: Model<INotificationLog> =
  mongoose.models.NotificationLog ??
  mongoose.model<INotificationLog>("NotificationLog", NotificationLogSchema);
