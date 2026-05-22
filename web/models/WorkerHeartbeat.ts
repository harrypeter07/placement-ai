import mongoose, { Schema, type Model } from "mongoose";

export interface IWorkerHeartbeat {
  _id: mongoose.Types.ObjectId;
  service: "telegram-worker";
  status: "online" | "offline" | "waiting";
  groupsMonitored: number;
  lastMessageAt?: Date;
  lastError?: string;
  /** Multi-line diagnostic log from worker (why waiting / errors) */
  detailLog?: string;
  updatedAt: Date;
}

const WorkerHeartbeatSchema = new Schema<IWorkerHeartbeat>(
  {
    service: { type: String, default: "telegram-worker" },
    status: { type: String, enum: ["online", "offline", "waiting"], default: "offline" },
    groupsMonitored: { type: Number, default: 0 },
    lastMessageAt: { type: Date },
    lastError: { type: String },
    detailLog: { type: String },
  },
  { timestamps: true }
);

export const WorkerHeartbeat: Model<IWorkerHeartbeat> =
  mongoose.models.WorkerHeartbeat ??
  mongoose.model<IWorkerHeartbeat>("WorkerHeartbeat", WorkerHeartbeatSchema);
