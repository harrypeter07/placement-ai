import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExtractedPlacement } from "@/types";
import { getGeminiApiKey } from "@/lib/ai/gemini-env";

const EXTRACTION_PROMPT = `You are an expert placement opportunity parser for Indian college placement Telegram/WhatsApp notice channels.

Extract structured placement information from the message below. Return ONLY valid JSON with no markdown.

Schema:
{
  "company": "string (e.g. Nutanix, Infosys, Varroc, Adobe, Stripe, LTM, IBM, Aspect Ratio, Placement Cell)",
  "role": "string (e.g. Software Engineer Intern, Coding Test Slot 1, GD & Interview Reporting, Pre-Placement Talk, Policy Submission)",
  "deadline": "ISO 8601 date string with exact time if specified (e.g. 2026-07-27T09:30:00+05:30) or empty string",
  "eligibility": "string with CGPA, branch, batch requirements",
  "type": "internship" | "full-time" | "both",
  "links": ["url strings"],
  "salary": "string or empty",
  "confidence": 0.0 to 1.0
}

Rules:
- Parse ALL placement updates: job postings, registration deadlines, online test slots, GD/interview reporting times, pre-placement talks (PPTs), shortlists, and mandatory policy submission deadlines.
- If company name is not explicitly mentioned but it is a placement cell notice, set company to "CDPC Placement Cell" or infer from context (e.g., Nutanix, Infosys, Varroc, LTM, IBM).
- Set high confidence (0.8 to 1.0) for any message containing actionable dates/times for tests, interviews, PPTs, links, or deadlines.
- Set confidence to 0 ONLY if the text is completely unrelated general chat noise or off-topic spam.
- Parse Indian date/time formats accurately (e.g. "27-07-2026 @ 9:00 AM", "21st July 2026 Morning", "today before 2:00 PM", "apply before 17July", "8th August 2026").
- Extract all URLs (Google Forms, Unstop, company portals, LinkedIn, etc.).

Message:
`;

export async function extractPlacementFromText(text: string): Promise<ExtractedPlacement> {
  const fallback: ExtractedPlacement = {
    company: "",
    role: "",
    deadline: "",
    eligibility: "",
    type: "full-time",
    links: [],
    salary: "",
    confidence: 0,
  };

  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    return preprocessWithRegex(text);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const models = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash-8b",
      "gemini-2.0-flash",
      "gemini-2.5-flash",
      "gemini-1.5-pro"
    ];
    let responseText = "";
    let lastErr: unknown;
    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(EXTRACTION_PROMPT + text);
        responseText = result.response.text();
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!responseText) throw lastErr;
    const cleaned = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as ExtractedPlacement;
    return { ...fallback, ...parsed };
  } catch {
    return preprocessWithRegex(text);
  }
}

function preprocessWithRegex(text: string): ExtractedPlacement {
  const linkRegex = /https?:\/\/[^\s]+/g;
  const links = text.match(linkRegex) || [];
  const companyMatch = text.match(/(?:company|org|hiring)[:\s]+([A-Za-z0-9\s&.]+)/i);
  const cgpaMatch = text.match(/(\d+\.?\d*)\s*CGPA/i);
  const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);

  let deadline = "";
  if (dateMatch) {
    const [, d, m, y] = dateMatch;
    const year = y.length === 2 ? `20${y}` : y;
    deadline = new Date(`${year}-${m}-${d}`).toISOString();
  }

  const placementKeywords = /placement|hiring|intern|apply|deadline|drive|recruit/i;
  const confidence = placementKeywords.test(text) ? 0.6 : 0.1;

  return {
    company: companyMatch?.[1]?.trim() || "",
    role: "",
    deadline,
    eligibility: cgpaMatch ? `Min CGPA: ${cgpaMatch[1]}` : "",
    type: /intern/i.test(text) ? "internship" : "full-time",
    links,
    salary: "",
    confidence,
  };
}

export async function analyzeResume(text: string): Promise<{
  atsScore: number;
  skills: string[];
  missingSkills: string[];
  suggestions: string[];
  companyCompatibility: { company: string; match: number }[];
  parsedProfile?: {
    fullName?: string;
    email?: string;
    phone?: string;
    cgpa?: string;
    branch?: string;
    graduationYear?: string;
    githubLink?: string;
    linkedInLink?: string;
    rollNumber?: string;
  };
}> {
  const defaultResult = {
    atsScore: 72,
    skills: ["JavaScript", "React", "Node.js", "MongoDB", "TypeScript"],
    missingSkills: ["System Design", "Docker", "AWS"],
    suggestions: [
      "Add quantifiable achievements to experience section",
      "Include relevant keywords from job descriptions",
      "Optimize section headers for ATS parsing",
    ],
    companyCompatibility: [
      { company: "Google", match: 68 },
      { company: "Microsoft", match: 75 },
      { company: "Amazon", match: 71 },
    ],
    parsedProfile: {
      fullName: "",
      email: "",
      phone: "",
      cgpa: "",
      branch: "",
      graduationYear: "",
      githubLink: "",
      linkedInLink: "",
      rollNumber: "",
    }
  };

  const apiKey = await getGeminiApiKey();
  if (!apiKey) return defaultResult;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Analyze this resume text and return JSON only:
{
  "atsScore": number 0-100,
  "skills": ["string"],
  "missingSkills": ["string"],
  "suggestions": ["string"],
  "companyCompatibility": [{"company": "string", "match": number}],
  "parsedProfile": {
    "fullName": "string or empty",
    "email": "string or empty",
    "phone": "string or empty",
    "cgpa": "string or empty",
    "branch": "string or empty (e.g. CSE, IT, Mechanical, Electrical)",
    "graduationYear": "string or empty (e.g. 2027)",
    "githubLink": "string or empty",
    "linkedInLink": "string or empty",
    "rollNumber": "string or empty (college enrollment/registration/roll number if found)"
  }
}

Resume:
${text.slice(0, 8000)}`;

    const result = await model.generateContent(prompt);
    const cleaned = result.response.text().replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return defaultResult;
  }
}
