const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://oybdgtsrlkqiishkpncf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95YmRndHNybGtxaWlzaGtwbmNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzgwMDU3MiwiZXhwIjoyMDk5Mzc2NTcyfQ.ijDqKytcRhkmm8QgwfAfmyjBq6SL0L54ivc4wO7zEq8";

const supabase = createClient(supabaseUrl, supabaseKey);

const userId = "613aaafd-2af6-4177-aef6-305196afcede";

async function run() {
  console.log("Deleting bad deadlines for user...");
  // Delete mock deadlines with bad/empty/wrong names
  const { data: dls, error } = await supabase
    .from("deadlines")
    .delete()
    .eq("user_id", userId)
    .or("company.eq.and,company.eq.and previous recruitment patterns,company.eq.Placement update")
    .select("id");

  if (error) {
    console.error("Delete error:", error);
    return;
  }

  if (dls && dls.length > 0) {
    const ids = dls.map(d => d.id);
    console.log("Deleted deadline IDs:", ids);
    // Delete reminders for these deadlines
    await supabase
      .from("reminders")
      .delete()
      .eq("user_id", userId)
      .in("deadline_id", ids);
  }

  console.log("Cleanup complete!");
}
run();
