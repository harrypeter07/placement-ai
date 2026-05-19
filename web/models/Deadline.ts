import mongoose, { Schema, type Model } from "mongoose";
import type { DeadlineStatus, PlacementType } from "@/types";

export interface IDeadline {
  _id: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  company: string;
  role: string;
  deadline: Date;
  eligibility: string;
  type: PlacementType | string;
  links: string[];
  salary: string;
  status: DeadlineStatus;
  notes?: string;
  confidence: number;
  sourceMessageId?: string;
  telegramGroupId?: string;
  isGlobal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeadlineSchema = new Schema<IDeadline>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    company: { type: String, required: true },
    role: { type: String, required: true },
    deadline: { type: Date, required: true },
    eligibility: { type: String, default: "" },
    type: { type: String, default: "full-time" },
    links: [{ type: String }],
    salary: { type: String, default: "" },
    status: {
      type: String,
      enum: ["applied", "pending", "missed", "rejected", "oa_scheduled", "interview_scheduled"],
      default: "pending",
    },
    notes: { type: String },
    confidence: { type: Number, default: 0 },
    sourceMessageId: { type: String },
    telegramGroupId: { type: String },
    isGlobal: { type: Boolean, default: false },
  },
  { timestamps: true }
);

DeadlineSchema.index({ company: 1, role: 1, deadline: 1 });
DeadlineSchema.index({ userId: 1, status: 1 });

export const Deadline: Model<IDeadline> =
  mongoose.models.Deadline ?? mongoose.model<IDeadline>("Deadline", DeadlineSchema);
