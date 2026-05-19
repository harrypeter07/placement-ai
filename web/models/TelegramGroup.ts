import mongoose, { Schema, type Model } from "mongoose";

export interface ITelegramGroup {
  _id: mongoose.Types.ObjectId;
  groupId: string;
  title: string;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  messageCount: number;
  updatedAt: Date;
  createdAt: Date;
}

const TelegramGroupSchema = new Schema<ITelegramGroup>(
  {
    groupId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String, default: "" },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TelegramGroupSchema.index({ lastMessageAt: -1 });

export const TelegramGroup: Model<ITelegramGroup> =
  mongoose.models.TelegramGroup ??
  mongoose.model<ITelegramGroup>("TelegramGroup", TelegramGroupSchema);
