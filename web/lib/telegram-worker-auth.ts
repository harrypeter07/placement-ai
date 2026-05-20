export function checkWorkerSecret(apiKey: string | undefined) {
  return !!process.env.TELEGRAM_WORKER_SECRET && apiKey === process.env.TELEGRAM_WORKER_SECRET;
}

export async function getUnionMonitoredGroupIds(): Promise<string[]> {
  const { connectDB } = await import("@/lib/mongodb");
  const { StudentPreferences } = await import("@/models/StudentPreferences");
  await connectDB();
  const prefsList = await StudentPreferences.find({}, { "telegram.monitoredGroupIds": 1 }).lean();
  const ids = new Set<string>();
  for (const p of prefsList) {
    for (const gid of p.telegram?.monitoredGroupIds || []) {
      if (gid) ids.add(String(gid));
    }
  }
  return [...ids];
}
