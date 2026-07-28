import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAuth();
    const { resumeContent } = await req.json();

    if (!resumeContent || typeof resumeContent !== "string") {
      return NextResponse.json({ error: "Missing resume content" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are an expert resume parsing AI. Analyze the following raw text from a student's resume and extract structured student profile information.
Return ONLY a raw JSON object with the following fields:
{
  "name": "Full Name or null",
  "email": "Email address or null",
  "phone": "Phone number or null",
  "branch": "Engineering branch/major (e.g. Computer Science & Engineering) or null",
  "cgpa": "CGPA or percentage (e.g. 8.75) or null",
  "graduationYear": "4-digit graduation year (e.g. 2026) or null",
  "resumeLink": "Google Drive or public link if present or null",
  "github": "GitHub profile link or null",
  "linkedin": "LinkedIn profile link or null",
  "skills": ["Array of key technical skills"]
}

Resume Text:
"""
${resumeContent}
"""`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse JSON from Gemini response" }, { status: 500 });
    }

    const extracted = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ok: true, extracted });
  } catch (e) {
    console.error("[Resume Parse] Error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error parsing resume" }, { status: 500 });
  }
}
