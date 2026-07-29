/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";
import { supabase } from "@/lib/supabase";
import {
  getStudentPreferences,
  createFormJob,
  getFormJobs,
} from "@/lib/db-supabase";
import { runFormJobFilling } from "@/lib/forms/executor";

export const runtime = "nodejs";

const createSchema = z.object({
  formUrl: z.string().url(),
  autoSubmit: z.boolean().default(false),
});

function mapDbJobToFrontend(j: any) {
  return {
    _id: j.id,
    userId: j.user_id,
    formUrl: j.form_url,
    status: j.status,
    profileData: j.profile_data,
    autoSubmit: j.auto_submit,
    fillMethod: j.fill_method,
    screenshot: j.screenshot,
    error: j.error,
    createdAt: j.created_at,
    updatedAt: j.updated_at,
  };
}

export async function GET() {
  try {
    const user = await requireAuth();
    console.log("[API GET /api/forms] Fetching jobs for user:", user.id);
    const jobs = await getFormJobs(user.id);
    return NextResponse.json(jobs.map(mapDbJobToFrontend));
  } catch (e) {
    console.error("[API GET /api/forms Error]:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    console.log("[API POST /api/forms] Received request:", body);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      console.warn("[API POST /api/forms] Input validation failed:", parsed.error.flatten());
      return NextResponse.json({ error: "Invalid inputs", details: parsed.error.flatten() }, { status: 400 });
    }

    const prefs = await getStudentPreferences(user.id);
    console.log("[API POST /api/forms] Prefs fetched for user:", user.id, "| form_profile present:", !!prefs?.form_profile, "| form_profile.fullName:", prefs?.form_profile?.fullName);

    // Support both form_profile (DB column) and formProfile (camelCase alias)
    const profile = prefs?.form_profile || (prefs as any)?.formProfile;
    if (!profile || !profile.fullName) {
      const reason = !prefs ? "No preferences row found" : !profile ? "form_profile is null/empty" : "fullName is missing";
      console.warn("[API POST /api/forms] Profile incomplete for user:", user.id, "| Reason:", reason, "| prefs keys:", prefs ? Object.keys(prefs) : "N/A");
      return NextResponse.json(
        { error: `Profile incomplete (${reason}). Please go to Student Profile (/dashboard/profile) and save your details first.` },
        { status: 400 }
      );
    }

    const { formUrl, autoSubmit } = parsed.data;

    const job = await createFormJob({
      userId: user.id,
      formUrl,
      status: "pending",
      profileData: {
        fullName: profile.fullName || "",
        email: profile.email || "",
        phone: profile.phone || "",
        collegeName: profile.collegeName || "",
        cgpa: profile.cgpa || "",
        branch: profile.branch || "",
        graduationYear: profile.graduationYear || "",
        rollNumber: profile.rollNumber || "",
        resumeLink: profile.resumeLink || "",
        githubLink: profile.githubLink || "",
        linkedInLink: profile.linkedInLink || "",
        portfolioUrl: profile.portfolioUrl || "",
        workExperience: profile.workExperience || "",
        projects: profile.projects || "",
        skills: profile.skills || "",
        certifications: profile.certifications || "",
        additionalInfo: profile.additionalInfo || "",
      },
      autoSubmit,
      triggerSource: "dashboard",
    });

    console.log("[API POST /api/forms] Job created successfully ID:", job.id);

    // Execute job using shared fill logic - wrapped so any executor error doesn't kill the response
    try {
      await runFormJobFilling(job);
      console.log("[API POST /api/forms] runFormJobFilling completed for job:", job.id);
    } catch (execErr) {
      console.error("[API POST /api/forms] runFormJobFilling error (non-fatal, job still created):", execErr);
      // Don't rethrow - the job was created, executor errors should not block the response
    }

    // Fetch refreshed job state from Supabase to return final response
    const { data: refreshed, error: refreshError } = await supabase
      .from("form_jobs")
      .select("*")
      .eq("id", job.id)
      .single();

    if (refreshError || !refreshed) {
      console.warn("[API POST /api/forms] Refresh error, returning created job:", refreshError);
      return NextResponse.json(mapDbJobToFrontend(job), { status: 201 });
    }

    return NextResponse.json(mapDbJobToFrontend(refreshed), { status: 201 });
  } catch (e) {
    console.error("[API POST /api/forms Exception]:", e);
    console.error("[API POST /api/forms Stack]:", e instanceof Error ? e.stack : "No stack");
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
