import mongoose, { Schema, type Model } from "mongoose";

export interface ITelegramGroup {
  _id: mongoose.Types.ObjectId;
  groupId: string;
  title: string;
  kind?: "group" | "channel" | "supergroup";
  username?: string;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  messageCount: number;
  lastDiscoveredAt?: Date;
  updatedAt: Date;
  createdAt: Date;
}

const TelegramGroupSchema = new Schema<ITelegramGroup>(
  {
    groupId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    kind: { type: String, enum: ["group", "channel", "supergroup"], default: "group" },
    username: { type: String },
    lastMessageAt: { type: Date },
    lastDiscoveredAt: { type: Date },
    lastMessagePreview: { type: String, default: "" },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TelegramGroupSchema.index({ lastMessageAt: -1 });

export const TelegramGroup: Model<ITelegramGroup> =
  mongoose.models.TelegramGroup ??
  mongoose.model<ITelegramGroup>("TelegramGroup", TelegramGroupSchema);
