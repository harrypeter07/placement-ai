import type { ChatInsightItem, ChatMessageInput } from "@/lib/ai/chat-insights";

const PLACEMENT_RE =
  /\b(placement|intern|hiring|apply|applying|deadline|oa\b|online assessment|interview|register|registration|form|closing|eligibility|cgpa|package|lpa|ctc|tcs|infosys|wipro|amazon|google|microsoft|drive|shortlist|pool|campus)/i;

const URGENT_RE =
  /\b(today|tonight|eod|asap|urgent|last date|closing soon|11:59|23:59|form closure|last chance)/i;

function parseDeadlineFromText(text: string, sentAt: string): string {
  const now = new Date(sentAt || Date.now());
  const y = now.getFullYear();

  const dmy = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) {
    const [, d, mo, yr] = dmy;
    const year = yr.length === 2 ? 2000 + Number(yr) : Number(yr);
    const dt = new Date(year, Number(mo) - 1, Number(d), 23, 59);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  const dayMonth = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
  if (dayMonth) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, max: 2, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const mo = months[dayMonth[2].slice(0, 3).toLowerCase()];
    if (mo !== undefined) {
      const dt = new Date(y, mo, Number(dayMonth[1]), 23, 59);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
  }

  const timeDay = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(\d{1,2})?/i);
  if (timeDay && (timeDay[2] || timeDay[3]) && URGENT_RE.test(text)) {
    const day = timeDay[4] ? Number(timeDay[4]) : now.getDate();
    let hour = Number(timeDay[1]);
    const min = timeDay[2] ? Number(timeDay[2]) : 0;
    const ap = (timeDay[3] || "").toLowerCase();
    if (ap === "pm" && hour < 12) hour += 12;
    if (ap === "am" && hour === 12) hour = 0;
    const dt = new Date(y, now.getMonth(), day, hour, min);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  if (URGENT_RE.test(text)) {
    const end = new Date(now);
    end.setHours(23, 59, 0, 0);
    return end.toISOString();
  }
  return "";
}

function guessCompany(text: string): string {
  const named =
    text.match(
      /\b(TCS|Tata Consultancy|Infosys|Wipro|Amazon|Google|Microsoft|Accenture|Deloitte|Cognizant|Capgemini|IBM|Oracle|Flipkart|Zoho|Paytm|Razorpay|PhonePe|Juspay|Goldman Sachs|JP Morgan|Barclays|Deutsche Bank|Adobe|Myntra|Eaton|Stryker|Josh Technology|Salesforce|Varroc|Aspect Ratio|Tata Technologies|Logitech|Eaton|Tally|Nutanix|Stripe)\b/i
    )?.[1];
  if (named) return named.replace(/\s+/g, " ").trim();

  // Heuristic: Check first line for delimiters
  const firstLine = text.split("\n")[0].trim();
  const parts = firstLine.split(/\s*[\-|–|:|•|│|#]\s*/);
  if (parts.length > 1) {
    const candidate = parts[0].trim();
    if (/^[A-Z]/.test(candidate) && candidate.length >= 2 && candidate.length <= 40 && !/^(attention|dear|notice|reminder|important|placement|crt|policy|registrations)/i.test(candidate)) {
      return candidate;
    }
  }

  const hiring = text.match(/\b([A-Z][A-Za-z0-9&.\s]{1,30})\s+(?:is hiring|hiring|placement|drive|intern|hackathon|recruit)\b/)?.[1];
  if (hiring) return hiring.trim();

  return "Placement update";
}

function urgencyFor(deadlineIso: string, text: string): ChatInsightItem["urgency"] {
  if (URGENT_RE.test(text)) return "critical";
  if (!deadlineIso) return "medium";
  const hours = (new Date(deadlineIso).getTime() - Date.now()) / (3600 * 1000);
  if (hours < 24) return "critical";
  if (hours < 72) return "high";
  if (hours < 168) return "medium";
  return "low";
}

/** Rule-based analysis when Gemini API is unavailable — still useful for placements */
export function smartPlacementInsights(
  groupId: string,
  groupTitle: string,
  messages: ChatMessageInput[]
): ChatInsightItem[] {
  const items: ChatInsightItem[] = [];
  let rank = 1;

  for (const m of messages) {
    const text = (m.text || "").trim();
    if (text.length < 12) continue;
    if (!PLACEMENT_RE.test(text)) continue;

    const deadlineIso = parseDeadlineFromText(text, m.sentAt);
    const urgency = urgencyFor(deadlineIso, text);
    const company = guessCompany(text);
    const links = text.match(/https?:\/\/[^\s]+/g) || [];

    items.push({
      rank: rank++,
      title: text.split("\n")[0].slice(0, 90) || `${company} update`,
      summary: text.slice(0, 500),
      urgency,
      category: deadlineIso ? "deadline" : "action",
      confidence: deadlineIso ? 0.62 : 0.48,
      groupId,
      groupTitle,
      sourceMessageIds: [m.messageId],
      extractedDeadline: deadlineIso
        ? {
            company,
            role: text.match(/(?:role|position|profile)[:\s]+([A-Za-z0-9\s&.]{2,40})/i)?.[1]?.trim() || "Role",
            deadline: deadlineIso,
            eligibility: text.match(/(?:eligibility|eligible|cgpa|branch)[:\s].{0,120}/i)?.[0]?.slice(0, 120) || "",
            links,
            type: /intern/i.test(text) ? "internship" : "full-time",
          }
        : null,
      suggestedReminderOffsetsMinutes:
        urgency === "critical" ? [6 * 60, 60, 30, 15] : [24 * 60, 6 * 60, 60, 15],
      whyRanked: deadlineIso
        ? "Deadline or time mentioned in message"
        : "Placement-related announcement",
    });
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => order[a.urgency] - order[b.urgency] || a.rank - b.rank);
  items.forEach((it, i) => {
    it.rank = i + 1;
  });
  return items.slice(0, 15);
}
