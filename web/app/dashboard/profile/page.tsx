"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, CheckCircle2, User, FileText, Upload, Save, ShieldCheck } from "lucide-react";

export default function StudentProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parsingResume, setParsingResume] = useState(false);
  const [resumeText, setResumeText] = useState("");

  const [profile, setProfile] = useState({
    fullName: "",
    email: "",
    phone: "",
    cgpa: "",
    branch: "",
    graduationYear: "",
    resumeLink: "",
    githubLink: "",
    linkedInLink: "",
    rollNumber: "",
    additionalInfo: "",
  });

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.formProfile) {
          setProfile((prev) => ({ ...prev, ...data.formProfile }));
        }
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formProfile: profile }),
      });

      if (res.ok) {
        toast.success("Student profile updated successfully!");
      } else {
        toast.error("Failed to save profile.");
      }
    } catch {
      toast.error("An error occurred while saving.");
    } finally {
      setSaving(false);
    }
  };

  const handleParseResume = async () => {
    if (!resumeText.trim()) {
      toast.error("Please paste your resume text to extract information!");
      return;
    }

    setParsingResume(true);
    const toastId = toast.loading("AI parsing resume content...");

    try {
      const res = await fetch("/api/resume/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeContent: resumeText }),
      });

      const data = await res.json();
      if (res.ok && data.extracted) {
        setProfile((prev) => ({
          ...prev,
          fullName: data.extracted.name || prev.fullName,
          email: data.extracted.email || prev.email,
          phone: data.extracted.phone || prev.phone,
          branch: data.extracted.branch || prev.branch,
          cgpa: data.extracted.cgpa || prev.cgpa,
          graduationYear: data.extracted.graduationYear || prev.graduationYear,
          resumeLink: data.extracted.resumeLink || prev.resumeLink,
          githubLink: data.extracted.github || prev.githubLink,
          linkedInLink: data.extracted.linkedin || prev.linkedInLink,
          additionalInfo: data.extracted.skills?.join(", ") || prev.additionalInfo,
        }));
        toast.success("Resume parsed & profile fields auto-populated!", { id: toastId });
      } else {
        toast.error(data.error || "Could not parse resume text", { id: toastId });
      }
    } catch {
      toast.error("Error connecting to AI parser", { id: toastId });
    } finally {
      setParsingResume(false);
    }
  };

  const isComplete = Boolean(profile.fullName && profile.email && profile.phone);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
            <User className="h-8 w-8 text-primary" />
            Student Profile &amp; Resume Collector
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Store your verified details for Google Form automation and placement applications.
          </p>
        </div>
        <Badge
          className={`px-3 py-1 text-xs gap-1.5 ${
            isComplete
              ? "bg-green-500/20 text-green-400 border-green-500/30"
              : "bg-amber-500/20 text-amber-400 border-amber-500/30"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isComplete ? "Profile 100% Ready for Form Auto-Fill" : "Incomplete Profile"}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: AI Resume Parser */}
        <Card className="glass md:col-span-1 border-white/10">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-purple-300">
              <Sparkles className="h-5 w-5 text-purple-400" />
              AI Resume Parser
            </CardTitle>
            <CardDescription className="text-xs">
              Paste your raw resume text below. AI will extract your fields automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Paste raw resume text here (Name, Email, Phone, College, CGPA, Experience, Skills)..."
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              className="min-h-[220px] bg-white/5 border-white/10 text-xs font-mono focus:border-primary"
            />
            <Button
              onClick={handleParseResume}
              disabled={parsingResume}
              variant="glow"
              className="w-full text-xs bg-purple-600 hover:bg-purple-700 text-white"
            >
              {parsingResume ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Extracting Fields...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Auto-Fill Profile from Resume
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Right Column: Editable Profile Fields */}
        <Card className="glass md:col-span-2 border-white/10">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Verified Form Application Profile
              </CardTitle>
              <CardDescription className="text-xs">
                These fields are fuzzy-matched to answer Google Forms &amp; job portals.
              </CardDescription>
            </div>
            <Button onClick={handleSave} disabled={saving} variant="glow" size="sm" className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Profile
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-xs font-medium text-muted-foreground">Full Name *</Label>
                <Input
                  id="fullName"
                  placeholder="e.g. Hassan Mansuri"
                  value={profile.fullName}
                  onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                  className="bg-white/5 border-white/10 focus:border-primary text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="e.g. hassan@college.edu"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="bg-white/5 border-white/10 focus:border-primary text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-medium text-muted-foreground">Phone Number *</Label>
                <Input
                  id="phone"
                  placeholder="e.g. +919322909257"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="bg-white/5 border-white/10 focus:border-primary text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rollNumber" className="text-xs font-medium text-muted-foreground">Roll / ID Number</Label>
                <Input
                  id="rollNumber"
                  placeholder="e.g. 21CS8042"
                  value={profile.rollNumber}
                  onChange={(e) => setProfile({ ...profile, rollNumber: e.target.value })}
                  className="bg-white/5 border-white/10 focus:border-primary text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="branch" className="text-xs font-medium text-muted-foreground">Branch / Major</Label>
                <Input
                  id="branch"
                  placeholder="e.g. Computer Science & Engineering"
                  value={profile.branch}
                  onChange={(e) => setProfile({ ...profile, branch: e.target.value })}
                  className="bg-white/5 border-white/10 focus:border-primary text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cgpa" className="text-xs font-medium text-muted-foreground">CGPA / Percentage</Label>
                <Input
                  id="cgpa"
                  placeholder="e.g. 8.75"
                  value={profile.cgpa}
                  onChange={(e) => setProfile({ ...profile, cgpa: e.target.value })}
                  className="bg-white/5 border-white/10 focus:border-primary text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="graduationYear" className="text-xs font-medium text-muted-foreground">Graduation Year</Label>
                <Input
                  id="graduationYear"
                  placeholder="e.g. 2026"
                  value={profile.graduationYear}
                  onChange={(e) => setProfile({ ...profile, graduationYear: e.target.value })}
                  className="bg-white/5 border-white/10 focus:border-primary text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="resumeLink" className="text-xs font-medium text-muted-foreground">Resume Public URL (Google Drive/Dropbox)</Label>
                <Input
                  id="resumeLink"
                  placeholder="https://drive.google.com/file/d/..."
                  value={profile.resumeLink}
                  onChange={(e) => setProfile({ ...profile, resumeLink: e.target.value })}
                  className="bg-white/5 border-white/10 focus:border-primary text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="linkedInLink" className="text-xs font-medium text-muted-foreground">LinkedIn Profile URL</Label>
                <Input
                  id="linkedInLink"
                  placeholder="https://linkedin.com/in/username"
                  value={profile.linkedInLink}
                  onChange={(e) => setProfile({ ...profile, linkedInLink: e.target.value })}
                  className="bg-white/5 border-white/10 focus:border-primary text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="githubLink" className="text-xs font-medium text-muted-foreground">GitHub Profile URL</Label>
                <Input
                  id="githubLink"
                  placeholder="https://github.com/username"
                  value={profile.githubLink}
                  onChange={(e) => setProfile({ ...profile, githubLink: e.target.value })}
                  className="bg-white/5 border-white/10 focus:border-primary text-sm font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <Label htmlFor="additionalInfo" className="text-xs font-medium text-muted-foreground">Skills &amp; Additional Information</Label>
              <Textarea
                id="additionalInfo"
                placeholder="Python, React, Data Structures, Machine Learning, Web Development..."
                value={profile.additionalInfo}
                onChange={(e) => setProfile({ ...profile, additionalInfo: e.target.value })}
                className="bg-white/5 border-white/10 focus:border-primary text-xs"
              />
            </div>

            <div className="pt-4 flex justify-end">
              <Button onClick={handleSave} disabled={saving} variant="glow" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Save &amp; Confirm Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
