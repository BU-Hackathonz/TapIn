"""Badge log-in: a browser asks to be told who taps next. The next tap of a badge that already belongs to someone, at any
station, answers it (and still counts as a normal tap: check-in or group scan). One at a time, like the claim, so a tap
can never be handed to the wrong browser."""
import os
import secrets
import time
from dataclasses import dataclass

LOGIN_SECONDS = float(os.environ.get("TAPIN_LOGIN", "45"))
_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


@dataclass
class Login:
    code: str
    expires: float
    person_id: "int | None" = None


current: "Login | None" = None
done: dict = {}   # code -> person_id, kept so the browser's next poll sees it


def waiting() -> "Login | None":
    if current and current.person_id is None and time.monotonic() < current.expires:
        return current
    return None


def start() -> Login:
    global current
    current = Login("".join(secrets.choice(_ALPHABET) for _ in range(6)), time.monotonic() + LOGIN_SECONDS)
    return current


def finish(login: Login, person_id: int) -> None:
    global current
    login.person_id = person_id
    done[login.code] = person_id
    if current is login:
        current = None


def status(code: str) -> "tuple[str, int | None]":
    if code in done:
        return "done", done[code]
    if current and current.code == code and time.monotonic() < current.expires:
        return "waiting", None
    return "expired", None
