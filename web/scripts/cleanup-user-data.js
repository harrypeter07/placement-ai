const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://oybdgtsrlkqiishkpncf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95YmRndHNybGtxaWlzaGtwbmNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzgwMDU3MiwiZXhwIjoyMDk5Mzc2NTcyfQ.ijDqKytcRhkmm8QgwfAfmyjBq6SL0L54ivc4wO7zEq8";

const supabase = createClient(supabaseUrl, supabaseKey);

const userId = "613aaafd-2af6-4177-aef6-305196afcede";

async function run() {
  console.log("Deleting all reminders for user...");
  const { error: remErr } = await supabase
    .from("reminders")
    .delete()
    .eq("user_id", userId);
  if (remErr) console.error("Reminders delete error:", remErr);

  console.log("Deleting all deadlines for user...");
  const { error: dlErr } = await supabase
    .from("deadlines")
    .delete()
    .eq("user_id", userId);
  if (dlErr) console.error("Deadlines delete error:", dlErr);

  console.log("Cleanup complete!");
}
run();
