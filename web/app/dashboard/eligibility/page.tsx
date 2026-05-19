"use client";

import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function EligibilityPage() {
  const [profile, setProfile] = useState({ branch: "CSE", cgpa: 8.5, backlogs: 0, graduationYear: 2025 });
  const [eligible, setEligible] = useState<{ _id?: string; company: string; role: string }[]>([]);
  const [ineligible, setIneligible] = useState<{ deadline: { company: string }; reasons: string[] }[]>([]);
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    const res = await fetch("/api/eligibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setEligible(data.eligible);
      setIneligible(data.ineligible);
      toast.success(`Found ${data.eligible.length} eligible companies`);
    } else toast.error(data.error);
  }

  const fields = [
    { key: "branch" as const, label: "Branch", type: "text" },
    { key: "cgpa" as const, label: "CGPA", type: "number" },
    { key: "backlogs" as const, label: "Backlogs", type: "number" },
    { key: "graduationYear" as const, label: "Graduation Year", type: "number" },
  ];

  return (
    <>
      <DashboardHeader title="Eligibility Checker" />
      <main className="p-4 lg:p-8 space-y-6">
        <Card className="glass">
          <CardHeader><CardTitle>Your Profile</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            {fields.map((f) => (
              <fieldset key={f.key} className="space-y-2 border-0 p-0">
                <Label>{f.label}</Label>
                <Input
                  type={f.type}
                  step={f.key === "cgpa" ? "0.1" : undefined}
                  value={profile[f.key]}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      [f.key]: f.type === "number" ? +e.target.value : e.target.value,
                    })
                  }
                />
              </fieldset>
            ))}
            <Button variant="glow" onClick={check} disabled={loading} className="sm:col-span-2">
              {loading ? "Checking..." : "Check Eligibility"}
            </Button>
          </CardContent>
        </Card>

        <Tabs defaultValue="eligible">
          <TabsList>
            <TabsTrigger value="eligible">Eligible ({eligible.length})</TabsTrigger>
            <TabsTrigger value="ineligible">Ineligible ({ineligible.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="eligible" className="space-y-3 mt-4">
            {eligible.length === 0 ? (
              <p className="text-muted-foreground text-sm">Run eligibility check to see results.</p>
            ) : (
              eligible.map((d) => (
                <Card key={d._id || d.company} className="glass">
                  <CardContent className="p-4 flex justify-between">
                    <span><strong>{d.company}</strong> — {d.role}</span>
                    <Badge variant="success">Eligible</Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
          <TabsContent value="ineligible" className="space-y-3 mt-4">
            {ineligible.map((item, i) => (
              <Card key={i} className="glass">
                <CardContent className="p-4">
                  <strong>{item.deadline.company}</strong>
                  <p className="text-sm text-red-400 mt-1">{item.reasons.join(", ")}</p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
