import json
import re
import os
from typing import Any

import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

EXTRACTION_PROMPT = """You are an expert placement opportunity parser for Indian college placement Telegram groups.

Extract structured placement information from the message below. Return ONLY valid JSON with no markdown.

Schema:
{
  "company": "string",
  "role": "string",
  "deadline": "ISO 8601 date string or empty",
  "eligibility": "string with CGPA, branch, year requirements",
  "type": "internship | full-time | both",
  "links": ["url strings"],
  "salary": "string or empty",
  "confidence": 0.0 to 1.0
}

Rules:
- If not a placement post, set confidence to 0 and company to ""
- Detect spam/promotional content and set confidence below 0.3
- Parse Indian date formats (DD/MM/YYYY, "by 25th Jan", etc.)
- Extract all application links
- Be conservative with confidence

Message:
"""

SPAM_PATTERNS = [
    r"join\s+our\s+channel",
    r"crypto|forex|betting",
    r"click\s+here\s+to\s+win",
    r"free\s+iphone",
]


def preprocess_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text


def is_spam(text: str) -> bool:
    lower = text.lower()
    return any(re.search(p, lower) for p in SPAM_PATTERNS)


def regex_fallback(text: str) -> dict[str, Any]:
    links = re.findall(r"https?://[^\s]+", text)
    company_match = re.search(r"(?:company|hiring|@)\s*[:.]?\s*([A-Za-z0-9\s&.]+)", text, re.I)
    cgpa_match = re.search(r"(\d+\.?\d*)\s*CGPA", text, re.I)
    date_match = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", text)

    deadline = ""
    if date_match:
        d, m, y = date_match.groups()
        year = f"20{y}" if len(y) == 2 else y
        deadline = f"{year}-{m.zfill(2)}-{d.zfill(2)}T23:59:59Z"

    placement_kw = re.search(r"placement|hiring|intern|apply|deadline|drive|recruit", text, re.I)
    confidence = 0.65 if placement_kw else 0.1

    return {
        "company": (company_match.group(1).strip() if company_match else ""),
        "role": "",
        "deadline": deadline,
        "eligibility": f"Min CGPA: {cgpa_match.group(1)}" if cgpa_match else "",
        "type": "internship" if re.search(r"intern", text, re.I) else "full-time",
        "links": links,
        "salary": "",
        "confidence": confidence,
    }


def parse_placement_message(text: str) -> dict[str, Any]:
    text = preprocess_text(text)

    if is_spam(text):
        return {"company": "", "role": "", "deadline": "", "eligibility": "", "type": "full-time", "links": [], "salary": "", "confidence": 0.1}

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return regex_fallback(text)

    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(EXTRACTION_PROMPT + text)
        raw = response.text.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
        if parsed.get("confidence", 0) < 0.3:
            return regex_fallback(text)
        return parsed
    except Exception:
        return regex_fallback(text)


def is_duplicate(company: str, role: str, existing_hashes: set) -> bool:
    key = f"{company.lower()}|{role.lower()}"
    if key in existing_hashes:
        return True
    existing_hashes.add(key)
    return False
