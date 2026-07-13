const { Client } = require('pg');
const connectionString = "postgresql://postgres.oybdgtsrlkqiishkpncf:NbBFU2T3%2F%2F%5EsdQc@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";
const client = new Client({ connectionString });

async function run() {
  await client.connect();
  console.log("Connected.\n");

  const steps = [
    { name: "call_time", sql: `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS call_time TEXT;` },
    { name: "call_status", sql: `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS call_status TEXT DEFAULT 'pending';` },
    { name: "call_response", sql: `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS call_response TEXT;` },
    { name: "call_sid", sql: `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS call_sid TEXT;` },
    { name: "form_fill_status", sql: `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS form_fill_status TEXT;` },
    { name: "called_at", sql: `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS called_at TIMESTAMP WITH TIME ZONE;` },
    // offset is a reserved word — quote it
    { name: "offset (quoted)", sql: `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS "offset" TEXT;` },
  ];

  for (const step of steps) {
    try {
      await client.query(step.sql);
      console.log(`✓ ${step.name}`);
    } catch (e) {
      console.error(`✗ ${step.name}: ${e.message}`);
    }
  }

  const r = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'reminders' ORDER BY ordinal_position
  `);
  console.log("\n=== reminders columns ===");
  r.rows.forEach(row => console.log(`  - ${row.column_name}`));

  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
