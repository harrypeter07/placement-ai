import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { generateGeminiContent, PRIMARY_GEMINI_MODEL } from "@/lib/ai/gemini-client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const { resumeContent, fileBase64, mimeType } = await req.json();

    if (!resumeContent && !fileBase64) {
      return NextResponse.json({ error: "Please upload a resume file (PDF/DOCX) or paste resume text." }, { status: 400 });
    }

    const prompt = `You are an expert resume parsing AI. Analyze the attached student resume document/text and extract structured student profile information for job application auto-filling.
Return ONLY a raw JSON object with the following fields:
{
  "name": "Full Name or null",
  "email": "Email address or null",
  "phone": "Phone number or null",
  "branch": "Engineering branch/major (e.g. Computer Science & Engineering) or null",
  "cgpa": "CGPA or percentage (e.g. 8.75) or null",
  "graduationYear": "4-digit graduation year (e.g. 2026) or null",
  "resumeLink": "Google Drive or public link if present in document or null",
  "github": "GitHub profile link or null",
  "linkedin": "LinkedIn profile link or null",
  "skills": ["Array of key technical skills"]
}`;

    let result;
    if (fileBase64) {
      const effectiveMime = mimeType && mimeType.includes("pdf") ? "application/pdf" : mimeType || "application/pdf";
      const filePart = {
        inlineData: {
          data: fileBase64,
          mimeType: effectiveMime,
        },
      };
      result = await generateGeminiContent(user.id, [prompt, filePart], PRIMARY_GEMINI_MODEL);
    } else {
      result = await generateGeminiContent(user.id, [prompt, `\n\nResume Text:\n${resumeContent}`], PRIMARY_GEMINI_MODEL);
    }

    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse JSON from Gemini response" }, { status: 500 });
    }

    const extracted = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ok: true, extracted });
  } catch (e) {
    console.error("[Resume Parse] Error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error parsing resume document" }, { status: 500 });
  }
}
