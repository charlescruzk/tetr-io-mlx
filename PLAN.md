# Build Plan — phase by phase

Work phases in order. Each phase ends with either its logic tests passing
(`node tests/run.js`) or a flagged "needs human visual check" note in
`PROGRESS.md`, then a git commit. Don't start the next phase with the
current one's checks unresolved.

## Phase 0 — Scaffold (mostly already done for you)

Confirm `index.html`, `style.css`, and the `js/` skeleton files already in
this repo load with no obvious errors. Don't rely on eyeballing the HTML as
your check — run `node -c` on every file in `js/`.

- **DoD**: `node -c` clean on every file in `js/`.
- Commit: "Phase 0: scaffold verified"

## Phase 1 — Board model (`js/board.js`)

Implement: empty board creation, cell get/set, collision check (piece
shape at a position vs. walls/floor/locked cells), lock a piece into the
board, detect full rows, clear full rows and shift rows above down, board
reset.

Add tests in `tests/run.js` beyond the starter ones already there:
whatever edge cases you find while implementing (e.g. collision exactly at
the floor, a row that's full except one cell should NOT clear).

- **DoD**: `node tests/run.js` passes, including Board tests.
- Commit: "Phase 1: board model"

## Phase 2 — Pieces (`js/piece.js`)

Implement: shape data for all 7 tetrominoes, 4 rotation states each
(spawn/R/2/L), a function returning the occupied cells for a given
piece+rotation+position.

- **DoD**: `node tests/run.js` passes, including Piece tests.
- Commit: "Phase 2: pieces"

## Phase 3 — Randomizer (`js/randomizer.js`)

Implement 7-bag: draw pieces one at a time, each bag a shuffled
permutation of all 7, auto-refill on empty, a way to peek the next N
pieces without consuming them.

- **DoD**: `node tests/run.js` passes, including Randomizer tests.
- Commit: "Phase 3: randomizer"

## Phase 4a — Basic rotation + gravity + movement (`js/game.js`)

Wire up a falling piece under gravity: left/right/soft-drop movement with
collision checks, basic rotation (no wall kicks yet — rotation just fails
if the naive rotated position collides), hard drop, lock delay with
reset-on-move capped at 15 resets, spawning the next piece from the
randomizer, top-out detection.

No visuals yet. Add whatever tests you can write without a DOM (e.g.
lock-delay reset counting, top-out given a pre-filled board) to
`tests/run.js`.

- **DoD**: logic tests pass. Flag in `PROGRESS.md` that full play-feel
  needs Phase 5+ before it's end-to-end checkable.
- Commit: "Phase 4a: core game loop"

## Phase 4b — SRS wall kicks (`js/piece.js` or a new `js/kicks.js`, keep
the dual-export UMD pattern if you add a new file)

Implement the standard 5-point wall kick table for JLSTZ pieces and the
separate I-piece kick table, tried in order on rotation failure before
giving up.

Add a couple of known-kick tests to `tests/run.js` (e.g. a T piece
rotating against a wall should succeed via a kick where the naive rotation
would fail).

- **DoD**: tests pass, OR — if genuinely stuck after a real attempt —
  apply the CLAUDE.md fallback and flag it in `PROGRESS.md`. Commit either
  way.
- Commit: "Phase 4b: SRS wall kicks" (or "...basic rotation only, flagged")

## Phase 5 — Rendering (`js/render.js`)

Canvas rendering of the board, the active piece, the ghost piece
(recomputed each frame/move), the next-queue (3 pieces), the hold box.
Guideline piece colors from SPEC.md.

No test-runner coverage possible (canvas/DOM). Static-check with `node -c`,
read it back once, then write a specific "needs human visual check" note in
`PROGRESS.md` — name exactly what to look at (correct colors, ghost tracks
the piece, next queue shows 3 pieces in order).

- **DoD**: static check clean, flag written.
- Commit: "Phase 5: rendering"

## Phase 6 — Input (`js/input.js`)

