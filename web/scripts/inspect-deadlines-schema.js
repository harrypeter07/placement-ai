const { Client } = require('pg');

const connectionString = "postgresql://postgres.oybdgtsrlkqiishkpncf:NbBFU2T3%2F%2F%5EsdQc@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log("Connected.");

    const r = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'deadlines' 
      ORDER BY ordinal_position
    `);
    
    console.log("\n=== deadlines columns ===");
    r.rows.forEach(row => console.log(`- ${row.column_name}: ${row.data_type}`));

  } catch (err) {
    console.error("Failed:", err);
  } finally {
    await client.end();
  }
}

run();
