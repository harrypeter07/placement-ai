import os
import requests

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

class SupabaseDb:
    def __init__(self):
        self.url = SUPABASE_URL
        self.key = SUPABASE_KEY
        self.headers = {
            "apikey": self.key or "",
            "Authorization": f"Bearer {self.key}" if self.key else "",
            "Content-Type": "application/json",
        }

    def get_job(self, job_id: str) -> dict | None:
        if not self.url or not self.key:
            print("[SupabaseDb] Missing credentials configuration")
            return None
        try:
            res = requests.get(
                f"{self.url}/rest/v1/form_jobs?id=eq.{job_id}",
                headers=self.headers
            )
            if res.status_code == 200:
                data = res.json()
                return data[0] if data else None
            print(f"[SupabaseDb] get_job HTTP error: {res.status_code} - {res.text}")
        except Exception as e:
            print(f"[SupabaseDb] get_job exception: {e}")
        return None

    def update_job(self, job_id: str, payload: dict) -> bool:
        if not self.url or not self.key:
            print("[SupabaseDb] Missing credentials configuration")
            return False
        try:
            headers = {**self.headers, "Prefer": "return=representation"}
            res = requests.patch(
                f"{self.url}/rest/v1/form_jobs?id=eq.{job_id}",
                json=payload,
                headers=headers
            )
            if res.status_code in (200, 201, 204):
                return True
            print(f"[SupabaseDb] update_job HTTP error: {res.status_code} - {res.text}")
        except Exception as e:
            print(f"[SupabaseDb] update_job exception: {e}")
        return False
