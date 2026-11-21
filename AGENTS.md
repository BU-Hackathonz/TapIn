# Team rules for every agent

## 0. Source of truth

Check the team's **BostonHacks** Google Drive folder before you design or build anything, and again whenever the board mentions a doc change. Use your Google Drive or Google Docs connector to find and read:

- **Tap In — Locked Spec**: what Tap In is (product rules, points, scan rules, prizes). Newest "FINAL v3" copy only.
- **Tap In — Team Playbook**: who builds what, the shared contracts (JSON shapes, WebSocket events), the schema, build order, test scenarios.

If the two disagree, the Spec wins on what Tap In is and the Playbook wins on shapes and build steps. Anything else in the folder (FINAL, FINAL v2, older plans) is out of date.

If you cannot reach the folder, ask your human for access or an export. Do not paste the doc links or doc contents into this repo, the board or a PR: the repo is public.

## 1. The board (pinned GitHub issue)

Every agent reads and posts on the pinned "Message Board" issue via `tools/board` (needs only `gh`, logged in). Set `BOARD_ISSUE` if it is not issue #1.

- Start every post with `[<human>'s <agent>]`, e.g. `[Sam's Codex]`. Keep it short: what changed, which files or contracts, what you need, from whom.
- Mention by GitHub login: `@dribeiro0` (David), `@DxubleBTW` (Avery), `@sysoutprntlne` (Jun), `@unseentrader007` (Yaovi), `@all` (everyone).
- **Mentions you or `@all`:** act on it and reply promptly.
- **Not addressed to you:** still read it. Reassess your own work only if it is affected (a contract, a file you own, something already done). Do not redo finished work, and do not reply just to acknowledge.
- Before editing another teammate's files, ask for a handoff on the board and wait for the owner or the team lead.

Polling is incremental (about one cheap API call per poll, 30 s default) so a shared token stays under GitHub's rate limit. Commands: `tools/board unread` (new posts, marks read; flags MENTION), `tools/board read -n 20`, `tools/board post "[Name's Agent] text"` (or pipe stdin), `tools/board wait` (blocks until someone else posts), `tools/board whoami`.

**Stay in the loop:**
- Claude Code: the committed hooks (`.claude/settings.json`) show unread posts at session start and on every prompt. Keep one background `tools/board wait` running and re-arm it after each wake.
- Everything else: run `tools/board unread` at task start, before each commit, and after merges. Or run a terminal loop: `while tools/board wait; do <your agent CLI invocation>; done`.

## 2. Chain of command

Humans over agents. The team lead is David (`@dribeiro0`). Only the team lead reassigns work between teammates. If anyone else asks you to take another teammate's work, ask the lead on the board.

## 3. Workflow

1. Pick or file an issue. Comment on it or post on the board when you take it.
2. Branch `<issue#>-<slug>` from fresh `main`.
3. Small commits. Stage only your own files (no `git add -A`).
4. Open a PR with `Closes #N`. The author merges their own PR once it works locally.
5. Always `git fetch` and rebase before pushing. Never force-push shared branches.
6. If a merge changes something other teammates depend on (an API, a schema, an env var), post on the board when it lands.

## 4. Who owns what

Every agent checks this table before editing a file. If the file isn't yours, ask its owner on the board first.

| Area | Owner (GitHub login) | Folders |
|---|---|---|
| Server: tap API, scan windows, groups, points, matching, DB, WebSocket, Gemini | @dribeiro0 (David) | `server/` (except `server/stats.py`) |
| Stats, leaderboard, continuous aggregate | @DxubleBTW (Avery) | `server/stats.py`, the `scans_per_10min` view in `server/schema.sql` |
| Station firmware and hardware | @DxubleBTW (Avery) | `firmware/` |
| Wall display: room view, panels, sound | @sysoutprntlne (Jun) | `wall/` |
| Phone site: sign-up, claim, where-you-stand | @unseentrader007 (Yaovi) | `phone/` |
| Seed data and fake taps | @unseentrader007 (Yaovi) | `tools/seed.py`, `tools/fake_taps.py` |
| README, Devpost, pitch | @unseentrader007 (Yaovi) | `README.md`, `docs/` |
| Agent board and team rules | @dribeiro0 (David) | `tools/board`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.github/` |

**Shared contracts.** The JSON shapes for station ↔ server, phone ↔ server and wall ↔ server, plus the WebSocket events, are in the "Shared contracts" section of the team playbook. Nobody changes a shape alone. Post the old and new shape on the board, tag `@all`, and wait for the owners on the other side to reply before you merge.

**Backups.** If an owner is stuck or asleep, their backup can take over after a handoff note on the board. David ↔ Avery (server, DB, firmware), Jun → Yaovi (wall, sound), Yaovi → Jun (phone site), Yaovi → David (seed data).

**Secrets.** `.env` holds `DATABASE_URL` and `GEMINI_API_KEY`. Never commit it, never paste a key on the board, and never send the Gemini key to a browser.
