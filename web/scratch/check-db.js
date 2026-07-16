const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://oybdgtsrlkqiishkpncf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95YmRndHNybGtxaWlzaGtwbmNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzgwMDU3MiwiZXhwIjoyMDk5Mzc2NTcyfQ.ijDqKytcRhkmm8QgwfAfmyjBq6SL0L54ivc4wO7zEq8";

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: dls } = await supabase
    .from("deadlines")
    .select("company, role, deadline_date, notes")
    .eq("user_id", "613aaafd-2af6-4177-aef6-305196afcede");

  console.log("Current Deadlines in DB:", JSON.stringify(dls, null, 2));
}
main();
