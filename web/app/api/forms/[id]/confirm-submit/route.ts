/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getFormJob, updateFormJob } from "@/lib/db-supabase";
import { submitPrefilledFormResponse } from "@/lib/forms/google-forms";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireAuth();
    
    // 1. Fetch form job
    const job = await getFormJob(params.id, user.id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "filled_pending_review") {
      return NextResponse.json({ error: `Job in status ${job.status} cannot be confirmed.` }, { status: 400 });
    }

    // 2. Submit based on fill method
    if (job.fill_method === "prefill_url") {
      // Reconstruct prefillParams from filled_data
      const filledData = job.filled_data || {};
      const prefillParams: Record<string, string> = {};
      
      for (const val of Object.values(filledData) as any[]) {
        if (val.entryId && val.value) {
          prefillParams[val.entryId] = val.value;
        }
      }

      const success = await submitPrefilledFormResponse(job.form_url, prefillParams);
      if (!success) {
        return NextResponse.json({ error: "Prefill submission failed to submit response to form Response endpoint." }, { status: 500 });
      }

      // Mark completed
      const updated = await updateFormJob(job.id, {
        status: "completed",
        updated_at: new Date().toISOString()
      });
      return NextResponse.json({ ok: true, job: updated });
    } else if (job.fill_method === "playwright") {
      // For Playwright, set auto_submit = true, status = pending, and trigger service
      const updated = await updateFormJob(job.id, {
        status: "pending",
        auto_submit: true,
        updated_at: new Date().toISOString()
      });

      const fallbackServiceUrl = (process.env.PLAYWRIGHT_SERVICE_URL || "").replace(/\/$/, "");
      if (!fallbackServiceUrl) {
        return NextResponse.json({ error: "Playwright service URL is not configured." }, { status: 500 });
      }

      // Trigger Playwright worker service asynchronously
      void fetch(`${fallbackServiceUrl}/fill-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: String(job.id) }),
        signal: AbortSignal.timeout(10000),
      }).catch((err) => {
        console.error("[confirm-submit] Failed to trigger Playwright service:", err);
      });

      return NextResponse.json({ ok: true, message: "Submission triggered via Playwright fallback browser.", job: updated });
    }

    return NextResponse.json({ error: "Unsupported fill method" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
