/* eslint-disable @typescript-eslint/no-explicit-any */
import { updateFormJob } from "@/lib/db-supabase";
import { parseGoogleFormFields, fuzzyMatchFormField, submitPrefilledFormResponse } from "./google-forms";
import { sendTelegramAlertToUser } from "@/lib/notifications/twilio";

export async function runFormJobFilling(job: any) {
  const formUrl = job.form_url || job.formUrl;
  const isCall = (job.trigger_source === "call" || job.triggerSource === "call");
  
  // Hard Rule: Call-triggered jobs can never auto-submit
  const autoSubmit = isCall ? false : (job.auto_submit ?? job.autoSubmit ?? false);

  let parseResult;
  try {
    parseResult = await parseGoogleFormFields(formUrl);
  } catch (parseErr) {
    console.warn("[PrefillScraper] Scraper failed, falling back to Playwright:", parseErr);
  }

  // Determine if we can use Prefilled URL method
  const canUsePrefill = parseResult && !parseResult.requiresLogin && !parseResult.isMultiPage;

  if (canUsePrefill && parseResult) {
    const prefillParams: Record<string, string> = {};
    const filledData: Record<string, { label: string; value: string; entryId?: string }> = {};
    
    for (const field of parseResult.fields) {
      const val = fuzzyMatchFormField(field.label, job.profile_data || job.profileData);
      if (val !== undefined) {
        prefillParams[field.entryId] = val;
        filledData[field.label] = { label: field.label, value: val, entryId: field.entryId };
      }
    }

    // If we fuzzy matched at least one field, use prefill
    if (Object.keys(prefillParams).length > 0) {
      // Construct prefilled link
      const urlObj = new URL(formUrl);
      for (const [k, v] of Object.entries(prefillParams)) {
        urlObj.searchParams.append(k, v);
      }
      urlObj.searchParams.append("usp", "pp_url");
      const prefilledUrl = urlObj.toString();

      if (autoSubmit && !isCall) {
        // Submit directly via POST
        const success = await submitPrefilledFormResponse(formUrl, prefillParams);
        if (success) {
          await updateFormJob(job.id, {
            status: "completed",
            fill_method: "prefill_url",
            screenshot: prefilledUrl,
            filled_data: filledData,
          });
          return;
        } else {
          console.warn("[PrefillSubmit] POST failed, falling back to Playwright service");
        }
      } else {
        // Dry-run/Call-triggered review gate: complete immediately and return prefilled URL link
        // For calls, set status to filled_pending_review!
        const status = isCall ? "filled_pending_review" : "completed";
        await updateFormJob(job.id, {
          status,
          fill_method: "prefill_url",
          screenshot: prefilledUrl,
          filled_data: filledData,
        });

        if (isCall) {
          const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/forms?jobId=${job.id}`;
          await sendTelegramAlertToUser(
            `📞 PlaceMint AI Form Alert: Form for ${formUrl} has been prefilled successfully via phone call call-to-action! Please open the dashboard to review and click Submit Now to complete application: ${reviewUrl}`
          );
        }
        return;
      }
    }
  }

  // FALLBACK: Playwright service trigger
  const fallbackServiceUrl = (process.env.PLAYWRIGHT_SERVICE_URL || "").replace(/\/$/, "");
  if (!fallbackServiceUrl) {
    // No Playwright fallback configured, fail the job
    const updated = await updateFormJob(job.id, {
      status: "failed",
      error: "Google Form requires manual interaction or Playwright fallback service is not configured.",
    });
    if (isCall) {
      await sendTelegramAlertToUser(
        `❌ PlaceMint AI Form Alert: Playwright fallback service is not configured for call-triggered job. FormUrl: ${formUrl}`
      );
    }
    return;
  }

  // Mark job as running and call Playwright service
  await updateFormJob(job.id, {
    status: "running",
    fill_method: "playwright",
  });

  // Trigger Playwright worker service asynchronously
  void fetch(`${fallbackServiceUrl}/fill-form`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId: String(job.id) }),
    signal: AbortSignal.timeout(10000),
  }).catch((err) => {
    console.error("[POST forms] Failed to trigger Playwright service:", err);
  });
}
