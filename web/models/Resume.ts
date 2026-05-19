import mongoose, { Schema, type Model } from "mongoose";

export interface IResume {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  fileName: string;
  fileUrl: string;
  atsScore: number;
  skills: string[];
  missingSkills: string[];
  suggestions: string[];
  companyCompatibility: { company: string; match: number }[];
  analyzedAt: Date;
  createdAt: Date;
}

const ResumeSchema = new Schema<IResume>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    atsScore: { type: Number, default: 0 },
    skills: [{ type: String }],
    missingSkills: [{ type: String }],
    suggestions: [{ type: String }],
    companyCompatibility: [
      {
        company: String,
        match: Number,
      },
    ],
    analyzedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Resume: Model<IResume> =
  mongoose.models.Resume ?? mongoose.model<IResume>("Resume", ResumeSchema);
