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
import { Loader2, ExternalLink, Settings, ClipboardList, Eye, AlertCircle } from "lucide-react";
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
        toast.error(data.error || "Submission failed", { id: toastId });
      }
    } catch (err) {
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

      if (res.ok) {
        toast.success("Form automation job started!");
        reset();
        fetchJobs();
      } else {
        const errData = await res.json();
        toast.error(errData.error || "Failed to trigger form auto-fill.");
      }
    } catch (err) {
      toast.error("An error occurred while submitting.");
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
                            {job.status === "filled_pending_review" ? (
                              <Button
                                variant="glow"
                                size="sm"
                                className="h-8 px-3 text-amber-400 hover:text-amber-300 gap-1.5"
                                onClick={() => setReviewingJob(job)}
                              >
                                <ClipboardList className="h-4 w-4" />
                                Review &amp; Submit
                              </Button>
                            ) : job.status === "completed" && job.screenshot ? (
                              job.fillMethod === "prefill_url" ? (
                                <a
                                  href={job.screenshot}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-green-400 hover:underline font-semibold"
                                >
                                  Open Prefilled URL
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-green-400 hover:text-green-300 gap-1.5 hover:bg-white/5"
                                  onClick={() => setSelectedScreenshot(job.screenshot || null)}
                                >
                                  <Eye className="h-4 w-4" />
                                  Screenshot
                                </Button>
                              )
                            ) : job.status === "failed" && job.error ? (
                              <span className="text-xs text-red-400 cursor-help" title={job.error}>
                                Error info
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Waiting...</span>
                            )}
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
        <DialogContent className="sm:max-w-[50vw] border-white/10 bg-slate-950/95 backdrop-blur max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-purple-300 flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Verify &amp; Submit Application Form
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Review the fields automatically mapped by PlaceMint A.I. before submitting to the form endpoint.
            </p>
          </DialogHeader>
          {reviewingJob && (
            <div className="space-y-4 mt-4">
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Form URL:</strong> <a href={reviewingJob.formUrl} target="_blank" rel="noreferrer" className="text-purple-300 underline font-mono break-all inline-flex items-center gap-1">{reviewingJob.formUrl}<ExternalLink className="h-3 w-3" /></a></p>
                <p><strong>Trigger Source:</strong> <span className="capitalize">{reviewingJob.triggerSource || "call"}</span></p>
                <p><strong>Fill Method:</strong> <span className="capitalize">{reviewingJob.fillMethod?.replace("_", " ") || "prefill_url"}</span></p>
              </div>

              {/* Display Extracted Values */}
              {reviewingJob.filledData && Object.keys(reviewingJob.filledData).length > 0 ? (
                <div className="space-y-2 border rounded-lg p-4 bg-white/5 border-white/10">
                  <h4 className="text-sm font-semibold text-purple-300">Extracted Values for Google Form:</h4>
                  <div className="grid gap-2 text-xs pt-2">
                    {Object.entries(reviewingJob.filledData).map(([label, val]) => (
                      <div key={label} className="grid grid-cols-2 gap-2 border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
                        <span className="text-muted-foreground font-medium">{label}</span>
                        <span className="text-white font-semibold text-right break-all">{val.value || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-xs flex gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  No field mapping logs found. Please review the live form preview.
                </div>
              )}

              {/* Screenshot Preview for Playwright */}
              {reviewingJob.fillMethod === "playwright" && reviewingJob.screenshot && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-purple-300">Verification Screenshot:</h4>
                  <div className="rounded-lg border border-white/10 overflow-hidden max-h-[40vh] overflow-y-auto">
                    <img
                      src={reviewingJob.screenshot}
                      alt="Playwright verification screenshot"
                      className="w-full h-auto object-contain"
                    />
                  </div>
                </div>
              )}

              {/* Prefill Live Preview */}
              {reviewingJob.fillMethod === "prefill_url" && reviewingJob.screenshot && (
                <div className="p-4 rounded-lg border border-purple-500/20 bg-purple-500/5 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-purple-300">Prefilled Live Form Link</p>
                    <p className="text-[11px] text-muted-foreground">Verify inputs live on the official form UI.</p>
                  </div>
                  <a
                    href={reviewingJob.screenshot}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                  >
                    Open Live Form
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t border-white/10 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReviewingJob(null)}
                  disabled={submittingConfirm}
                >
                  Cancel
                </Button>
                <Button
                  variant="glow"
                  size="sm"
                  onClick={() => confirmSubmit(reviewingJob._id)}
                  disabled={submittingConfirm}
                  className="bg-amber-600 hover:bg-amber-700 border-amber-500 text-white"
                >
                  {submittingConfirm && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Now
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
