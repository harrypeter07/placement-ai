const { Client } = require('pg');

const connectionString = "postgresql://postgres.oybdgtsrlkqiishkpncf:NbBFU2T3%2F%2F%5EsdQc@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";
const client = new Client({ connectionString });

async function run() {
  try {
    await client.connect();
    
    // Check telegram_worker_sessions columns
    const r1 = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'telegram_worker_sessions'
      ORDER BY ordinal_position
    `);
    console.log("\n=== telegram_worker_sessions columns ===");
    if (r1.rows.length === 0) console.log("TABLE DOES NOT EXIST");
    else r1.rows.forEach(r => console.log(`- ${r.column_name}: ${r.data_type}`));

    // Check users table for telegram columns  
    const r2 = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name LIKE '%telegram%'
      ORDER BY ordinal_position
    `);
    console.log("\n=== users table (telegram columns) ===");
    if (r2.rows.length === 0) console.log("No telegram columns found");
    else r2.rows.forEach(r => console.log(`- ${r.column_name}: ${r.data_type}`));

    // Check settings table
    const r3 = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_settings'
      ORDER BY ordinal_position
    `);
    console.log("\n=== user_settings columns ===");
    if (r3.rows.length === 0) console.log("TABLE DOES NOT EXIST");
    else r3.rows.forEach(r => console.log(`- ${r.column_name}: ${r.data_type}`));
    
    // Check all tables
    const r4 = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name
    `);
    console.log("\n=== All public tables ===");
    r4.rows.forEach(r => console.log(`- ${r.table_name}`));

  } catch (err) {
    console.error("Failed:", err.message);
  } finally {
    await client.end();
  }
}

run();