Keyboard handling for every control in SPEC.md, with DAS/ARR-style repeat
on left/right/soft-drop, hold (respecting once-per-piece), pause key.

Static-check + visual-check flag (what to test: hold-and-repeat feels
right, hold key works once per piece).

- **DoD**: static check clean, flag written.
- Commit: "Phase 6: input"

## Phase 7 — Scoring + gravity curve (`js/scoring.js`)

Implement the scoring table from SPEC.md and the level/gravity curve
(document your chosen frames-per-row formula or table as a comment — it
needs to feel meaningfully different across the three difficulty tiers).

Tests: point values for single/double/triple/tetris/soft/hard drop at a
couple of levels; gravity value decreases (speeds up) as level increases
and is monotonic. Uncomment the `Scoring` require at the top of
`tests/run.js`.

- **DoD**: `node tests/run.js` passes, including Scoring tests.
- Commit: "Phase 7: scoring and gravity curve"

## Phase 8 — Modes (`js/modes.js`)

Implement Classic / Marathon / Sprint as configs: win/loss conditions,
whether gravity ramps with level, difficulty presets (Easy/Normal/Hard
starting level+gravity) per SPEC.md.

Tests: Sprint reports "won" exactly at 40 lines cleared, not before/after;
Marathon's level increases every 10 lines; each difficulty maps to a
distinct starting gravity. Uncomment the `Modes` require at the top of
`tests/run.js`.

- **DoD**: `node tests/run.js` passes, including Modes tests.
- Commit: "Phase 8: game modes"

## Phase 9 — UI screens (`js/ui.js`)

Home, Mode Select, Pause, Settings, Game Over screens per SPEC.md, wired
to actually start/pause/restart/quit-to-menu the game and switch
modes/difficulty. Settings persist to `localStorage` and apply live.

Static-check + visual-check flag (what to test: every button goes where it
says, pause actually halts gravity/lock timers, settings survive a page
reload).

- **DoD**: static check clean, flag written.
- Commit: "Phase 9: UI screens"

## Phase 10 — Audio (`js/audio.js`)

Web Audio API synthesized SFX (list in SPEC.md) and a looping background
track, both gated by the Settings toggles.

