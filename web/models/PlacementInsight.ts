import mongoose, { Schema, type Model } from "mongoose";

export interface IPlacementInsight {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  groupId: string;
  groupTitle?: string;
  rank: number;
  title: string;
  summary: string;
  urgency: "low" | "medium" | "high" | "critical";
  category: "deadline" | "reminder" | "info" | "action";
  confidence: number;
  deadlineId?: mongoose.Types.ObjectId;
  reminderCount?: number;
  sourceMessageIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const PlacementInsightSchema = new Schema<IPlacementInsight>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    groupId: { type: String, required: true },
    groupTitle: { type: String },
    rank: { type: Number, default: 99 },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    urgency: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    category: {
      type: String,
      enum: ["deadline", "reminder", "info", "action"],
      default: "info",
    },
    confidence: { type: Number, default: 0.5 },
    deadlineId: { type: Schema.Types.ObjectId, ref: "Deadline" },
    reminderCount: { type: Number, default: 0 },
    sourceMessageIds: [{ type: String }],
  },
  { timestamps: true }
);

PlacementInsightSchema.index({ userId: 1, createdAt: -1 });

export const PlacementInsight: Model<IPlacementInsight> =
  mongoose.models.PlacementInsight ??
  mongoose.model<IPlacementInsight>("PlacementInsight", PlacementInsightSchema);
