import os
import asyncio
from datetime import datetime
import requests
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from playwright.async_api import async_playwright

# Import database helper and the listener module
from db_supabase import SupabaseDb
import listener

app = FastAPI(title="PlaceMint Combined Backend Service")

# Create screenshots directory and mount it statically
os.makedirs("/app/screenshots", exist_ok=True)
app.mount("/screenshots", StaticFiles(directory="/app/screenshots"), name="screenshots")

# Supabase Client
db = SupabaseDb()

class SendMessageRequest(BaseModel):
    apiKey: str
    text: str

class JobRequest(BaseModel):
    jobId: str

@app.on_event("startup")
async def startup_event():
    if not listener.API_ID or not listener.API_HASH:
        print("ERROR: Set TELEGRAM_API_ID and TELEGRAM_API_HASH. Telegram worker will not start.", flush=True)
        return

    print("[CombinedBackend] Starting Telegram Worker loops in parallel...", flush=True)
    # Start the keepalive loop and telegram listener loop inside FastAPI's event loop
    asyncio.create_task(listener.keepalive_loop())
    
    # We run the Telegram worker client loop
    asyncio.create_task(run_telegram_worker_loop_fastapi())

async def run_telegram_worker_loop_fastapi():
    try:
        await listener.wait_for_telegram()
        if not listener.client:
            print("[CombinedBackend] Failed to initialize Telegram client.", flush=True)
            return

        listener.client.add_event_handler(listener.on_new_message, listener.events.NewMessage())
        me = await listener.client.get_me()
        listener._worker_status["telegram"] = "connected"
        print(f"[CombinedBackend] Logged in as {me.first_name} (@{me.username})", flush=True)

        await listener.discover_and_sync_all_groups()
        await listener.refresh_monitored_ids()
        listener._worker_status["groups"] = len(listener.monitored_ids)

        for gid in listener.monitored_ids:
            title = listener.group_titles.get(gid)
            if not title:
                try:
                    entity = await listener.client.get_entity(int(gid) if gid.startswith("-") or gid.isdigit() else gid)
                    title = getattr(entity, 'title', gid)
                    listener.group_titles[gid] = title
                except Exception:
                    listener.group_titles[gid] = gid
            print(f"[CombinedBackend] Monitoring channel: {title} ({gid})", flush=True)

        print("[CombinedBackend] Telegram loop running successfully in background.", flush=True)
        await listener.client.run_until_disconnected()
    except Exception as e:
        print(f"[CombinedBackend] Telegram loop exception: {e}", flush=True)
        listener._worker_status["telegram"] = f"error: {str(e)}"

# FASTAPI ROUTES

@app.get("/")
@app.get("/health")
def health_check():
    # Gather logs
    wait_reason = ""
    for line in reversed(listener._last_detail_log):
        if line.startswith("BLOCKER:"):
            wait_reason = line.replace("BLOCKER:", "").strip()
            break

    return {
        "status": "healthy",
        "service": "placemint-combined-backend",
        "telegram": listener._worker_status.get("telegram"),
        "waitReason": wait_reason or None,
        "waitAttempt": listener._worker_status.get("waitAttempt", 0),
        "monitoredGroups": listener._worker_status.get("groups", 0),
        "lastKeepaliveAt": listener._worker_status.get("lastKeepaliveAt"),
        "keepalivePings": listener._worker_status.get("keepaliveOk", 0),
        "supabaseConfigured": db.url is not None,
    }

@app.post("/send-message")
async def send_message_route(req: SendMessageRequest):
    if not listener.WORKER_SECRET or req.apiKey != listener.WORKER_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if not listener.client or not await listener.client.is_user_authorized():
        raise HTTPException(status_code=503, detail="Telegram not authorized")
        
    try:
        await listener.client.send_message("me", req.text)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# PLAYWRIGHT FALLBACK FILLER ENGINE

