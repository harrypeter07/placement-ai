import mongoose, { Schema, type Model } from "mongoose";

export interface IPushToken {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  token: string;
  platform: "web" | "android" | "ios" | "unknown";
  userAgent?: string;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PushTokenSchema = new Schema<IPushToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ["web", "android", "ios", "unknown"], default: "web" },
    userAgent: { type: String },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const PushToken: Model<IPushToken> =
  mongoose.models.PushToken ?? mongoose.model<IPushToken>("PushToken", PushTokenSchema);
