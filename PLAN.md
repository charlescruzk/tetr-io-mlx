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
