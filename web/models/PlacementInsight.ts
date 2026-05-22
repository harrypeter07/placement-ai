import mongoose, { Schema, type Model } from "mongoose";

export type InsightStatus = "draft" | "applied" | "dismissed";

export interface IPlacementInsight {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  groupId: string;
  groupTitle?: string;
  rank: number;
  title: string;
  summary: string;
  whyRanked?: string;
  urgency: "low" | "medium" | "high" | "critical";
  category: "deadline" | "reminder" | "info" | "action";
  confidence: number;
  status: InsightStatus;
  pinnedToOverview: boolean;
  extractedDeadline?: {
    company: string;
    role: string;
    deadline: string;
    eligibility?: string;
    links?: string[];
    type?: string;
  };
  suggestedReminderOffsetsMinutes?: number[];
  sourceMessageIds?: string[];
  sourceMessagePreview?: string;
  deadlineId?: mongoose.Types.ObjectId;
  reminderCount?: number;
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
    whyRanked: { type: String },
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
    status: {
      type: String,
      enum: ["draft", "applied", "dismissed"],
      default: "draft",
    },
    pinnedToOverview: { type: Boolean, default: false },
    extractedDeadline: {
      company: String,
      role: String,
      deadline: String,
      eligibility: String,
      links: [String],
      type: String,
    },
    suggestedReminderOffsetsMinutes: [Number],
    sourceMessageIds: [{ type: String }],
    sourceMessagePreview: { type: String },
    deadlineId: { type: Schema.Types.ObjectId, ref: "Deadline" },
    reminderCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PlacementInsightSchema.index({ userId: 1, createdAt: -1 });
PlacementInsightSchema.index({ userId: 1, status: 1 });
PlacementInsightSchema.index({ userId: 1, pinnedToOverview: 1 });

export const PlacementInsight: Model<IPlacementInsight> =
  mongoose.models.PlacementInsight ??
  mongoose.model<IPlacementInsight>("PlacementInsight", PlacementInsightSchema);
