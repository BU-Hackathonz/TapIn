"""Reading .env values the way people write them. No dependencies, so the host checks run without a database driver."""


def env_value(raw: str) -> str:
    """KEY=1234, KEY="1234", KEY='1234' and KEY=1234  # note all mean 1234."""
    v = raw.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v.split(" #", 1)[0].split("\t#", 1)[0].strip()
