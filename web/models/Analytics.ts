import mongoose, { Schema, type Model } from "mongoose";

export interface IAnalytics {
  _id: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  date: Date;
  applicationsSubmitted: number;
  deadlinesTracked: number;
  remindersSent: number;
  placementsFound: number;
  metadata?: Record<string, unknown>;
}

const AnalyticsSchema = new Schema<IAnalytics>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    date: { type: Date, required: true },
    applicationsSubmitted: { type: Number, default: 0 },
    deadlinesTracked: { type: Number, default: 0 },
    remindersSent: { type: Number, default: 0 },
    placementsFound: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

AnalyticsSchema.index({ userId: 1, date: -1 });

export const Analytics: Model<IAnalytics> =
  mongoose.models.Analytics ??
  mongoose.model<IAnalytics>("Analytics", AnalyticsSchema);
