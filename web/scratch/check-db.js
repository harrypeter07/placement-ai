const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://oybdgtsrlkqiishkpncf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95YmRndHNybGtxaWlzaGtwbmNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzgwMDU3MiwiZXhwIjoyMDk5Mzc2NTcyfQ.ijDqKytcRhkmm8QgwfAfmyjBq6SL0L54ivc4wO7zEq8";

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: insights } = await supabase
    .from("placement_insights")
    .select("company:extracted_deadline->company, deadline:extracted_deadline->deadline, status, title");

  console.log("Current Insights in DB:", JSON.stringify(insights, null, 2));
}
main();
