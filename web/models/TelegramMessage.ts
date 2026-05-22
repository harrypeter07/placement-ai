import mongoose, { Schema, type Model } from "mongoose";

export type TelegramMediaType = "none" | "photo" | "video" | "document" | "sticker" | "voice" | "other";

export interface ITelegramMessage {
  _id: mongoose.Types.ObjectId;
  groupId: string;
  messageId: string;
  text: string;
  senderName?: string;
  sentAt: Date;
  mediaType?: TelegramMediaType;
  hasMedia?: boolean;
  createdAt: Date;
}

const TelegramMessageSchema = new Schema<ITelegramMessage>(
  {
    groupId: { type: String, required: true, index: true },
    messageId: { type: String, required: true },
    text: { type: String, required: true },
    senderName: { type: String },
    sentAt: { type: Date, required: true, index: true },
    mediaType: {
      type: String,
      enum: ["none", "photo", "video", "document", "sticker", "voice", "other"],
      default: "none",
    },
    hasMedia: { type: Boolean, default: false },
  },
  { timestamps: true }
);

TelegramMessageSchema.index({ groupId: 1, messageId: 1 }, { unique: true });
TelegramMessageSchema.index({ groupId: 1, sentAt: -1 });

export const TelegramMessage: Model<ITelegramMessage> =
  mongoose.models.TelegramMessage ??
  mongoose.model<ITelegramMessage>("TelegramMessage", TelegramMessageSchema);
