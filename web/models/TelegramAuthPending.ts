import mongoose, { Schema, type Model } from "mongoose";

export interface ITelegramAuthPending {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  phoneNumber: string;
  phoneCodeHash: string;
  /** Telethon/GramJS session from sendCode — required for SignIn on same connection */
  authSessionString: string;
  isCodeViaApp?: boolean;
  lastSentAt: Date;
  sendCount: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TelegramAuthPendingSchema = new Schema<ITelegramAuthPending>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    phoneNumber: { type: String, required: true },
    phoneCodeHash: { type: String, required: true },
    authSessionString: { type: String, required: true, select: false },
    isCodeViaApp: { type: Boolean, default: false },
    lastSentAt: { type: Date, default: Date.now },
    sendCount: { type: Number, default: 1 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

export const TelegramAuthPending: Model<ITelegramAuthPending> =
  mongoose.models.TelegramAuthPending ??
  mongoose.model<ITelegramAuthPending>("TelegramAuthPending", TelegramAuthPendingSchema);

export const TELEGRAM_RESEND_COOLDOWN_MS = 45_000;
export const TELEGRAM_MAX_SENDS_PER_HOUR = 6;
