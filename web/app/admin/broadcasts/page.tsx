"use client";

import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function AdminBroadcastsPage() {
  const [form, setForm] = useState({ title: "", message: "", company: "", deadline: "" });
  const [loading, setLoading] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (res.ok) {
      toast.success("Broadcast sent to all students!");
      setForm({ title: "", message: "", company: "", deadline: "" });
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to send");
    }
  }

  return (
    <>
      <DashboardHeader title="Broadcasts" />
      <main className="p-4 lg:p-8 max-w-xl">
        <Card className="glass">
          <CardHeader><CardTitle>Send Placement Drive</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={send} className="space-y-4">
              <fieldset className="space-y-2 border-0 p-0"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></fieldset>
              <fieldset className="space-y-2 border-0 p-0"><Label>Message</Label><Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required /></fieldset>
              <fieldset className="space-y-2 border-0 p-0"><Label>Company (optional)</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></fieldset>
              <fieldset className="space-y-2 border-0 p-0"><Label>Deadline (optional)</Label><Input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></fieldset>
              <Button type="submit" variant="glow" className="w-full" disabled={loading}>{loading ? "Sending..." : "Broadcast"}</Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
