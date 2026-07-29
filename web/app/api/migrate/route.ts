import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

// TEMPORARY migration route — delete after running once!
export async function GET() {
  const results: string[] = [];

  try {
    // Add filled_data column
    const { error: e1 } = await supabase.rpc("exec_migration", {
      sql: "ALTER TABLE form_jobs ADD COLUMN IF NOT EXISTS filled_data JSONB DEFAULT '{}'",
    });
    if (e1) {
      // Try direct insert approach as fallback to detect column existence
      const { error: testError } = await supabase
        .from("form_jobs")
        .select("filled_data")
        .limit(1);
      if (testError?.message?.includes("filled_data")) {
        results.push("❌ filled_data column still missing: " + testError.message);
      } else {
        results.push("✅ filled_data column already exists or added");
      }
    } else {
      results.push("✅ filled_data column added via rpc");
    }
  } catch (e: unknown) {
    results.push("rpc not available: " + (e instanceof Error ? e.message : String(e)));
  }

  // Check what columns exist right now
  const { data: cols, error: colErr } = await supabase
    .from("form_jobs")
    .select("id, status, fill_method, screenshot, error")
    .limit(1);

  const { error: filledDataErr } = await supabase
    .from("form_jobs")
    .select("filled_data")
    .limit(1);

  const { error: triggerErr } = await supabase
    .from("form_jobs")
    .select("trigger_source")
    .limit(1);

  return NextResponse.json({
    results,
    columns_check: {
      base_columns_ok: !colErr,
      filled_data_exists: !filledDataErr,
      trigger_source_exists: !triggerErr,
      filled_data_error: filledDataErr?.message,
      trigger_source_error: triggerErr?.message,
    },
    action_needed: filledDataErr || triggerErr
      ? "Run this SQL in Supabase SQL Editor:\nALTER TABLE form_jobs ADD COLUMN IF NOT EXISTS filled_data JSONB DEFAULT \'{}\';\nALTER TABLE form_jobs ADD COLUMN IF NOT EXISTS trigger_source TEXT DEFAULT \'dashboard\';"
      : "No action needed — all columns exist!",
  });
}