async def run_form_fill_job(job_id: str):
    try:
        job = db.get_job(job_id)
        if not job:
            print(f"[PlaywrightService] Error: Job {job_id} not found in database")
            return
            
        db.update_job(job_id, {"status": "running", "updated_at": datetime.utcnow().isoformat()})

        form_url = job.get("form_url") or job.get("formUrl")
        profile = job.get("profile_data") or job.get("profileData") or {}
        
        # Hard Rule: Call-triggered jobs can never auto-submit
        trigger_source = job.get("trigger_source") or job.get("triggerSource") or "dashboard"
        is_call = (trigger_source == "call")
        
        auto_submit = False if is_call else (job.get("auto_submit") or job.get("autoSubmit") or False)

        success, error_msg, filled_data = await fill_google_form_playwright(job_id, form_url, profile, auto_submit)
        
        # Determine status: if call triggered, success yields filled_pending_review instead of completed
        status = "filled_pending_review" if (success and is_call) else ("completed" if success else "failed")
        
        update_data = {
            "status": status,
            "filled_data": filled_data,
            "updated_at": datetime.utcnow().isoformat()
        }

        if success:
            public_service_url = os.getenv("PUBLIC_URL") or os.getenv("RAILWAY_STATIC_URL") or "http://localhost:8080"
            public_service_url = public_service_url.rstrip("/")
            update_data["screenshot"] = f"{public_service_url}/screenshots/{job_id}.png"
        else:
            update_data["error"] = error_msg

        db.update_job(job_id, update_data)
        print(f"[PlaywrightService] Job {job_id} finished with status: {status}")

        # Post Telegram Alert if call-triggered
        if is_call and listener.WORKER_SECRET:
            try:
                review_url = f"{os.getenv('NEXT_PUBLIC_APP_URL') or 'http://localhost:3000'}/dashboard/forms?jobId={job_id}"
                message = f"📞 PlaceMint AI Form Alert: Fallback Form Job for {form_url} has been filled successfully via Playwright! Please open the dashboard to review and click Submit Now to complete application: {review_url}"
                if not success:
                    message = f"❌ PlaceMint AI Form Alert: Fallback Playwright Form Job failed for {form_url}. Error: {error_msg}"
                
                if listener.client and await listener.client.is_user_authorized():
                    await listener.client.send_message("me", message)
            except Exception as tg_err:
                print(f"[PlaywrightService] Failed to send Telegram DM alert: {tg_err}")

    except Exception as e:
        print(f"[PlaywrightService] Exception in run_form_fill_job: {e}")
        db.update_job(job_id, {
            "status": "failed",
            "error": str(e),
            "updated_at": datetime.utcnow().isoformat()
        })

