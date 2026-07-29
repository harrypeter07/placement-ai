"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ExternalLink, Settings, ClipboardList, Eye, AlertCircle, Sparkles, Copy } from "lucide-react";
import Link from "next/link";

const formSchema = z.object({
  formUrl: z.string().url("Please enter a valid Google Form URL"),
  autoSubmit: z.boolean().default(false),
});

type FormInput = z.infer<typeof formSchema>;

interface FormJobItem {
  _id: string;
  formUrl: string;
  status: "pending" | "running" | "completed" | "failed" | "filled_pending_review";
  profileData: Record<string, unknown>;
  autoSubmit: boolean;
  fillMethod?: "prefill_url" | "playwright";
  screenshot?: string;
  error?: string;
  createdAt: string;
  triggerSource?: "call" | "dashboard" | "scheduled";
  filledData?: Record<string, { label: string; value: string; entryId?: string }>;
}

export default function FormAutomatorPage() {
  const [jobs, setJobs] = useState<FormJobItem[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [reviewingJob, setReviewingJob] = useState<FormJobItem | null>(null);
  const [submittingConfirm, setSubmittingConfirm] = useState(false);

  const confirmSubmit = async (jobId: string) => {
    setSubmittingConfirm(true);
    const toastId = toast.loading("Submitting finalized application...");
    try {
      const res = await fetch(`/api/forms/${jobId}/confirm-submit`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Application submitted successfully!", { id: toastId });
        setReviewingJob(null);
        fetchJobs();
      } else {
        const errStr = typeof data.error === "string" ? data.error : typeof data.message === "string" ? data.message : JSON.stringify(data);
        toast.error(errStr || "Submission failed", { id: toastId });
      }
    } catch {
      toast.error("Network error while submitting", { id: toastId });
    } finally {
      setSubmittingConfirm(false);
    }
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { autoSubmit: false },
  });

  const fetchJobs = async () => {
    try {
      const res = await fetch("/api/forms");
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (err) {
      console.error("Failed to load jobs", err);
    } finally {
      setLoadingJobs(false);
    }
  };

  const checkProfile = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (!data.formProfile || !data.formProfile.fullName) {
          setProfileMissing(true);
        } else {
          setProfileMissing(false);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    checkProfile();
    fetchJobs();
    const interval = setInterval(fetchJobs, 8000); // Polling every 8 seconds for updates
    return () => clearInterval(interval);
  }, []);

  const onSubmit = async (data: FormInput) => {
    if (profileMissing) {
      toast.error("Please complete your Form Automator Profile in Settings first!");
      return;
    }

    setSubmitLoading(true);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const resBody = await res.json().catch(() => null);
      console.log("[Forms Page] API response status:", res.status, "body:", resBody);

      if (res.ok) {
        toast.success("Form automation job started! Opening preview...");
        reset();
        if (resBody) {
          setReviewingJob(resBody);
        }
        fetchJobs();
      } else {
        // Extract error string robustly
        let errMsg = "Failed to trigger form auto-fill.";
        if (resBody) {
          if (typeof resBody.error === "string") {
            errMsg = resBody.error;
          } else if (typeof resBody.message === "string") {
            errMsg = resBody.message;
          } else if (resBody.error && typeof resBody.error === "object") {
            errMsg = JSON.stringify(resBody.error);
          } else {
            errMsg = JSON.stringify(resBody);
          }
        }
        console.error("[Forms Page] Error from API:", errMsg, "Full body:", resBody);
        toast.error(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred while submitting.";
      console.error("[Forms Page] Network/parse error:", err);
      toast.error(msg);
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
          Form Automator
        </h1>
        <Link href="/dashboard/settings?tab=telegram">
          <Button variant="outline" size="sm" className="gap-2 border-white/10 bg-white/5 hover:bg-white/10">
            <Settings className="h-4 w-4 text-purple-400" />
            Configure Profile
          </Button>
        </Link>
      </div>

      <main className="mt-8 space-y-6">
        {profileMissing && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 text-yellow-200">
            <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Automator Profile is Incomplete</p>
              <p className="text-xs text-yellow-300/80">
                You need to set up your full name, email, CGPA, and resume link in settings before we can auto-fill forms.{" "}
                <Link href="/dashboard/settings" className="underline hover:text-yellow-100">
                  Configure now &rarr;
                </Link>
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="glass md:col-span-1 border-white/10">
            <CardHeader>
              <CardTitle className="text-xl">Fill New Form</CardTitle>
              <CardDescription>Paste the Google Form link to auto-populate fields.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="formUrl">Google Form URL</Label>
                  <Input
                    id="formUrl"
                    placeholder="https://docs.google.com/forms/d/e/.../viewform"
                    className="border-white/10 bg-white/5 focus:border-primary focus:ring-primary"
                    disabled={submitLoading}
                    {...register("formUrl")}
                  />
                  {errors.formUrl && (
                    <p className="text-xs text-red-400">{errors.formUrl.message}</p>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoSubmit">Auto-Submit</Label>
                    <p className="text-xs text-muted-foreground">Submit form instantly if prefill passes.</p>
                  </div>
                  <Switch
                    id="autoSubmit"
                    disabled={submitLoading}
                    {...register("autoSubmit")}
                  />
                </div>

                <Button type="submit" variant="glow" className="w-full" disabled={submitLoading}>
                  {submitLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing Form...
                    </>
                  ) : (
                    <>
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Auto-Fill Form
                    </>
                  )}
                </Button>

                <div className="pt-2 border-t border-white/10">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 gap-1.5"
                    onClick={() => {
                      reset({
                        formUrl: "https://docs.google.com/forms/d/e/1FAIpQLSdj8k7DVWFNsJAgODVxJnHvL1YlA-Qhmnb-4vj0FA5_WVub9Q/viewform",
                        autoSubmit: false,
                      });
                      toast.info("Sample Google Form loaded! Tap Auto-Fill Form to test live auto-fill.");
                    }}
                  >
                    ⚡ Test Live Auto-Fill on Sample Form
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="glass md:col-span-2 border-white/10">
            <CardHeader>
              <CardTitle className="text-xl">Recent Jobs</CardTitle>
              <CardDescription>Track status and screenshots of auto-filled Google Forms.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingJobs ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No form auto-fill jobs triggered yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="border-white/10 bg-white/5">
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="w-[120px]">Date</TableHead>
                        <TableHead>Form URL</TableHead>
                        <TableHead className="w-[120px]">Method</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead className="w-[120px] text-right">Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => (
                        <TableRow key={job._id} className="border-white/10 hover:bg-white/5">
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(job.createdAt).toLocaleDateString("en-IN", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs font-mono text-muted-foreground">
                            <a
                              href={job.formUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline flex items-center gap-1 inline-flex text-purple-300"
                            >
                              {job.formUrl}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                          <TableCell>
                            {job.fillMethod ? (
                              <Badge variant="outline" className="text-xs border-white/10 bg-white/5 text-purple-300 capitalize">
                                {job.fillMethod.replace("_", " ")}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`text-xs capitalize ${
                                job.status === "completed"
                                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                  : job.status === "filled_pending_review"
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                  : job.status === "failed"
                                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                  : job.status === "running"
                                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse"
                                  : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                              }`}
                            >
                              {job.status === "filled_pending_review" ? "Pending Review" : job.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="glow"
                              size="sm"
                              className="h-8 px-3 text-emerald-400 hover:text-emerald-300 gap-1.5 bg-emerald-950/50 border-emerald-500/30"
                              onClick={() => setReviewingJob(job)}
                            >
                              <Eye className="h-4 w-4" />
                              View &amp; Fill Form
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={!!selectedScreenshot} onOpenChange={(open) => !open && setSelectedScreenshot(null)}>
        <DialogContent className="sm:max-w-[70vw] border-white/10 bg-slate-950/95 backdrop-blur">
          <DialogHeader>
            <DialogTitle className="text-purple-300">Filled Form Verification Screenshot</DialogTitle>
          </DialogHeader>
          {selectedScreenshot && (
            <div className="mt-4 overflow-auto max-h-[70vh] rounded-lg border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedScreenshot}
                alt="Form verification screenshot"
                className="w-full h-auto object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewingJob} onOpenChange={(open) => !open && setReviewingJob(null)}>
        <DialogContent className="sm:max-w-[75vw] border-white/10 bg-slate-950/95 backdrop-blur max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-purple-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-emerald-400" />
                Interactive Form Auto-Filler &amp; Launcher
              </span>
              {reviewingJob && (
                <a
                  href={reviewingJob.screenshot || reviewingJob.formUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-purple-300 hover:underline flex items-center gap-1 font-mono"
                >
                  Open in New Tab <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              PlaceMint has generated an auto-prefilled link for your form. Click below to open and submit under your Google account!
            </p>
          </DialogHeader>
          {reviewingJob && (
            <div className="space-y-4 mt-2">
              {/* Main Launch Card */}
              <div className="p-4 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 to-slate-900 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
                <div className="space-y-1 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-400 animate-pulse" />
                    <h3 className="font-bold text-sm text-emerald-300">Ready to Submit with Google Account</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All your profile fields have been mapped into the prefill URL. Click to launch with your logged-in Google account!
                  </p>
                </div>
                <a
                  href={reviewingJob.screenshot || reviewingJob.formUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0"
                >
                  <Button variant="glow" size="lg" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 px-6 shadow-lg shadow-emerald-900/50">
                    <ExternalLink className="h-4 w-4" />
                    🚀 Launch Auto-Prefilled Form
                  </Button>
                </a>
              </div>

              {reviewingJob.error && (
                <div className="p-3 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>{reviewingJob.error}</span>
                </div>
              )}

              {/* 1-Click Copy Profile Quick Bar */}
              {reviewingJob.filledData && Object.keys(reviewingJob.filledData).length > 0 && (
                <div className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-950/30 space-y-2">
                  <p className="text-[11px] font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                    1-Click Profile Helper — Click any chip to copy value to clipboard:
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {Object.entries(reviewingJob.filledData).map(([label, val]) => (
                      <Button
                        key={label}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(val.value || "");
                          toast.success(`Copied "${val.value}" to clipboard!`);
                        }}
                        className="text-xs h-7 bg-black/50 border-white/10 hover:bg-emerald-500/20 hover:border-emerald-500/40 text-white gap-1.5"
                        title={`Click to copy ${label}: ${val.value}`}
                      >
                        <Copy className="h-3 w-3 text-purple-400" />
                        <span className="text-muted-foreground font-normal">{label}:</span>
                        <span className="font-semibold text-emerald-400 max-w-[150px] truncate">{val.value || "—"}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Form Preview / Fallback Box */}
              <div className="rounded-xl border border-white/10 overflow-hidden bg-slate-900 h-[480px] shadow-2xl relative">
                <div className="absolute top-0 inset-x-0 bg-slate-950/90 border-b border-white/10 p-2.5 z-10 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    Google security blocks embedding inside frames (X-Frame-Options). Use the green button above to open prefilled form in a tab!
                  </span>
                  <a
                    href={reviewingJob.screenshot || reviewingJob.formUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline flex items-center gap-1 font-semibold shrink-0 ml-2"
                  >
                    Open Form <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <iframe
                  src={reviewingJob.screenshot || reviewingJob.formUrl}
                  className="w-full h-full border-0 pt-10"
                  title="Google Form Interactive Preview"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                <span className="text-xs text-muted-foreground font-mono truncate max-w-[350px]">
                  Job ID: {reviewingJob._id}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReviewingJob(null)}
                    disabled={submittingConfirm}
                  >
                    Close Preview
                  </Button>
                  <Button
                    variant="glow"
                    size="sm"
                    onClick={() => confirmSubmit(reviewingJob._id)}
                    disabled={submittingConfirm}
                    className="bg-emerald-600 hover:bg-emerald-700 border-emerald-500 text-white font-semibold"
                  >
                    {submittingConfirm && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm Application Completed
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
