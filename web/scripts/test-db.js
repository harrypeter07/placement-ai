const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '../.env');
console.log("Loading .env from:", envPath);
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[key] = value.trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing env vars!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  try {
    const userId = '613aaafd-2af6-4177-aef6-305196afcede';
    console.log("Attempting test upsert for user:", userId);
    
    const payload = {
      user_id: userId,
      phone: '+919876543210',
      phone_code_hash: 'test_hash',
      auth_session_string: 'test_session',
      expires_at: new Date().toISOString(),
      last_sent_at: new Date().toISOString(),
      send_count: 1,
      step: 'code',
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('telegram_auth_pendings')
      .upsert([payload], { onConflict: 'user_id' })
      .select();

    if (error) {
      console.error("Upsert failed:", error);
    } else {
      console.log("Upsert succeeded! Row:", data);
      
      // Clean up
      const { error: delErr } = await supabase
        .from('telegram_auth_pendings')
        .delete()
        .eq('user_id', userId);
      console.log("Cleanup status:", delErr ? "failed" : "succeeded");
    }
  } catch (err) {
    console.error("Exception caught:", err);
  }
}

run();
