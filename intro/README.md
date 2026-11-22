# intro/

Two short intro animations for Tap In. Owner: Avery (@DxubleBTW).

Both are built from Tap In's own picture of a room: people are dots, connections are hairlines, tables are mint
rings, and "you" is raspberry with a ring around it. Sounds use the wall's pentatonic scale (C D E G A C): a bell
when someone arrives, a pluck for each new line, and a quick rising run when a group forms.

| Intro | Where | What happens | Length |
|---|---|---|---|
| `TapInIntro.signIn(container)` | Phone, before the sign-up form | The phone's own header and raspberry button over a small room seen in 3D. When the page opens, a wave from the door lifts the floor into a skyline and the tables and people rise out of it. While you wait, the camera drifts, people tap the Entrance reader and walk to a seat, and links leap between people at a table. Pressing **Tap in** folds the button into you and drops you in at the door. Your tap sends a raspberry wave across the floor. As it reaches three people they turn mint and leap a line to you (+1, +2, +3), the table that needs you rises, and the camera cranes down onto you before the screen lifts away to the form. | ~2 s after the press |
| `TapInIntro.map(container)` | Wall, right after its Start click | In the wall's current theme. The camera starts at floor level by the Entrance. One tap on the reader sends a wave across the whole floor, which rises into a skyline and settles, and the tables lift out of it with typed labels. People tap in one after another, each tap rippling the floor, and walk to their seats. Each group's lines leap between them with a rising run of plucks, and links arc across tables. Meanwhile the camera cranes up from the door to straight overhead, where the map starts, and the big "here now" number counts what actually walked in. | ~4.5 s |

Open `intro/demo.html` straight from disk to see both, with switches for sound, the wall's quiet mode, reduced motion
and the wall theme.

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
- **Look:** each intro wears the theme of the page it plays on.
  - **Phone:** the phone site's own colours (`phone/style.css` variables when present: `#121212`, raspberry `#b8466f` for you, mint `#7fe0bd` for groups, grey for everyone else) and its header layout. The mint mono TAP IN and 28 px headline sit where the form's do, and the raspberry button is the phone's own.
  - **Wall:** whatever `wall/themes.js` has selected right now: Minimal (the default: white, black ink), Night, White, Sketch or Blueprint. It reads `Theme.c` and the body's CSS variables.
  - **Style:** flat, with hairline lines and square corners: no glows, gradients, blur or glass. "You" always has a ring as well as a colour.
- **Light:**
  - Plain canvas and Web Audio, with no libraries and nothing from a CDN, so it works offline. The 3D is a small
    hand-written perspective camera (no WebGL): hairlines and flat fills only.
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
| `target` | none | `map` only. A function returning where the page draws its room, so the intro can land on it (see below) |

## Handing over to David's host screen (`wall/host.html`)

On a page with a room-plan canvas `#room` and a side column `#side` (and optionally a bottom strip `#moment`),
the map intro:

- wears the page's own colours (`--bg`, `--green`, `--deep`, `--pink`, `--forest`, `--fg`, `--muted`, `--line`)
- frames its camera on the plan, and puts the door bottom left, where the Entrance station is
- paints the side column and strip in place from the first frame, and leaves them empty for the page's own numbers

With `target`, the last ~0.8 s glides the intro's overhead room onto the page's own tables and people, then
dissolves, so the live plan appears with everything already in place. `target` returns screen (CSS px) positions:

```js
// inside host.js, in the Start handler (layout is the RoomLayout instance)
TapInIntro.map(document.body, {
  quiet: Sound.muted,
  target: () => {
    const r = $("room").getBoundingClientRect();
    return {
      tables: [...layout.tables()].map(([id, t]) => ({ id, x: r.left + t.x, y: r.top + t.y, r: t.R })),
      people: layout.positions().map((p) => ({ x: r.left + p.x, y: r.top + p.y, table: p.gid })),
    };
  },
});
```

