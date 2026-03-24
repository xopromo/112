#!/usr/bin/env python3
"""
Run this ONCE locally to generate your Telethon StringSession.
The session string is then saved as GitHub Secret TG_SESSION.

Usage:
    pip install telethon
    python tg_agent/gen_session.py
"""

from telethon.sync import TelegramClient
from telethon.sessions import StringSession

print("=" * 60)
print("Telethon Session Generator")
print("Get API_ID and API_HASH at: https://my.telegram.org/apps")
print("=" * 60)

api_id   = input("\nAPI ID:   ").strip()
api_hash = input("API Hash: ").strip()

with TelegramClient(StringSession(), int(api_id), api_hash) as client:
    session_string = client.session.save()

print("\n" + "=" * 60)
print("✅ Your session string (copy everything between the lines):")
print("-" * 60)
print(session_string)
print("-" * 60)
print("\nSave this as GitHub Secret: TG_SESSION")
print("KEEP IT SECRET — it gives full access to your Telegram account!")
