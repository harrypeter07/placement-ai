const { Client } = require('pg');
const connectionString = "postgresql://postgres.oybdgtsrlkqiishkpncf:NbBFU2T3%2F%2F%5EsdQc@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";
const client = new Client({ connectionString });

async function run() {
  await client.connect();
  const tables = ['reminders', 'notification_logs', 'deadlines'];
  for (const t of tables) {
    const r = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [t]);
    console.log(`\n=== ${t} ===`);
    r.rows.forEach(row => console.log(`- ${row.column_name}: ${row.data_type}`));
  }
  await client.end();
}
run().catch(console.error);
