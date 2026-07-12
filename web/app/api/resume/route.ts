import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { analyzeResume } from "@/lib/gemini";

export async function GET() {
  try {
    const user = await requireAuth();

    // Fetch resumes from Supabase
    const { data: resumes, error } = await supabase
      .from("student_resumes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET resume] Supabase error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const mapped = (resumes || []).map((r) => ({
      _id: r.id,
      id: r.id,
      userId: r.user_id,
      fileName: r.file_name,
      fileUrl: r.file_url,
      atsScore: r.ats_score,
      skills: r.skills,
      missingSkills: r.missing_skills,
      suggestions: r.suggestions,
      companyCompatibility: r.company_compatibility,
      analyzedAt: r.analyzed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return NextResponse.json(mapped);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const text = formData.get("text") as string | null;

    if (!file && !text) {
      return NextResponse.json({ error: "File or text required" }, { status: 400 });
    }

    let resumeText = text || "";
    if (file) {
      resumeText = await file.text();
    }

    const analysis = await analyzeResume(resumeText);

    // Save to student_resumes table in Supabase
    const { data: resume, error: insertError } = await supabase
      .from("student_resumes")
      .insert([
        {
          user_id: user.id,
          file_name: file?.name || "resume.txt",
          file_url: "/uploads/resume",
          ats_score: analysis.atsScore || 0,
          skills: analysis.skills || [],
          missing_skills: analysis.missingSkills || [],
          suggestions: analysis.suggestions || [],
          company_compatibility: analysis.companyCompatibility || [],
          analyzed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select("*")
      .single();

    if (insertError || !resume) {
      console.error("[POST resume] Supabase insert error:", insertError);
      return NextResponse.json({ error: "Failed to save resume analysis" }, { status: 500 });
    }

    const mapped = {
      _id: resume.id,
      id: resume.id,
      userId: resume.user_id,
      fileName: resume.file_name,
      fileUrl: resume.file_url,
      atsScore: resume.ats_score,
      skills: resume.skills,
      missingSkills: resume.missing_skills,
      suggestions: resume.suggestions,
      companyCompatibility: resume.company_compatibility,
      analyzedAt: resume.analyzed_at,
      createdAt: resume.created_at,
      updatedAt: resume.updated_at,
    };

    return NextResponse.json(mapped, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
