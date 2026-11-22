"""The badge claim: one at a time. A phone sign-up waits for the next unregistered badge tapped at any station."""
import os
import secrets
import time
from dataclasses import dataclass

CLAIM_SECONDS = float(os.environ.get("TAPIN_CLAIM", "60"))   # 30 s was too short in practice: taps landed seconds late
_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # no 0/O/1/I


@dataclass
class Claim:
    code: str
    person_id: int
    expires: float
    note: str = ""   # "owned": someone tapped a badge that already belongs to a person (the phone says so)


current: "Claim | None" = None
finished: dict = {}  # code -> "claimed"


def new_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(6))


def waiting() -> "Claim | None":
    if current and time.monotonic() < current.expires:
        return current
    return None


def start(person_id: int) -> Claim:
    global current
    current = Claim(new_code(), person_id, time.monotonic() + CLAIM_SECONDS)
    return current


def finish(claim: Claim) -> None:
    global current
    finished[claim.code] = "claimed"
    if current is claim:
        current = None


def note(code: str) -> str:
    return current.note if current and current.code == code else ""


def status(code: str) -> str:
    if finished.get(code) == "claimed":
        return "claimed"
    if current and current.code == code and time.monotonic() < current.expires:
        return "waiting"
    return "expired"
