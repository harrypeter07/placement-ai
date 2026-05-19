"use client";

import { useEffect, useState } from "react";
import { Upload, FileText } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface ResumeResult {
  _id: string;
  fileName: string;
  atsScore: number;
  skills: string[];
  missingSkills: string[];
  suggestions: string[];
  companyCompatibility: { company: string; match: number }[];
}

export default function ResumePage() {
  const [resumes, setResumes] = useState<ResumeResult[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/resume").then((r) => r.json()).then(setResumes);
  }, []);

  async function analyze(file?: File) {
    setLoading(true);
    const form = new FormData();
    if (file) form.append("file", file);
    else form.append("text", text);
    const res = await fetch("/api/resume", { method: "POST", body: form });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setResumes([data, ...resumes]);
      toast.success("Resume analyzed!");
    } else toast.error(data.error);
  }

  const latest = resumes[0];

  return (
    <>
      <DashboardHeader title="Resume Analyzer" />
      <main className="p-4 lg:p-8 space-y-6">
        <Card className="glass">
          <CardHeader><CardTitle>Upload Resume</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Drop PDF/TXT or click to upload</span>
              <input type="file" className="hidden" accept=".pdf,.txt,.doc,.docx" onChange={(e) => e.target.files?.[0] && analyze(e.target.files[0])} />
            </label>
            <p className="text-center text-sm text-muted-foreground">or paste resume text</p>
            <Textarea placeholder="Paste resume content..." value={text} onChange={(e) => setText(e.target.value)} rows={6} />
            <Button variant="glow" className="w-full" disabled={loading || !text} onClick={() => analyze()}>
              {loading ? "Analyzing..." : "Analyze with AI"}
            </Button>
          </CardContent>
        </Card>

        {latest && (
          <>
            <Card className="glass glow-border">
              <CardHeader><CardTitle>ATS Score</CardTitle></CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-gradient mb-2">{latest.atsScore}%</p>
                <Progress value={latest.atsScore} />
              </CardContent>
            </Card>
            <section className="grid gap-4 md:grid-cols-2">
              <Card className="glass">
                <CardHeader><CardTitle>Skills Found</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {latest.skills.map((s) => <Badge key={s} variant="success">{s}</Badge>)}
                </CardContent>
              </Card>
              <Card className="glass">
                <CardHeader><CardTitle>Missing Skills</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {latest.missingSkills.map((s) => <Badge key={s} variant="warning">{s}</Badge>)}
                </CardContent>
              </Card>
            </section>
            <Card className="glass">
              <CardHeader><CardTitle>AI Suggestions</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">{latest.suggestions.map((s, i) => <li key={i} className="text-sm flex gap-2"><FileText className="h-4 w-4 text-primary shrink-0" />{s}</li>)}</ul>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardHeader><CardTitle>Company Compatibility</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {latest.companyCompatibility.map((c) => (
                  <p key={c.company} className="flex items-center gap-4">
                    <span className="w-24 text-sm font-medium">{c.company}</span>
                    <Progress value={c.match} className="flex-1" />
                    <span className="text-sm text-muted-foreground">{c.match}%</span>
                  </p>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </>
  );
}
