# intro/

Two short intro animations for Tap In. Owner: Avery (@DxubleBTW).

Both are built from Tap In's own picture of a room: people are dots, connections are hairlines, tables are mint
rings, and "you" is raspberry with a ring around it. Sounds use the wall's pentatonic scale (C D E G A C): a bell
when someone arrives, a pluck for each new line, and a quick rising run when a group forms.

| Intro | Where | What happens | Length |
|---|---|---|---|
| `TapInIntro.signIn(container)` | Phone, before the sign-up form | A calm screen (wordmark, "Tap in. Find the table that needs you.", a faint room, a **Tap in** button). Pressing it puts you at the entrance and sends out three tap ripples. As the ripples pass, one person at each table turns mint and draws a line back to you. Then the screen slides up to the form. | ~1.5 s after the press |
| `TapInIntro.map(container)` | Wall, right after its Start click | The tables draw in and their labels type out. People walk in from the door and settle (one bell each), each group's lines draw with a rising run of plucks, and it fades into the live map underneath. | ~3–4 s |

Open `intro/demo.html` straight from disk to see both, with switches for sound, the wall's quiet mode and reduced
motion.

## Hooking it in (one line for the page owner)

Load the script, then await the intro before showing what's underneath. The live page keeps loading behind the
intro: nothing waits for it.

```html
<script src="/intro/intro.js"></script>
```

Phone (`phone/`, Yaovi): before showing the sign-up form.

```js
await TapInIntro.signIn(document.body);   // resolves at once if it already played this session
```

Wall (`wall/`, Jun): inside the existing Start click handler, after `Sound.start()`. Don't await it before the
`/api/graph` fetch or the WebSocket; let them start in parallel.

```js
TapInIntro.map(document.body, { quiet: Sound.muted });
```

The server must also serve `intro/` (for example a `StaticFiles` mount at `/intro`, the same way `wall/` and
`phone/` are served). That line belongs to the server owner.

## Rules it follows

- **Promise:** each call returns a Promise that resolves when the intro is finished and its layer has been
  removed. It resolves with `"done"`, `"skipped"`, `"reduced"` or `"already-played"`.
- **Skip:** any tap or key press during an intro jumps to the end.
- **Once:**
  - `signIn` plays once per browser session (it sets the `sessionStorage` key `tapin.intro.signin.v1`).
  - `map` plays once per page load, so a wall that reconnects never replays it.
- **Data:** `map` reads `/api/graph` once, with a 0.7 s timeout. It uses only counts: how many people are here and
  how big each group is. It never draws names or faces. If the read fails or the room is empty, it shows a small
  generic room.
- **Reduced motion:** under `prefers-reduced-motion`, it shows a 300 ms fade and plays no sound.
- **Sound:**
  - The quiet option (`{ quiet: true }`, or the wall's `Sound.muted`) turns sound off.
  - `{ sound: false }` also turns it off.
  - Both intros look the same with sound off.
- **Look:** near-black `#121212`, raspberry `#B0446E` for you, mint `#7FE0BD` for groups and tables, and grey for
  everyone else. IBM Plex Sans and Plex Mono if they're installed, system fonts otherwise. Flat, with hairline
  lines and square corners: no glows, gradients, blur or glass.
- **Light:**
  - Plain canvas and Web Audio, with no libraries and nothing from a CDN, so it works offline.
  - `devicePixelRatio` is capped at 2, and it targets 60 fps.
  - The audio voices are synthesised once, then replayed.

## Options

`signIn(container, opts)` and `map(container, opts)` both take:

| Option | Default | Meaning |
|---|---|---|
| `sound` | `true` | `false` mutes the intro |
| `quiet` | `false` | The wall's quiet mode: no sound |
| `reducedMotion` | the OS setting | Force the 300 ms fade on or off |
| `graphUrl` | `"/api/graph"` | `map` only. `null` means always use the generic room |
| `zIndex` | `50` | Stacking order of the intro layer |
