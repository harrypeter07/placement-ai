import { redirect } from "next/navigation";

export default function RemindersRedirectPage() {
  redirect("/dashboard/deadlines?tab=reminders");
}
