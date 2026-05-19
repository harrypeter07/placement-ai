import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SESSION_DIR = os.path.join(BASE_DIR, "sessions")


def get_session_path() -> str:
    """Absolute path for Telethon SQLite session (avoids cwd / corruption issues)."""
    os.makedirs(SESSION_DIR, exist_ok=True)
    name = os.getenv("SESSION_NAME", "placemint_session")
    return os.path.join(SESSION_DIR, name)
