import mongoose, { Schema, type Model } from "mongoose";

export interface IBroadcast {
  _id: mongoose.Types.ObjectId;
  adminId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  company?: string;
  deadline?: Date;
  targetRole?: "student" | "all";
  createdAt: Date;
}

const BroadcastSchema = new Schema<IBroadcast>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    company: { type: String },
    deadline: { type: Date },
    targetRole: { type: String, enum: ["student", "all"], default: "student" },
  },
  { timestamps: true }
);

export const Broadcast: Model<IBroadcast> =
  mongoose.models.Broadcast ??
  mongoose.model<IBroadcast>("Broadcast", BroadcastSchema);
