import os
import requests
from datetime import datetime

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def save_deadline(data: dict) -> str | None:
    """Save extracted placement to Supabase PostgreSQL. Returns id or None if duplicate."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[database] Missing Supabase configuration")
        return None

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    company = data.get("company")
    role = data.get("role", "Role TBD")
    source_msg_id = data.get("sourceMessageId")

    # 1. Check for duplicates
    try:
        query_url = f"{SUPABASE_URL}/rest/v1/deadlines?company=eq.{company}&role=eq.{role}&source_message_id=eq.{source_msg_id}"
        res = requests.get(query_url, headers=headers)
        if res.status_code == 200:
            existing = res.json()
            if existing and len(existing) > 0:
                return None
    except Exception as e:
        print(f"[database] Duplicate check exception: {e}")

    # 2. Insert new record
    deadline_val = data.get("deadline")
    if isinstance(deadline_val, datetime):
        deadline_iso = deadline_val.isoformat()
    else:
        deadline_iso = datetime.utcnow().isoformat()

    doc = {
        "company": company,
        "role": role,
        "deadline_date": deadline_iso,
        "eligibility": data.get("eligibility", ""),
        "type": data.get("type", "full-time"),
        "links": data.get("links", []),
        "salary": data.get("salary", ""),
        "confidence": float(data.get("confidence", 0.0)),
        "source_message_id": source_msg_id,
        "telegram_group_id": data.get("telegramGroupId"),
        "is_global": True,
        "status": "pending",
    }

    try:
        insert_url = f"{SUPABASE_URL}/rest/v1/deadlines"
        res = requests.post(insert_url, json=doc, headers=headers)
        if res.status_code in (200, 201):
            inserted = res.json()
            return inserted[0]["id"] if inserted else "inserted"
        print(f"[database] Save deadline HTTP error: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"[database] Save deadline exception: {e}")
    return None

def get_pending_reminders():
    return []

def mark_reminder_sent(reminder_id):
    pass
