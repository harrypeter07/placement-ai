import mongoose, { Schema, type Model } from "mongoose";
import type { DeadlineStatus } from "@/types";

export interface IApplication {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  deadlineId: mongoose.Types.ObjectId;
  company: string;
  role: string;
  status: DeadlineStatus;
  appliedAt?: Date;
  notes?: string;
  link?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApplicationSchema = new Schema<IApplication>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deadlineId: { type: Schema.Types.ObjectId, ref: "Deadline", required: true },
    company: { type: String, required: true },
    role: { type: String, required: true },
    status: {
      type: String,
      enum: ["applied", "pending", "missed", "rejected", "oa_scheduled", "interview_scheduled"],
      default: "pending",
    },
    appliedAt: { type: Date },
    notes: { type: String },
    link: { type: String },
  },
  { timestamps: true }
);

ApplicationSchema.index({ userId: 1, company: 1 });

export const Application: Model<IApplication> =
  mongoose.models.Application ??
  mongoose.model<IApplication>("Application", ApplicationSchema);
