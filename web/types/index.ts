export type UserRole = "student" | "admin";

export type DeadlineStatus =
  | "applied"
  | "pending"
  | "missed"
  | "rejected"
  | "oa_scheduled"
  | "interview_scheduled";

export type PlacementType = "internship" | "full-time" | "both";

export interface ExtractedPlacement {
  company: string;
  role: string;
  deadline: string;
  eligibility: string;
  type: PlacementType | string;
  links: string[];
  salary: string;
  confidence: number;
}

export interface EligibilityProfile {
  branch: string;
  cgpa: number;
  backlogs: number;
  graduationYear: number;
}

export interface DashboardStats {
  upcomingDeadlines: number;
  appliedCompanies: number;
  missedOpportunities: number;
  eligibleCompanies: number;
  reminderCount: number;
  placementStreak: number;
  productivityScore: number;
}

export interface ResumeAnalysis {
  atsScore: number;
  skills: string[];
  missingSkills: string[];
  suggestions: string[];
  companyCompatibility: { company: string; match: number }[];
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: "deadline" | "reminder" | "system" | "placement";
  read: boolean;
  createdAt: string;
}