Static-check + visual-check flag (what to test: each SFX fires on its
trigger, mute toggles actually silence, `AudioContext` is unlocked on a
user gesture rather than erroring — don't ignore that requirement).

- **DoD**: static check clean, flag written.
- Commit: "Phase 10: audio"

## Phase 11 — Visual polish pass

Apply the dark/neon styling from SPEC.md consistently across all screens:
transitions between screens, line-clear flash animation, hard-drop
feedback, HUD legibility. This is the "make it feel like tetr.io" pass —
revisit Phase 5 and Phase 9's output with fresh eyes.

Visual-check flag only (this phase is inherently visual — be specific in
the flag about what changed so a human can check it fast).

- **DoD**: flag written.
- Commit: "Phase 11: visual polish"

## Phase 12 — Final pass

Run `node tests/run.js` one more time — full pass required. Re-read
`PROGRESS.md`: everything either checked off or explicitly flagged as
blocked/needs-visual-check, nothing silently missing. Update `README.md`
only if how-to-run changed (it shouldn't — still just open `index.html`).

- **DoD**: clean test run, `PROGRESS.md` fully accounted for.
- Commit: "Phase 12: build complete"

## Phase 13 — Fix: Play does nothing on a fresh `index.html` open (do this first)

A real user opened `index.html` by double-click exactly as instructed and
**Play did nothing** — none of the menu buttons work. This slipped past
every prior phase because Phases 5/6/9/10/11 were all only *code-reviewed*
and flagged "needs human visual check," never actually opened in a browser
by an agent (no browser tool was available in those sessions). This is a
real regression in a build that PROGRESS.md currently calls "complete" —
treat it as priority zero, before any new feature work.

Likely root cause, from a static read of `js/ui.js`: `_bind()` calls the
`on(...)` helper with plain string element ids for most buttons
(`on('btn-play', ...)`, `on('btn-settings-home', ...)`, etc.), but `_on(el,
fn)` calls `el.addEventListener(...)` directly — it never resolves a string
id to an element via `document.getElementById`. The two other call sites in
`_bind()` (the difficulty-segment loop and the mode-card loop) pass real
DOM elements, which is why the mismatch wasn't obvious from a code read.
If that's right, the very first `on('btn-play', ...)` call throws a
`TypeError` synchronously, which aborts the rest of `_bind()` — and since
`main.js`'s `boot()` calls `T.UI.init()` with no try/catch, the exception
propagates all the way out and the `requestAnimationFrame` render loop
never even starts. That would explain every button being dead, not just
Play, and no visible error banner (the home screen renders fine from the
raw HTML/CSS regardless, since `#screen-home` has no `hidden` class by
default).

Verify this independently — don't just trust the paragraph above — and fix
whatever the real cause turns out to be:

- Confirm (or rule out) the `_on`/`_bind` mismatch by reading the current
  `js/ui.js` yourself.
- Fix it: `_on` should resolve a string argument via
  `document.getElementById` before attaching the listener (accept either a
  string id or an already-resolved element, since both call shapes are
  used).
- **Harden against the same failure class recurring silently**: wrap
  `boot()` in `main.js` in a try/catch that both `console.error`s the
  failure and renders a visible on-page error state (not a silently dead
  page) if initialization throws. A future init bug should fail loudly.
- If you have any way to actually load the page (a browser tool, or ask the
  user to confirm), use it — this is exactly the kind of bug that code
  review alone already missed once. If you don't, be explicit in
  `PROGRESS.md` that this still needs a real click-test, the same honest
  flag that should have been there before.

- **DoD**: root cause identified and fixed (not just papered over), the
  hardening above in place, `node tests/run.js` still green, and a specific
  "needs human visual check: click Play, confirm every button in
  PLAN.md/PROGRESS.md's existing Phase 9 checklist actually works" flag in
  `PROGRESS.md`.
- Commit: "Phase 13: fix dead menu buttons (ui.js _on/_bind mismatch)"

## Phase 14 — Mobile responsive layout + touch controls

Per SPEC.md's new "Mobile & touch" section. Two parts, both required:

1. **Responsive layout** for every screen (not just in-game) below a
   `(hover: none) and (pointer: coarse)` breakpoint, board scaled to fit
   width via CSS with its aspect ratio preserved, no horizontal scroll
   anywhere, ~44px minimum touch targets.
2. **On-screen touch controls** (Left, Right, Rotate CW, Rotate CCW, Soft
   Drop with hold-repeat, Hard Drop, Hold, Pause) wired to the same
   `g.move`/`g.rotate`/`g.softDrop`/`g.hardDrop`/`g.hold` surface `input.js`
   already uses — don't duplicate game-action logic, add a thin touch layer
   next to it. `touchstart`/`touchend` with `preventDefault()`.

No test-runner coverage (DOM/CSS/touch events). Static-check with `node -c`
on any new/changed JS, then a specific "needs human visual check" note in
`PROGRESS.md`: what to open dev tools' device toolbar to (a phone-width
viewport, e.g. 390×844), what to click-simulate for each touch control, and
that keyboard controls still work unchanged on desktop widths.

- **DoD**: static check clean, flag written, keyboard path untouched.
- Commit: "Phase 14: mobile responsive layout + touch controls"

## Phase 15 — Particle effects / juice

Per SPEC.md's new "Juice / particle effects" section: line-clear particles,
a bigger Tetris burst, a hard-drop impact puff — layered on top of Phase
11's existing shake/flash, pooled/bounded so it can't tank frame rate,
canvas-only (no new library, no CDN).

No test-runner coverage (canvas animation). Static-check + a specific
"needs human visual check" note: what triggers each effect, how long it
should last, that a fresh board never spawns particles, and a rough frame-
rate sanity check (should still feel smooth on a phone-class device, not
just desktop).

- **DoD**: static check clean, flag written.
- Commit: "Phase 15: particle effects"

## Phase 16 — Fixes from the first real browser click-through (2026-09-11)

The page was finally opened in a real browser (Chromium via Playwright,
served over localhost — identical code path to file://, plain script tags).
The good news first, so nobody re-verifies what's already confirmed:
Play → Mode Select → game start all work; gravity, DAS/ARR repeat, hard
drop scoring (+2/cell), a real line clear (500 × level 5 + drop points =
544, event carries rows/rowCells), the Tetris particle burst (looks right:
row-colored squares + white sparkles), pause freezing the clock, Settings
opened from Pause returning to Pause, and localStorage persistence were
all exercised end-to-end and behaved. `node tests/run.js` is 59/59.

Three real bugs were found. Each is root-caused below — verify it yourself
against the current file, then fix it.

**16a — Next queue draws all three pieces overlapping in the top slot
(Phase 5 bug, `js/render.js`).** `_drawNext` passes the slot index `i`
(0, 1, 2) as `rowSlot` to `_drawPieceCentered`, but that helper treats
`rowSlot` as a *cell* row (`oy = rowSlot * CELL + ...`), while the slot
border is drawn at `i * slot * CELL` (slot = 4 cells). So piece `i` is
drawn one cell lower than the previous one instead of one *slot* lower —
all three land in the first 4×4 box, overlapping, and slots 2–3 stay
empty. Fix: pass `i * slot` as the row (or change the helper's contract);
`_drawHold` passes 0 so it's unaffected. This is visible in every game
within one second of starting; it was never caught because no session had
looked at the page.

**16b — Phone layout is off-screen: touch controls sit beside the board,
not below it (Phase 14 bug, `index.html` + `style.css`).** In
`index.html`, `#touch-controls` is a *sibling* of `.game-layout` (both are
direct children of `#screen-game`), but the coarse-pointer CSS assigns it
`grid-area: touch` as if it were inside the `.game-layout` grid. Outside
the grid that declaration does nothing, so `#screen-game`'s flex row
(`.screen { display:flex; align-items:center; justify-content:center }`,
default `flex-direction: row`) places the touch bar *beside* the game
layout; the pair is wider than a 390px phone, and flex-centering pushes
`.game-layout` to x = −64 — board, HUD, and the pause button are all cut
off at the left edge. Measured at a 390×844 viewport with the coarse-
pointer rules applied. Fix: move `#touch-controls` inside `.game-layout`
so `grid-area: touch` actually applies (preferred — it's what the CSS
already assumes), or give `#screen-game` `flex-direction: column` in the
coarse block. While in there: `grid-area: board` is set on `#board-canvas`
but the grid item is its wrapper `.board-wrap` (not `display: contents`),
so the board is only landing in the right place by auto-placement luck —
put `grid-area: board` on `.board-wrap`. Note the board *does* scale
correctly under the coarse rules (220×439 at 390px wide, no vertical
scroll) — the scaling is right, the placement isn't.

**16c — Keyboard pause (Esc / P) freezes the game but never shows the
Pause overlay (Phase 9 bug, `js/main.js`).** `frame()` reads
`const before = g.state` at the top of the frame, but the keypress already
set `state = 'paused'` between frames, so by the next frame `before` is
already `'paused'` and the `if (before === 'playing')` branch — the only
place `T.UI.openPause()` is called — is skipped. Verified: 1.5s after
pressing P, `state === 'paused'` and the overlay is still hidden; the user
sees a frozen board with no menu. (The Pause *button* path works because
`ui.js` opens the overlay itself; only the keyboard path is broken.) Fix:
track the previous frame's state across frames (e.g. a module-level
`lastState`) and open the overlay on any `playing → paused` transition
regardless of what triggered it. Add a smoke test for it — the existing
"one rAF frame runs cleanly" test can't see this.

Not a bug, for the record: during the click-through, moves and a hold
fired that no automation sent — those were real keyboard events from the
owner pressing keys in the Playwright window. DAS/ARR was visibly correct
in the resulting stack traces.

- **DoD**: all three fixed, `node tests/run.js` green with a new test for
  16c, and an updated "needs human visual check" note naming exactly the
  three things to re-check (Next queue shows 3 separate pieces; phone
  layout at 390×844 with the touch bar *below* the board and nothing cut
  off; Esc/P shows the Pause overlay).
- Commit: "Phase 16: fix next-queue slots, phone layout nesting, keyboard pause overlay"

## Phase 17 — Mobile playability redesign (builder, superseded)

Recorded in PROGRESS.md only; the layout it described was never applied
because of a markup nesting error — see the Phase 17 post-mortem there and
Phase 18 below.

## Phase 18 — Mobile layout rebuilt and browser-verified, portrait + landscape

Done by the coordinator session after the owner reported Phase 17
unplayable on a phone. Root causes: a stray `</div>` in `index.html` that
closed `.game-layout` before `#touch-controls` (so the CSS grid-area never
applied — the Phase 16b fix's comment said "inside", the DOM said
"sibling"), and `.game-layout` having no width as a flex item of `.screen`
(so it shrink-wrapped to its content, 160px, collapsing the board to 2×2).

What shipped (details in PROGRESS.md's Phase 18 entry): fixed nesting,
two thumb clusters shared by both orientations, portrait grid with
`aspect-ratio`-driven board sizing and a tablet width cap, landscape with
height-derived board sizing and corner-pinned clusters, `safe center` +
scroll on menu screens, canvases rendered at devicePixelRatio, and two
`index.html` structure tests that fail on the Phase 17 markup.

Verification standard this phase set, which later phases should keep:
**measure the layout in a real browser at multiple sizes in both
orientations** (Playwright + the coarse-pointer rules lifted out of their
media query), not a code read. Check: no overflow, no element overlaps,
board ratio exact, tap targets ≥44px, and touch buttons driving the game
via real `TouchEvent`s.

- **DoD**: all of the above measured green at 390×844, 375×667, 320-tall,
  768×1024, 844×390, 667×375, 568×320, 1024×768; desktop unchanged;
  `node tests/run.js` green including the structure guards.
- Commit: "Phase 18: rebuild mobile layout (portrait + landscape), DPR-crisp canvases"

## Phases 19–23 — Presentation upgrade (SPEC.md "Presentation upgrade")

Read that SPEC.md section first; it carries the two rules every phase
here must obey (model stays pure; everything degrades gracefully) and the
frame budget. The verification standard is the one Phase 18 set:
**measure in a real browser** when a browser tool is available. When it is
not, the fallback is stricter than before — every phase here must have
Node-testable pure parts (dual-export, like board/piece/etc.) so the
sequence data, timing math, pool bounds, and animation timelines are
proven by `node tests/run.js`, and only the final look is left to a flag.

## Phase 19 — Music: a real sequencer and a composed track

Replace the `setInterval` arpeggio in `js/audio.js` with:

- `js/music.js` (dual-export, pure): the song data (per-voice patterns
  over ≥16 bars, note = {t, dur, midi|freq, vel}), tempo-for-level
  function, and a scheduler that, given `(now, lastScheduledUntil,
  lookahead)`, returns the notes to schedule and the new cursor — pure
  functions of time, no Web Audio inside, so they are unit-testable.
- The Web Audio side in `audio.js`: voices per SPEC (lead, bass, pad,
  percussion), master compressor, lookahead loop on `ctx.currentTime`,
  level-reactive tempo/layers, line-clear duck, stingers, softer menu
  variant. Existing SFX and toggles keep working.

Tests (`tests/run.js`): every note in every pattern is in range and within
its bar; pattern lengths are consistent across voices; tempo-for-level is
monotonic and capped; the scheduler never schedules a note twice and never
falls behind (simulate 60s of ticks with jitter); the duck envelope
returns to unity. Static-check `audio.js`, then a flag: what to listen for
(distinct voices, loop seamless at the bar boundary, tempo rising in
Marathon, duck on clear, stingers, menu variant, toggles live).

- **DoD**: tests green; no `setInterval` timebase left; flag written.
- Commit: "Phase 19: music sequencer + composed track"

## Phase 20 — Animated background

`js/background.js` (browser-only) + a pure `js/backgroundsim.js`
(dual-export): the simulation of drifting silhouettes (positions,
rotations, velocities, wrap-around, pulse decay) with no canvas inside,
so it's testable; the drawing side renders to a low-res offscreen canvas
and upscales. Hooked from `main.js`'s frame loop; reacts to `lastEvents`
and `level`; pauses on `visibilitychange`; static gradient under reduced
motion. CSS: background canvas fixed behind everything; screen
backgrounds become translucent panels so it shows through without hurting
board contrast.

Tests: silhouettes stay inside the wrap bounds after N steps; pulse decays
to 0; step cost — simulate 1000 steps in Node and assert it's well under a
budget (this is a smoke bound, not a benchmark, but it catches
accidental O(n²)); reduced-motion mode produces no motion (positions
unchanged across steps).

- **DoD**: tests green; static check; flag (subtle, never competes with
  the board; pulses on clears; freezes when the tab is hidden).
- Commit: "Phase 20: animated background"

## Phase 21 — Board and piece rendering upgrade

In `js/render.js` (+ a pure `js/fxtimeline.js`, dual-export, for the
timelines): cell sprite sheet (pre-rendered glossy cells per color, active
vs locked variants, drawn once per DPR change), glowing-outline ghost,
lock flash, the render-side line-clear animation (snapshot → flash →
dissolve → slide, ~220ms, driven by a pure timeline function of elapsed
time), hard-drop trail, floating popups (pooled), vignette + danger tint.
Particles get a couple of new spawners (lock sparkle, level-up ring).

Tests: timeline functions are pure and bounded (at t=0 initial state, at
t≥duration final state, monotonic slide offset); popup pool bounded;
snapshot/live switch-over happens exactly at the timeline end; the model
signals consumed are the existing ones (a grep-style test that `game.js`
gained no new presentation fields beyond what SPEC allows).

- **DoD**: tests green; static check; flag naming every effect and its
  trigger; frame cost sanity (`Render.frame` under a synthetic worst case —
  a Tetris + hard drop + popups — measured with `performance.now()` in the
  browser when available, else reasoned in the flag).
- Commit: "Phase 21: board and piece rendering upgrade"

## Phase 22 — Screens and UI polish

CSS-led (with tiny JS for count-ups and the HUD tick): title shimmer,
button/card micro-interactions and focus rings, mode-card icons, pause
backdrop blur with fallback, game-over count-up, HUD score tick and
level-up flash. All under reduced-motion guards.

- **DoD**: static check; every screen re-checked at the Phase 18 sizes
  (no overflow/overlap regressions — the mobile layout is not to be
  disturbed); flag written.
- Commit: "Phase 22: screens and UI polish"

## Phase 23 — A+ pass

Run everything: `node tests/run.js` green; `node -c` on all `js/`; grep
for stray `TODO`/`console.log`; confirm `index.html` still opens from
`file://` with zero console errors (favicon 404 excepted); confirm the
reduced-motion path and the hidden-tab pause; confirm music/SFX toggles;
confirm the mobile layout still measures exactly as Phase 18 recorded;
update `PROGRESS.md` so every phase 19–23 is done or truthfully flagged.
Then re-verify CLAUDE.md's Grade A bar AND the A+ addendum line by line.

- **DoD**: all of the above literally true.
- Commit: "Phase 23: A+ pass"
