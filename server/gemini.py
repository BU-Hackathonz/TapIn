"""Gemini icebreakers (Playbook: Gemini).

Runs in a background task after a checked_in event with a suggested group; it never blocks a tap. If the answer
arrives within 2 s the wall gets an `icebreaker` event and swaps it in for the template line. On timeout, error or a
missing key nothing is sent and the wall keeps the template line. Results are cached by (person, group).
The key lives in .env on the server only and is sent only to Google, as a header.
"""
import asyncio
import logging
import os
import re

import httpx

from . import db
from .hub import hub

log = logging.getLogger("tapin.gemini")

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
TIMEOUT_SECONDS = 2.0
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

cache: dict = {}   # (person_id, group_id) -> text
_tasks: set = set()
_warned = False


def api_key() -> str:
    return os.environ.get("GEMINI_API_KEY", "").strip()


def build_prompt(person, group) -> str:
    return (
        "Write one friendly, specific icebreaker under 20 words. "
        f"Person: {person['name']}, skills {', '.join(person['skills'] or []) or 'none listed'}. "
        f"Group: {group['working_on'] or 'something new'}, looking for {', '.join(group['looking_for'] or []) or 'anyone'}. "
        "No emojis, no exclamation marks."
    )


def clean(text: str) -> str:
    text = (text or "").strip().splitlines()[0] if (text or "").strip() else ""
    text = re.sub(r"[\U00010000-\U0010ffff☀-➿]", "", text)  # no emojis
    text = text.strip().strip("\"'").replace("!", ".").strip()
    return text[:160]


async def generate(prompt: str) -> str:
    """One Gemini call. Raises on any failure."""
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        r = await client.post(
            URL.format(model=MODEL),
            headers={"x-goog-api-key": api_key()},
            json={"contents": [{"parts": [{"text": prompt}]}]},
        )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]


async def icebreaker(person_id: int, group_id: int) -> None:
    global _warned
    key = (person_id, group_id)
    text = cache.get(key)
    if text is None:
        if not api_key():
            if not _warned:
                log.warning("GEMINI_API_KEY not set; wall keeps the template icebreaker line")
                _warned = True
            return
        if db.pool is None:
            return
        person = await db.pool.fetchrow("SELECT name, skills FROM people WHERE id=$1", person_id)
        group = await db.pool.fetchrow("SELECT working_on, looking_for FROM groups WHERE id=$1", group_id)
        if person is None or group is None:
            return
        try:
            text = clean(await asyncio.wait_for(generate(build_prompt(person, group)), TIMEOUT_SECONDS))
        except Exception as exc:  # timeout, HTTP error, bad shape: keep the template line
            log.info("icebreaker skipped person=%s group=%s: %s", person_id, group_id, type(exc).__name__)
            return
        if not text:
            return
        cache[key] = text
    await hub.broadcast("icebreaker", {"person_id": person_id, "group_id": group_id, "text": text})


def spawn(person_id: int, group_id: int) -> None:
    """Fire and forget; keep a reference so the task is not garbage collected."""
    task = asyncio.create_task(icebreaker(person_id, group_id))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
