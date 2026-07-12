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
    const jobs = await getFormJobs(user.id);
    return NextResponse.json(jobs.map(mapDbJobToFrontend));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid inputs", details: parsed.error.flatten() }, { status: 400 });
    }

    const prefs = await getStudentPreferences(user.id);
    const profile = prefs?.form_profile;
    if (!profile || !profile.fullName) {
      return NextResponse.json(
        { error: "Please complete your Form Automator Profile in Settings first." },
        { status: 400 }
      );
    }

    const { formUrl, autoSubmit } = parsed.data;

    const job = await createFormJob({
      userId: user.id,
      formUrl,
      status: "pending",
      profileData: {
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        cgpa: profile.cgpa,
        branch: profile.branch,
        graduationYear: profile.graduationYear,
        resumeLink: profile.resumeLink,
        githubLink: profile.githubLink || "",
        linkedInLink: profile.linkedInLink || "",
        rollNumber: profile.rollNumber || "",
        additionalInfo: profile.additionalInfo || "",
      },
      autoSubmit,
      triggerSource: "dashboard",
    });

    // Execute job using shared fill logic (will complete immediately or queue Playwright)
    await runFormJobFilling(job);

    // Fetch refreshed job state from Supabase to return final response
    const { data: refreshed, error: refreshError } = await supabase
      .from("form_jobs")
      .select("*")
      .eq("id", job.id)
      .single();

    if (refreshError || !refreshed) {
      return NextResponse.json(mapDbJobToFrontend(job), { status: 201 });
    }

    return NextResponse.json(mapDbJobToFrontend(refreshed), { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
