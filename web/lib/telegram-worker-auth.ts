import { supabase } from "@/lib/supabase";

export function checkWorkerSecret(apiKey: string | undefined) {
  return !!process.env.TELEGRAM_WORKER_SECRET && apiKey === process.env.TELEGRAM_WORKER_SECRET;
}

export async function getUnionMonitoredGroupIds(): Promise<string[]> {
  // Query all monitored telegram group IDs from Supabase
  const { data: prefsList, error } = await supabase
    .from("student_preferences")
    .select("telegram_config");

  if (error) {
    console.error("[getUnionMonitoredGroupIds] Supabase error:", error);
    return [];
  }

  const ids = new Set<string>();
  for (const p of (prefsList || [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tgConfig = (p.telegram_config as Record<string, any>) || {};
    for (const gid of tgConfig.monitoredGroupIds || []) {
      if (gid) ids.add(String(gid));
    }
  }
  return [...ids];
}
