import mongoose, { Schema, type Model } from "mongoose";

/** Platform-wide Telethon session (linked once from dashboard). */
export interface ITelegramWorkerSession {
  _id: mongoose.Types.ObjectId;
  key: "default";
  sessionString: string;
  phoneNumber: string;
  telegramUserId?: string;
  telegramUsername?: string;
  displayName?: string;
  linkedByUserId?: mongoose.Types.ObjectId;
  connectedAt: Date;
  updatedAt: Date;
  createdAt: Date;
}

const TelegramWorkerSessionSchema = new Schema<ITelegramWorkerSession>(
  {
    key: { type: String, default: "default", unique: true },
    sessionString: { type: String, required: true, select: false },
    phoneNumber: { type: String, required: true },
    telegramUserId: { type: String },
    telegramUsername: { type: String },
    displayName: { type: String },
    linkedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    connectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const TelegramWorkerSession: Model<ITelegramWorkerSession> =
  mongoose.models.TelegramWorkerSession ??
  mongoose.model<ITelegramWorkerSession>("TelegramWorkerSession", TelegramWorkerSessionSchema);
