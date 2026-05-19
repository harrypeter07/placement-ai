import mongoose, { Schema, type Model } from "mongoose";
import type { UserRole } from "@/types";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password?: string;
  image?: string;
  role: UserRole;
  branch?: string;
  cgpa?: number;
  backlogs?: number;
  graduationYear?: number;
  googleCalendarConnected?: boolean;
  /** @deprecated use structured calendar fields */
  googleCalendarTokens?: string;
  googleCalendarRefreshToken?: string;
  googleCalendarAccessToken?: string;
  googleCalendarAccessTokenExpires?: number;
  telegramChatId?: string;
  placementStreak?: number;
  productivityScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    image: { type: String },
    role: { type: String, enum: ["student", "admin"], default: "student" },
    branch: { type: String },
    cgpa: { type: Number },
    backlogs: { type: Number, default: 0 },
    graduationYear: { type: Number },
    googleCalendarConnected: { type: Boolean, default: false },
    googleCalendarTokens: { type: String },
    googleCalendarRefreshToken: { type: String },
    googleCalendarAccessToken: { type: String },
    googleCalendarAccessTokenExpires: { type: Number },
    telegramChatId: { type: String },
    placementStreak: { type: Number, default: 0 },
    productivityScore: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const User: Model<IUser> =
  mongoose.models.User ?? mongoose.model<IUser>("User", UserSchema);
