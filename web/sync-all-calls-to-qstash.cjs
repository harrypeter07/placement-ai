const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf-8");
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qstashToken = process.env.QSTASH_TOKEN;
const qstashUrl = process.env.QSTASH_URL || "https://qstash-eu-central-1.upstash.io";
const targetUrl = "https://plarm.vercel.app/api/reminders/process-due";

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncAllExistingCallsToQStash() {
  console.log("Fetching all active, unsent reminders from Supabase...");

  const { data: reminders, error } = await supabase
    .from("reminders")
    .select("id, title, scheduled_at, status, enabled, sent")
    .eq("enabled", true)
    .eq("sent", false)
    .in("status", ["active", "snoozed"]);

  if (error) {
    console.error("Supabase query error:", error);
    return;
  }

  console.log(`Found ${reminders ? reminders.length : 0} active, unsent reminders in database.`);

  let syncedCount = 0;
  for (const r of reminders || []) {
    const targetEpoch = Math.floor(new Date(r.scheduled_at).getTime() / 1000);
    const workerSecret = process.env.TELEGRAM_WORKER_SECRET || "placemint_secure_worker_2026";

    console.log(`Syncing reminder "${r.title}" (ID: ${r.id}) scheduled for ${r.scheduled_at} (epoch: ${targetEpoch})...`);

    try {
      const res = await fetch(`${qstashUrl}/v2/publish/${targetUrl}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${qstashToken}`,
          "Content-Type": "application/json",
          "Upstash-Not-Before": String(targetEpoch),
          "Upstash-Retries": "3",
          "x-worker-secret": workerSecret,
        },
        body: JSON.stringify({ reminderId: r.id }),
      });

      const qdata = await res.json();
      if (res.ok) {
        syncedCount++;
        console.log(`  └─ ✅ Queued in QStash (messageId: ${qdata.messageId})`);
      } else {
        console.error(`  └─ ❌ QStash error:`, qdata);
      }
    } catch (err) {
      console.error(`  └─ ❌ Network error for reminder ${r.id}:`, err);
    }
  }

  console.log(`\n🎉 BULK SYNC COMPLETE! Successfully queued ${syncedCount} / ${reminders ? reminders.length : 0} active reminders in Upstash QStash!`);
}

syncAllExistingCallsToQStash();
