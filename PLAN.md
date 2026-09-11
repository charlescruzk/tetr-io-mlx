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
