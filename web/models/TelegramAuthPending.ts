import mongoose, { Schema, type Model } from "mongoose";

export interface ITelegramAuthPending {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  phoneNumber: string;
  phoneCodeHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TelegramAuthPendingSchema = new Schema<ITelegramAuthPending>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    phoneNumber: { type: String, required: true },
    phoneCodeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

export const TelegramAuthPending: Model<ITelegramAuthPending> =
  mongoose.models.TelegramAuthPending ??
  mongoose.model<ITelegramAuthPending>("TelegramAuthPending", TelegramAuthPendingSchema);
