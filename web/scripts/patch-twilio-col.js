const { Client } = require('pg');

// Add twilio_voice_settings column to student_preferences if missing
const connectionString = "postgresql://postgres.oybdgtsrlkqiishkpncf:NbBFU2T3%2F%2F%5EsdQc@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";
const client = new Client({ connectionString });

async function run() {
  try {
    await client.connect();
    
    await client.query(`
      ALTER TABLE student_preferences 
      ADD COLUMN IF NOT EXISTS twilio_voice_settings JSONB DEFAULT '{"menuEnabled":false,"fillViaCallEnabled":false,"defaultSnoozeMinutes":15,"voice":"man","language":"en-IN"}'::jsonb;
    `);
    console.log("Added twilio_voice_settings column");

    // Also update the schema.sql for documentation
    console.log("Done");
  } catch (err) {
    console.error("Failed:", err.message);
  } finally {
    await client.end();
  }
}
run();