async def fill_google_form_playwright(job_id: str, form_url: str, profile: dict, auto_submit: bool) -> tuple[bool, str, dict]:
    filled_data = {}
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
            )
            context = await browser.new_context(
                viewport={"width": 1280, "height": 1024},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            
            print(f"[PlaywrightService] Navigating to {form_url}...")
            await page.goto(form_url, wait_until="networkidle", timeout=60000)
            
            max_pages = 5
            page_idx = 0
            
            while page_idx < max_pages:
                page_idx += 1
                await page.wait_for_timeout(2000)
                
                if "signin" in page.url or await page.locator("text=Sign in to Google").count() > 0:
                    await browser.close()
                    return False, "This Google Form requires Google Account sign-in to access.", filled_data

                questions = await page.locator("div[role='listitem'], div.geS5ne").all()
                if not questions:
                    questions = await page.locator("div.Qr7O5e").all()
                
                print(f"[PlaywrightService] Found {len(questions)} question block(s) on page {page_idx}")
                
                for q in questions:
                    label_el = q.locator("div.M7eCdd, span.M7eCdd, div.F9n8Fb, div[role='heading']")
                    if await label_el.count() > 0:
                        label_text = await label_el.first.inner_text()
                    else:
                        label_text = await q.inner_text()
                    
                    label_text_clean = label_text.split("\n")[0].strip()
                    label_text_lower = label_text_clean.lower()
                    if not label_text_lower:
                        continue
                    
                    # Fuzzy match fields
                    profile_value = None
                    if any(x in label_text_lower for x in ["name", "full name", "candidate name"]):
                        profile_value = profile.get("fullName")
                    elif any(x in label_text_lower for x in ["email", "mail", "email id"]):
                        profile_value = profile.get("email")
                    elif any(x in label_text_lower for x in ["phone", "contact", "mobile", "number", "tel"]):
                        profile_value = profile.get("phone")
                    elif any(x in label_text_lower for x in ["cgpa", "gpa", "pointer", "marks"]):
                        profile_value = profile.get("cgpa")
                    elif any(x in label_text_lower for x in ["branch", "department", "stream", "course"]):
                        profile_value = profile.get("branch")
                    elif any(x in label_text_lower for x in ["graduation", "year of pass", "passing year", "batch"]):
                        profile_value = profile.get("graduationYear")
                    elif any(x in label_text_lower for x in ["resume", "cv", "drive link", "upload"]):
                        profile_value = profile.get("resumeLink")
                    elif "github" in label_text_lower:
                        profile_value = profile.get("githubLink")
                    elif "linkedin" in label_text_lower:
                        profile_value = profile.get("linkedInLink")
                    elif any(x in label_text_lower for x in ["roll", "reg", "usn"]):
                        profile_value = profile.get("rollNumber")
                    
                    if not profile_value:
                        continue

                    # Fill inputs
                    text_inputs = q.locator("input[type='text'], input[type='email'], textarea")
                    if await text_inputs.count() > 0:
                        input_el = text_inputs.first
                        await input_el.click()
                        await page.keyboard.press("Control+A")
                        await page.keyboard.press("Backspace")
                        await input_el.fill(str(profile_value))
                        filled_data[label_text_clean] = {"label": label_text_clean, "value": str(profile_value)}
                        continue
                    
                    # Radio
                    radios = q.locator("div[role='radio'], input[type='radio']")
                    if await radios.count() > 0:
                        radio_count = await radios.count()
                        for r_idx in range(radio_count):
                            radio_el = radios.nth(r_idx)
                            parent_text = await radio_el.evaluate("el => el.parentElement.innerText || el.getAttribute('aria-label')")
                            parent_text = (parent_text or "").strip().lower()
                            val_lower = str(profile_value).lower()
                            if val_lower in parent_text or parent_text in val_lower:
                                await radio_el.click()
                                filled_data[label_text_clean] = {"label": label_text_clean, "value": str(profile_value)}
                                break
                        continue

                    # Checkbox
                    checkboxes = q.locator("div[role='checkbox'], input[type='checkbox']")
                    if await checkboxes.count() > 0:
                        cb_count = await checkboxes.count()
                        for cb_idx in range(cb_count):
                            cb_el = checkboxes.nth(cb_idx)
                            parent_text = await cb_el.evaluate("el => el.parentElement.innerText || el.getAttribute('aria-label')")
                            parent_text = (parent_text or "").strip().lower()
                            val_lower = str(profile_value).lower()
                            if val_lower in parent_text or parent_text in val_lower:
                                checked_attr = await cb_el.get_attribute("aria-checked")
                                if checked_attr != "true":
                                    await cb_el.click()
                                filled_data[label_text_clean] = {"label": label_text_clean, "value": str(profile_value)}
                                break
                        continue

                next_btn = page.locator("div[role='button']:has-text('Next')")
                submit_btn = page.locator("div[role='button']:has-text('Submit')")

                if await submit_btn.count() > 0:
                    if auto_submit:
                        await submit_btn.first.click()
                        await page.wait_for_timeout(3000)
                    break
                elif await next_btn.count() > 0:
                    await next_btn.first.click()
                    await page.wait_for_timeout(2000)
                else:
                    break
            
            # Save screenshot
            screenshot_path = f"/app/screenshots/{job_id}.png"
            await page.screenshot(path=screenshot_path, full_page=True)
            await browser.close()
            return True, "", filled_data
            
    except Exception as e:
        return False, str(e), filled_data

@app.post("/fill-form")
async def trigger_form_fill(req: JobRequest, background_tasks: BackgroundTasks):
    job = db.get_job(req.jobId)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Queue as background task
    background_tasks.add_task(run_form_fill_job, req.jobId)
    return {"message": "Job queued successfully", "jobId": req.jobId}
