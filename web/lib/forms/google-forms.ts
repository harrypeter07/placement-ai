export interface GoogleFormField {
  entryId: string; // "entry.123456"
  label: string;
  type: number; // 0: short answer, 1: paragraph, 2: radio, 3: dropdown, 4: checkbox, etc.
  choices?: string[];
}

export interface GoogleFormParsed {
  title: string;
  fields: GoogleFormField[];
  requiresLogin: boolean;
  isMultiPage: boolean;
}

export async function parseGoogleFormFields(formUrl: string): Promise<GoogleFormParsed> {
  const url = formUrl.replace(/\/viewform$/, "/viewform").replace(/\/formResponse$/, "/viewform");
  
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Google Form: HTTP ${res.status}`);
  }

  const html = await res.text();

  // 1. Check if login is required
  if (html.includes("accounts.google.com/ServiceLogin") || html.includes("Sign in to Google")) {
    return { title: "Requires Login", fields: [], requiresLogin: true, isMultiPage: false };
  }

  // 2. Locate FB_PUBLIC_LOAD_DATA_ javascript variable
  const match = html.match(/var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);/);
  if (!match) {
    throw new Error("Could not find FB_PUBLIC_LOAD_DATA_ in Google Form page source");
  }

  try {
    const rawJson = match[1].trim();
    // FB_PUBLIC_LOAD_DATA_ is a nested JSON array
    const data = JSON.parse(rawJson);
    
    const formTitle = data[1]?.[0] || "Google Form";
    const rawQuestions = data[1]?.[1] || [];
    const fields: GoogleFormField[] = [];
    
    let isMultiPage = false;

    for (const q of rawQuestions) {
      if (!q) continue;
      
      const label = q[1];
      const type = q[3]; // question type number
      const inputs = q[4]; // array of inputs

      // Check if it's a page break element (type 8 represents page breaks in Google Forms)
      if (type === 8) {
        isMultiPage = true;
        continue;
      }

      if (!inputs || !Array.isArray(inputs) || inputs.length === 0) {
        continue;
      }

      for (const input of inputs) {
        const idInt = input[0];
        if (!idInt) continue;

        const entryId = `entry.${idInt}`;
        const choicesRaw = input[1];
        const choices = Array.isArray(choicesRaw) ? choicesRaw.map(c => String(c[0])) : undefined;

        fields.push({
          entryId,
          label: String(label || "").trim(),
          type: Number(type),
          choices
        });
      }
    }

    return {
      title: formTitle,
      fields,
      requiresLogin: false,
      isMultiPage
    };
  } catch (err) {
    console.error("[parseGoogleFormFields] JSON parse failure:", err);
    throw new Error("Failed to parse Google Form JS data structure");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fuzzyMatchFormField(label: string, profile: Record<string, any>): string | undefined {
  const cleanLabel = label.toLowerCase();
  
  if (/\b(name|full name|candidate name|applicant name)\b/.test(cleanLabel)) {
    return profile.fullName;
  }
  if (/\b(email|mail|email id|mail id)\b/.test(cleanLabel)) {
    return profile.email;
  }
  if (/\b(phone|mobile|contact|number|whatsapp|tele)\b/.test(cleanLabel)) {
    return profile.phone;
  }
  if (/\b(cgpa|gpa|pointer|percentage|percent|marks|btech pointer)\b/.test(cleanLabel)) {
    return profile.cgpa;
  }
  if (/\b(branch|department|stream|specialization|course|degree)\b/.test(cleanLabel)) {
    return profile.branch;
  }
  if (/\b(grad|graduation|year of pass|passing year|batch|year)\b/.test(cleanLabel)) {
    return profile.graduationYear;
  }
  if (/\b(resume|cv|drive link|resume link|upload resume)\b/.test(cleanLabel)) {
    return profile.resumeLink;
  }
  if (/github/.test(cleanLabel)) {
    return profile.githubLink;
  }
  if (/linkedin/.test(cleanLabel)) {
    return profile.linkedInLink;
  }
  if (/\b(roll|reg|registration|usn|enrollment|id)\b/.test(cleanLabel)) {
    return profile.rollNumber;
  }
  
  return undefined;
}

export async function submitPrefilledFormResponse(formUrl: string, prefillParams: Record<string, string>): Promise<boolean> {
  const responseUrl = formUrl.replace(/\/viewform$/, "/formResponse").replace(/\/formResponse$/, "/formResponse");
  
  const bodyParams = new URLSearchParams();
  for (const [key, val] of Object.entries(prefillParams)) {
    bodyParams.append(key, val);
  }
  // Include standard submission parameter
  bodyParams.append("submit", "Submit");

  try {
    const res = await fetch(responseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: bodyParams.toString(),
      signal: AbortSignal.timeout(15000)
    });

    // Google forms responds with a HTML page confirming submission. Usually 200 OK
    return res.status === 200;
  } catch (err) {
    console.error("[submitPrefilledFormResponse] Post failed:", err);
    return false;
  }
}
