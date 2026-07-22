"""Local dev override — SQLite file-based (persists giữa các lần chạy),
dùng khi máy chưa cài Postgres. KHÔNG dùng cho production/CI.
"""
from .dev import *  # noqa: F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
