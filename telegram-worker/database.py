import os
from datetime import datetime
from urllib.parse import urlparse

from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

DEFAULT_DB = os.getenv("MONGODB_DB_NAME", "placemint")


def _get_db():
    uri = os.getenv("MONGODB_URI", f"mongodb://localhost:27017/{DEFAULT_DB}")
    client = MongoClient(uri)
    parsed = urlparse(uri)
    path_db = (parsed.path or "").lstrip("/").split("?")[0]
    db_name = path_db or DEFAULT_DB
    return client[db_name]


db = _get_db()


def save_deadline(data: dict) -> str | None:
    """Save extracted placement to MongoDB. Returns id or None if duplicate."""
    collection = db.deadlines
    existing = collection.find_one({
        "company": data.get("company"),
        "role": data.get("role", "Role TBD"),
        "sourceMessageId": data.get("sourceMessageId"),
    })
    if existing:
        return None

    doc = {
        "company": data["company"],
        "role": data.get("role", "Role TBD"),
        "deadline": data.get("deadline", datetime.utcnow()),
        "eligibility": data.get("eligibility", ""),
        "type": data.get("type", "full-time"),
        "links": data.get("links", []),
        "salary": data.get("salary", ""),
        "confidence": data.get("confidence", 0),
        "sourceMessageId": data.get("sourceMessageId"),
        "telegramGroupId": data.get("telegramGroupId"),
        "isGlobal": True,
        "status": "pending",
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    }
    result = collection.insert_one(doc)
    return str(result.inserted_id)


def get_pending_reminders():
    """Fetch reminders due for sending."""
    now = datetime.utcnow()
    return list(db.reminders.find({"sent": False, "scheduledAt": {"$lte": now}}))


def mark_reminder_sent(reminder_id):
    db.reminders.update_one({"_id": reminder_id}, {"$set": {"sent": True}})
