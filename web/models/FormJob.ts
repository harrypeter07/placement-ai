import mongoose, { Schema, type Model } from "mongoose";

export interface IFormJob {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  formUrl: string;
  status: "pending" | "running" | "completed" | "failed";
  profileData: {
    fullName: string;
    email: string;
    phone: string;
    cgpa: string;
    branch: string;
    graduationYear: string;
    resumeLink: string;
    githubLink?: string;
    linkedInLink?: string;
    rollNumber?: string;
    additionalInfo?: string;
  };
  autoSubmit: boolean;
  fillMethod?: "prefill_url" | "playwright";
  screenshot?: string; // URL of the screenshot stored on Railway fallback service
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FormJobSchema = new Schema<IFormJob>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    formUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
    },
    profileData: {
      fullName: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      cgpa: { type: String, required: true },
      branch: { type: String, required: true },
      graduationYear: { type: String, required: true },
      resumeLink: { type: String, required: true },
      githubLink: { type: String, default: "" },
      linkedInLink: { type: String, default: "" },
      rollNumber: { type: String, default: "" },
      additionalInfo: { type: String, default: "" },
    },
    autoSubmit: { type: Boolean, default: false },
    fillMethod: { type: String, enum: ["prefill_url", "playwright"] },
    screenshot: { type: String },
    error: { type: String },
  },
  { timestamps: true }
);

export const FormJob: Model<IFormJob> =
  mongoose.models.FormJob ?? mongoose.model<IFormJob>("FormJob", FormJobSchema);
