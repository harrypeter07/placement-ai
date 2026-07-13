const { Client } = require('pg');

const connectionString = "postgresql://postgres.oybdgtsrlkqiishkpncf:NbBFU2T3%2F%2F%5EsdQc@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";
const client = new Client({ connectionString });

const migrations = [
  {
    name: "Add missing columns to telegram_worker_sessions",
    sql: `
      ALTER TABLE telegram_worker_sessions 
      ADD COLUMN IF NOT EXISTS phone_number TEXT,
      ADD COLUMN IF NOT EXISTS telegram_username TEXT,
      ADD COLUMN IF NOT EXISTS display_name TEXT,
      ADD COLUMN IF NOT EXISTS connected_at TIMESTAMP WITH TIME ZONE;
    `
  },
  {
    name: "Create user_settings / student_preferences table if missing",
    sql: `
      CREATE TABLE IF NOT EXISTS student_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        timezone TEXT DEFAULT 'Asia/Kolkata',
        language TEXT DEFAULT 'en',
        reminders_config JSONB DEFAULT '{"defaultOffsetsMinutes":[1440,360,60,15],"sound":true,"vibration":true,"defaultEscalation":"normal","smartAiMode":true}'::jsonb,
        notifications_config JSONB DEFAULT '{"browser":true,"email":false,"telegram":false,"inApp":true,"push":true,"phoneCall":false,"quietHoursEnabled":false,"quietHoursStart":"22:00","quietHoursEnd":"07:00"}'::jsonb,
        calendar_config JSONB DEFAULT '{"autoSync":true,"autoCreateEvents":true,"autoUpdateEvents":true}'::jsonb,
        ai_config JSONB DEFAULT '{"strictness":"balanced","urgencySensitivity":"medium","spamSensitivity":"medium"}'::jsonb,
        placement_config JSONB DEFAULT '{"preferredCompanies":[],"preferredRoles":[],"dreamCompanies":[],"minPackageLakh":null}'::jsonb,
        automation_config JSONB DEFAULT '{"masterEnabled":true,"aiAutoReminders":true,"autoCalendarSync":true,"autoPriority":true,"duplicateMerge":true}'::jsonb,
        telegram_config JSONB DEFAULT '{"insightMessageCount":25,"monitoredGroupIds":[],"autoInsights":true,"autoCreateDeadlines":true,"autoCreateReminders":true}'::jsonb,
        form_profile JSONB DEFAULT '{}'::jsonb,
        gemini_api_key TEXT DEFAULT '',
        twilio_account_sid TEXT DEFAULT '',
        twilio_auth_token TEXT DEFAULT '',
        twilio_from_phone TEXT DEFAULT '',
        twilio_to_phone TEXT DEFAULT '',
        twilio_voice_settings JSONB DEFAULT '{"menuEnabled":false,"fillViaCallEnabled":false,"defaultSnoozeMinutes":15,"voice":"man","language":"en-IN"}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `
  },
  {
    name: "Ensure telegram_auth_pendings has all required columns",
    sql: `
      ALTER TABLE telegram_auth_pendings 
      ADD COLUMN IF NOT EXISTS auth_session_string TEXT,
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS send_count INT DEFAULT 1;
    `
  }
];

async function run() {
  try {
    console.log("Connecting to PostgreSQL...");
    await client.connect();
    console.log("Connected!\n");

    for (const migration of migrations) {
      console.log(`Running: ${migration.name}`);
      try {
        await client.query(migration.sql);
        console.log(`  ✓ Done\n`);
      } catch (err) {
        console.error(`  ✗ Failed: ${err.message}\n`);
      }
    }

    // Verify results
    console.log("\n=== Verifying telegram_worker_sessions ===");
    const r = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'telegram_worker_sessions' ORDER BY ordinal_position
    `);
    r.rows.forEach(row => console.log(`- ${row.column_name}`));
    
    console.log("\n=== Verifying student_preferences ===");
    const r2 = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'student_preferences' ORDER BY ordinal_position
    `);
    r2.rows.forEach(row => console.log(`- ${row.column_name}`));

    console.log("\nAll migrations complete!");
  } catch (err) {
    console.error("Fatal error:", err.message);
  } finally {
    await client.end();
  }
}

run();
