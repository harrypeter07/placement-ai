/* eslint-disable @typescript-eslint/no-explicit-any */
import { updateFormJob } from "@/lib/db-supabase";
import { parseGoogleFormFields, fuzzyMatchFormField, submitPrefilledFormResponse } from "./google-forms";
import { sendTelegramAlertToUser } from "@/lib/notifications/twilio";

/** Safely update a form job — if filled_data column missing, retry without it */
async function safeUpdateFormJob(jobId: string, updateData: Record<string, any>) {
  try {
    return await safeUpdateFormJob(jobId, updateData);
  } catch (err: any) {
    const msg: string = err?.message || String(err);
    // PGRST204 = column not found in schema cache
    if (msg.includes("filled_data") && msg.includes("PGRST204")) {
      console.warn("[executor] filled_data column missing in DB — retrying without it");
      const { filled_data: _dropped, ...rest } = updateData;
      return await safeUpdateFormJob(jobId, rest);
    }
    throw err;
  }
}

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
          await safeUpdateFormJob(job.id, {
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
        await safeUpdateFormJob(job.id, {
          status,
          fill_method: "prefill_url",
          screenshot: prefilledUrl,
          filled_data: filledData,
        });

        if (isCall) {
          const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/forms?jobId=${job.id}`;
          try {
            await sendTelegramAlertToUser(
              `📞 PlaceMint AI Form Alert: Form for ${formUrl} has been prefilled successfully via phone call call-to-action! Please open the dashboard to review and click Submit Now to complete application: ${reviewUrl}`
            );
          } catch (tgErr) {
            console.warn("[executor] Telegram alert failed (non-fatal):", tgErr);
          }
        }
        return;
      }
    }
  }

  // FALLBACK: Playwright service trigger or Interactive In-App View
  const fallbackServiceUrl = (process.env.PLAYWRIGHT_SERVICE_URL || "").replace(/\/$/, "");
  if (!fallbackServiceUrl) {
    // Generate default profile filledData map so user can 1-click copy fields in app
    const profile = job.profile_data || job.profileData || {};
    const filledData: Record<string, { label: string; value: string }> = {};
    if (profile.fullName) filledData["Full Name"] = { label: "Full Name", value: profile.fullName };
    if (profile.email) filledData["Email Address"] = { label: "Email Address", value: profile.email };
    if (profile.phone) filledData["Phone Number"] = { label: "Phone Number", value: profile.phone };
    if (profile.collegeName) filledData["College / University"] = { label: "College / University", value: profile.collegeName };
    if (profile.cgpa) filledData["CGPA / Percentage"] = { label: "CGPA / Percentage", value: profile.cgpa };
    if (profile.branch) filledData["Branch / Major"] = { label: "Branch / Major", value: profile.branch };
    if (profile.graduationYear) filledData["Graduation Year"] = { label: "Graduation Year", value: profile.graduationYear };
    if (profile.resumeLink) filledData["Resume Link"] = { label: "Resume Link", value: profile.resumeLink };

    const status = isCall ? "filled_pending_review" : "completed";
    const reqLoginNote = parseResult?.requiresLogin
      ? "Note: This Google Form requires Google Sign-in. You can sign in and auto-fill your profile directly in the embedded view below!"
      : null;

    await safeUpdateFormJob(job.id, {
      status,
      fill_method: "prefill_url",
      screenshot: formUrl,
      filled_data: filledData,
      error: reqLoginNote,
    });

    if (isCall) {
      const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/forms?jobId=${job.id}`;
      try {
        await sendTelegramAlertToUser(
          `📞 PlaceMint AI Form Alert: Form for ${formUrl} is ready for review in your app dashboard: ${reviewUrl}`
        );
      } catch (tgErr) {
        console.warn("[executor] Telegram alert failed (non-fatal):", tgErr);
      }
    }
    return;
  }

  // Mark job as running and call Playwright service
  await safeUpdateFormJob(job.id, {
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

