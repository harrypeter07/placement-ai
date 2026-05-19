import type { EligibilityProfile } from "@/types";

export function checkEligibility(
  eligibilityText: string,
  profile: EligibilityProfile
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let eligible = true;
  const text = eligibilityText.toLowerCase();

  const cgpaMatch = text.match(/(\d+\.?\d*)\s*(?:cgpa|gpa)/i);
  if (cgpaMatch) {
    const required = parseFloat(cgpaMatch[1]);
    if (profile.cgpa < required) {
      eligible = false;
      reasons.push(`CGPA ${profile.cgpa} below required ${required}`);
    }
  }

  const branchKeywords = ["cse", "cs", "it", "ece", "eee", "mech", "civil", "all branches"];
  for (const branch of branchKeywords) {
    if (text.includes(branch) && !text.includes("all branches")) {
      if (!text.includes(profile.branch.toLowerCase().slice(0, 3))) {
        const branchAliases: Record<string, string[]> = {
          cse: ["cs", "computer science", "cse"],
          it: ["information technology", "it"],
          ece: ["electronics", "ece"],
        };
        const aliases = branchAliases[branch] || [branch];
        const matches = aliases.some((a) => profile.branch.toLowerCase().includes(a));
        if (!matches && branch !== "all branches") {
          eligible = false;
          reasons.push(`Branch ${profile.branch} may not be eligible`);
        }
      }
    }
  }

  if (text.includes("no backlog") && profile.backlogs > 0) {
    eligible = false;
    reasons.push(`Has ${profile.backlogs} backlog(s), requires zero`);
  }

  const yearMatch = text.match(/20(\d{2})/);
  if (yearMatch) {
    const requiredYear = parseInt(`20${yearMatch[1]}`);
    if (profile.graduationYear !== requiredYear) {
      reasons.push(`Graduation year ${profile.graduationYear} vs required ${requiredYear}`);
    }
  }

  if (eligible && reasons.length === 0) {
    reasons.push("Meets eligibility criteria");
  }

  return { eligible, reasons };
}
