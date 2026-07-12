-- Setup Tables for PlaceMint AI on Supabase PostgreSQL

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    image TEXT,
    role TEXT NOT NULL DEFAULT 'student',
    branch TEXT,
    cgpa NUMERIC(4,2),
    backlogs INT DEFAULT 0,
    graduation_year INT,
    google_calendar_connected BOOLEAN DEFAULT FALSE,
    google_calendar_refresh_token TEXT,
    google_calendar_access_token TEXT,
    google_calendar_expires_at BIGINT,
    telegram_chat_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Student Preferences Table
CREATE TABLE IF NOT EXISTS student_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    timezone TEXT DEFAULT 'Asia/Kolkata',
    language TEXT DEFAULT 'en',
    reminders_config JSONB DEFAULT '{"defaultOffsetsMinutes": [1440, 360, 60, 15], "sound": true, "vibration": true, "defaultEscalation": "normal", "smartAiMode": true}'::jsonb,
    notifications_config JSONB DEFAULT '{"browser": true, "email": false, "telegram": false, "inApp": true, "push": true, "phoneCall": false, "quietHoursEnabled": false, "quietHoursStart": "22:00", "quietHoursEnd": "07:00"}'::jsonb,
    calendar_config JSONB DEFAULT '{"autoSync": true, "autoCreateEvents": true, "autoUpdateEvents": true}'::jsonb,
    ai_config JSONB DEFAULT '{"strictness": "balanced", "urgencySensitivity": "medium", "spamSensitivity": "medium"}'::jsonb,
    placement_config JSONB DEFAULT '{"preferredCompanies": [], "preferredRoles": [], "dreamCompanies": [], "minPackageLakh": null}'::jsonb,
    automation_config JSONB DEFAULT '{"masterEnabled": true, "aiAutoReminders": true, "autoCalendarSync": true, "autoPriority": true, "duplicateMerge": true}'::jsonb,
    telegram_config JSONB DEFAULT '{"insightMessageCount": 25, "monitoredGroupIds": [], "autoInsights": true, "autoCreateDeadlines": true, "autoCreateReminders": true}'::jsonb,
    form_profile JSONB DEFAULT '{"fullName": "", "email": "", "phone": "", "cgpa": "", "branch": "", "graduationYear": "", "resumeLink": "", "githubLink": "", "linkedInLink": "", "rollNumber": "", "additionalInfo": ""}'::jsonb,
    gemini_api_key TEXT DEFAULT '',
    twilio_account_sid TEXT DEFAULT '',
    twilio_auth_token TEXT DEFAULT '',
    twilio_from_phone TEXT DEFAULT '',
    twilio_to_phone TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Deadlines Table
CREATE TABLE IF NOT EXISTS deadlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    deadline_date TIMESTAMP WITH TIME ZONE NOT NULL,
    eligibility TEXT DEFAULT '',
    type TEXT DEFAULT 'full-time',
    links TEXT[] DEFAULT '{}',
    salary TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    notes TEXT,
    confidence NUMERIC(3,2) DEFAULT 0.0,
    source_message_id TEXT,
    telegram_group_id TEXT,
    is_global BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Reminders Table
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    deadline_id UUID REFERENCES deadlines(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    minutes_before_deadline INT NOT NULL,
    offset_preset TEXT DEFAULT 'custom',
    channels TEXT[] DEFAULT '{"browser", "dashboard"}',
    sent BOOLEAN DEFAULT FALSE,
    title TEXT,
    message TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'active',
    snooze_until TIMESTAMP WITH TIME ZONE,
    enabled BOOLEAN DEFAULT TRUE,
    ai_suggested BOOLEAN DEFAULT FALSE,
    repeat_rule TEXT DEFAULT 'none',
    escalation_level TEXT DEFAULT 'normal',
    escalation_count INT DEFAULT 0,
    reminder_style TEXT DEFAULT 'balanced',
    last_notified_at TIMESTAMP WITH TIME ZONE,
    ai_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Calendar Event Maps Table
CREATE TABLE IF NOT EXISTS calendar_event_maps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    deadline_id UUID REFERENCES deadlines(id) ON DELETE CASCADE,
    google_event_id TEXT NOT NULL,
    dedup_key TEXT,
    etag TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, deadline_id),
    UNIQUE(user_id, dedup_key)
);

-- 6. Form Jobs Table
CREATE TABLE IF NOT EXISTS form_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    form_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    profile_data JSONB NOT NULL,
    auto_submit BOOLEAN DEFAULT FALSE,
    fill_method TEXT,
    screenshot TEXT,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Telegram Messages Table
CREATE TABLE IF NOT EXISTS telegram_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id TEXT NOT NULL,
    group_title TEXT,
    message_id TEXT NOT NULL,
    text TEXT NOT NULL,
    sender_name TEXT,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(group_id, message_id)
);

-- 8. Placement Insights Table
CREATE TABLE IF NOT EXISTS placement_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    telegram_message_id UUID REFERENCES telegram_messages(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    role TEXT,
    deadline TIMESTAMP WITH TIME ZONE,
    eligibility TEXT,
    links TEXT[] DEFAULT '{}',
    salary TEXT,
    extracted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    confidence NUMERIC(3,2) DEFAULT 0.0,
    status TEXT DEFAULT 'pending',
    snoozed_until TIMESTAMP WITH TIME ZONE,
    feedback TEXT,
    notes TEXT,
    deadline_id UUID REFERENCES deadlines(id) ON DELETE SET NULL,
    pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Notification Logs Table
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reminder_id UUID REFERENCES reminders(id) ON DELETE SET NULL,
    channel TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    escalation_level TEXT DEFAULT 'normal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. AI Automation Logs Table
CREATE TABLE IF NOT EXISTS ai_automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    summary TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. Telegram Auth Pendings Table
CREATE TABLE IF NOT EXISTS telegram_auth_pendings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    phone TEXT NOT NULL,
    phone_code_hash TEXT,
    step TEXT NOT NULL DEFAULT 'phone',
    auth_session_string TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_sent_at TIMESTAMP WITH TIME ZONE,
    send_count INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. Telegram Groups Table
CREATE TABLE IF NOT EXISTS telegram_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    username TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. Telegram Worker Sessions Table
CREATE TABLE IF NOT EXISTS telegram_worker_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL DEFAULT 'default',
    session_string TEXT,
    telethon_session_string TEXT,
    phone_number TEXT,
    telegram_username TEXT,
    display_name TEXT,
    connected_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 14. Worker Heartbeats Table
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL,
    groups_monitored INT DEFAULT 0,
    last_error TEXT,
    detail_log TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 15. Student Resumes Table
CREATE TABLE IF NOT EXISTS student_resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    ats_score INT DEFAULT 0,
    skills TEXT[] DEFAULT '{}',
    missing_skills TEXT[] DEFAULT '{}',
    suggestions TEXT[] DEFAULT '{}',
    company_compatibility JSONB DEFAULT '[]'::jsonb,
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 16. Push Tokens Table
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    platform TEXT DEFAULT 'web',
    user_agent TEXT,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 17. Broadcasts Table
CREATE TABLE IF NOT EXISTS broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    company TEXT,
    deadline TIMESTAMP WITH TIME ZONE,
    target_role TEXT DEFAULT 'student',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
