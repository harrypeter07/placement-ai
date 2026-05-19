import mongoose, { Schema, type Model } from "mongoose";

export interface ICalendarEventMap {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  deadlineId: mongoose.Types.ObjectId;
  googleEventId: string;
  etag?: string;
  updatedAt: Date;
  createdAt: Date;
}

const CalendarEventMapSchema = new Schema<ICalendarEventMap>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deadlineId: { type: Schema.Types.ObjectId, ref: "Deadline", required: true },
    googleEventId: { type: String, required: true },
    etag: { type: String },
  },
  { timestamps: true }
);

CalendarEventMapSchema.index({ userId: 1, deadlineId: 1 }, { unique: true });

export const CalendarEventMap: Model<ICalendarEventMap> =
  mongoose.models.CalendarEventMap ??
  mongoose.model<ICalendarEventMap>("CalendarEventMap", CalendarEventMapSchema);
