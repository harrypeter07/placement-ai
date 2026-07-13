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

console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Service Key Length:", supabaseServiceKey ? supabaseServiceKey.length : 0);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing env vars!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  try {
    console.log("\n--- Testing users table ---");
    const { data: users, error: usersErr } = await supabase.from('users').select('*').limit(5);
    if (usersErr) console.error("users error:", usersErr);
    else console.log("users table works! Row count:", users.length, "Rows:", users);

    console.log("\n--- Testing telegram_auth_pendings table ---");
    const { data: pendings, error: pendingsErr } = await supabase.from('telegram_auth_pendings').select('*').limit(5);
    if (pendingsErr) console.error("telegram_auth_pendings error:", pendingsErr);
    else console.log("telegram_auth_pendings table works! Row count:", pendings.length, "Rows:", pendings);

    console.log("\n--- Testing notifications table ---");
    const { data: notifications, error: notificationsErr } = await supabase.from('notifications').select('*').limit(5);
    if (notificationsErr) console.error("notifications error:", notificationsErr);
    else console.log("notifications table works! Row count:", notifications.length, "Rows:", notifications);
  } catch (err) {
    console.error("Exception caught:", err);
  }
}

run();
