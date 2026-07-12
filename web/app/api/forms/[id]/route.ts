/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getFormJob } from "@/lib/db-supabase";

export const runtime = "nodejs";

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

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireAuth();
    const job = await getFormJob(params.id, user.id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(mapDbJobToFrontend(job));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
