import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <WifiOff className="h-12 w-12 text-muted-foreground mb-4" />
      <h1 className="text-xl font-semibold">You are offline</h1>
      <p className="text-muted-foreground mt-2 max-w-sm">
        PlaceMint saved your last visit. Reconnect to sync reminders, calendar, and Telegram.
      </p>
      <Button asChild className="mt-6" variant="glow">
        <Link href="/dashboard">Open dashboard</Link>
      </Button>
    </main>
  );
}
