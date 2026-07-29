/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/api-auth";
import { supabase } from "@/lib/supabase";
import {
  getStudentPreferences,
  getFormJobs,
} from "@/lib/db-supabase";
import { runFormJobFilling } from "@/lib/forms/executor";
import { getErrorMessage } from "@/lib/utils/error";

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
    filledData: j.filled_data,
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
    console.log("[API GET /api/forms] Found", jobs.length, "jobs");
    return NextResponse.json(jobs.map(mapDbJobToFrontend));
  } catch (e) {
    const msg = getErrorMessage(e);
    console.error("[API GET /api/forms Error]:", msg, e);
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    console.log("[API POST /api/forms] User:", user.id, "| Body:", JSON.stringify(body));

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.flatten();
      console.warn("[API POST /api/forms] Validation failed:", JSON.stringify(details));
      return NextResponse.json({ error: "Invalid inputs", details }, { status: 400 });
    }

    // ── Step 1: Get student preferences ──────────────────────────────────────
    let prefs: any = null;
    try {
      prefs = await getStudentPreferences(user.id);
    } catch (prefErr) {
      const prefMsg = getErrorMessage(prefErr);
      console.error("[API POST /api/forms] getStudentPreferences threw:", prefMsg, prefErr);
      return NextResponse.json(
        { error: `Failed to load your profile: ${prefMsg}` },
        { status: 500 }
      );
    }

    console.log(
      "[API POST /api/forms] Prefs for user:", user.id,
      "| prefs null?", !prefs,
      "| form_profile present?", !!prefs?.form_profile,
      "| form_profile.fullName:", prefs?.form_profile?.fullName ?? "MISSING",
      "| prefs keys:", prefs ? Object.keys(prefs).join(",") : "N/A"
    );

    // ── Step 2: Validate profile ──────────────────────────────────────────────
    const profile = prefs?.form_profile || prefs?.formProfile;
    if (!profile) {
      return NextResponse.json(
        { error: "form_profile is null or missing. Please go to Student Profile (/dashboard/profile) and save your details first." },
        { status: 400 }
      );
    }
    if (!profile.fullName) {
      return NextResponse.json(
        { error: "Your profile is missing a Full Name. Please fill it in at /dashboard/profile and save." },
        { status: 400 }
      );
    }

    const { formUrl, autoSubmit } = parsed.data;
    const profileData = {
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
    };

    // ── Step 3: Insert job row ────────────────────────────────────────────────
    const { data: job, error: insertError } = await supabase
      .from("form_jobs")
      .insert([{
        user_id: user.id,
        form_url: formUrl,
        status: "pending",
        profile_data: profileData,
        auto_submit: autoSubmit ?? false,
        trigger_source: "dashboard",
        // Note: filled_data column must exist in Supabase — add via: 
        // ALTER TABLE form_jobs ADD COLUMN IF NOT EXISTS filled_data JSONB DEFAULT '{}';
      }])
      .select("*")
      .single();

    if (insertError || !job) {
      const msg = getErrorMessage(insertError) || "Failed to create form job";
      console.error("[API POST /api/forms] Insert job error:", msg, insertError);
      return NextResponse.json({ error: `DB error creating job: ${msg}` }, { status: 500 });
    }

    console.log("[API POST /api/forms] Job inserted successfully. ID:", job.id);

    // ── Step 4: Run executor (non-fatal) ──────────────────────────────────────
    try {
      await runFormJobFilling(job);
      console.log("[API POST /api/forms] Executor completed for job:", job.id);
    } catch (execErr) {
      const execMsg = getErrorMessage(execErr);
      console.error("[API POST /api/forms] Executor error (non-fatal):", execMsg, execErr);
      // Don't rethrow — job was created, executor failure just means no auto-fill
    }

    // ── Step 5: Return refreshed job ─────────────────────────────────────────
    const { data: refreshed, error: refreshError } = await supabase
      .from("form_jobs")
      .select("*")
      .eq("id", job.id)
      .single();

    if (refreshError || !refreshed) {
      console.warn("[API POST /api/forms] Refresh error (returning original):", getErrorMessage(refreshError));
      return NextResponse.json(mapDbJobToFrontend(job), { status: 201 });
    }

    return NextResponse.json(mapDbJobToFrontend(refreshed), { status: 201 });

  } catch (e) {
    const msg = getErrorMessage(e);
    console.error("[API POST /api/forms] Unhandled exception:", msg, e);
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
