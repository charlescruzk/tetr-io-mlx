# Progress

Read this file first, every session. Update it at the end of every phase
(see CLAUDE.md). This is the single source of truth for "where did I leave
off" across sessions — don't rely on memory of a prior session, rely on
this file.

## Status: Phase 6 done (needs human visual check)

Phases 0–3 complete (Board, Piece, Randomizer). Phases 4a (core game loop),
4b (SRS wall kicks), 5 (rendering), and 6 (input) are implemented. 4a/4b are
verified (`node tests/run.js` → 32 passed / 0 failed) and committed. Phases 5
and 6 are browser-only modules: `node -c` clean + code read back, but they have
NO test-runner coverage, so they need a human to open index.html and drive a
real game (see "Needs human visual check" below). Next: Phase 7 (Scoring).

Note: the earlier session left Phase 3 (randomizer.js) and the Phase 7/8
modules (scoring.js, modes.js) implemented but UNCOMMITTED. This session
committed Phase 3 as a catch-up (js/randomizer.js) before Phase 4a. The
Phase 7/8 modules stay uncommitted until their tests are added (Phases 7/8).

## Phase checklist

- [x] Phase 0 — Scaffold (node -c clean on all js/ files)
- [x] Phase 1 — Board model (all Board tests pass)
- [x] Phase 2 — Pieces (all Piece tests pass: 4 states/4 cells each, O
      invariant, offset + distinct-shape checks)
- [x] Phase 3 — Randomizer (7-bag next/peek; 4 tests pass). Committed this
      session as a catch-up (prior session left it uncommitted).
- [x] Phase 4a — Core game loop (js/game.js dual-export + 8 tests). Verified
      26/26. Two bugs fixed during audit: create() pre-fill off-by-one,
      holdUsed not set on the empty-slot hold branch.
- [x] Phase 4b — SRS wall kicks (js/piece.js getKicks + js/game.js rotate();
      6 new tests: canonical-table regression guard, I right-wall kick, JLSTZ
      floor kick, all-kicks-fail, O never rotates). Verified 32/32.
- [x] Phase 5 — Rendering (js/render.js: board + active + ghost + next×3 + hold;
      needs human visual check — no test-runner coverage for canvas/DOM)
- [x] Phase 6 — Input (js/input.js keyboard + DAS/ARR; needs human visual
      check — no test-runner coverage for DOM/event loop)
- [ ] Phase 7 — Scoring + gravity curve (js/scoring.js written; tests pending)
- [ ] Phase 8 — Modes (js/modes.js written; tests pending)
- [ ] Phase 9 — UI screens
- [ ] Phase 10 — Audio
- [ ] Phase 11 — Visual polish pass
- [ ] Phase 12 — Final pass

## Needs human visual check

Phase 5 (render.js) — no test-runner coverage possible (canvas/DOM). `node -c`
is clean and the code was read back, but a human must open `index.html` and
drive a real frame. Note: the requestAnimationFrame loop + screen wiring that
would make the canvases actually paint come in Phase 9, so for now the check
is a *unit* check — call `Tetris.Render.frame(Tetris.Game.create())` from the
console once the DOM is up, and verify:

- **Board canvas** (`board-canvas`, 300×600): faint grid on an empty field;
  locked cells fill in the correct guideline color (I cyan, O yellow, T purple,
  S green, Z red, J blue, L orange — matching the `--piece-*` CSS tokens).
- **Active piece** falls into view and is drawn at full opacity with a beveled edge.
- **Ghost** is the same piece dimmed (~30% alpha) exactly at its landing row
  (it tracks the active piece — when you move/rotate the active piece the ghost
  follows). Cells in the hidden 4-row spawn buffer are not drawn.
- **Next queue** (`next-canvas`, 120×360): 3 pieces, top = next to spawn,
  each centered in its own 4×4 slot, further-out ones slightly dimmer.
- **Hold box** (`hold-canvas`, 120×120): the held piece centered; it dims to
  ~35% while this piece's hold is spent and returns to full after the next lock.
- No `NaN`/`undefined` cell coordinates (would show as a black or misplaced
  block). Watch the very first piece — it spawns in the buffer and should only
  become visible as it falls past row 0.

Phase 6 (input.js) — no test-runner coverage possible (DOM key events + rAF
DAS/ARR loop). `node -c` is clean and the code was read back, but a human must
open `index.html`, focus the window, and play. input.js is wired to the game in
Phase 9's main.js, so for now this is a *unit* check — call
`Tetris.Input.bind(Tetris.Game.create())` from the console once the DOM is up,
then verify:

- **DAS/ARR feel**: holding ← or → moves one cell immediately, then holds ~160ms
   (DAS), then auto-repeats every ~40ms (ARR). Same for ↓ (soft drop). Releasing
  and re-pressing restarts the delay. The OS key-repeat must NOT cause faster
  or jittery movement (it's suppressed via `e.repeat`).
- **Single-shot keys**: rotate (↑ / X CW, Z CCW), hard drop (Space), and hold
  (C / Shift) each fire exactly once per physical press.
- **Hold once-per-piece**: the first hold swaps the piece; a second hold before
   the next lock is ignored; holding is allowed again after a lock.
- **Pause**: Escape / P pauses when playing and resumes when paused; it's a
   no-op when the game is over/won.
- **No stray default actions**: arrow keys don't scroll the page, Space doesn't
   scroll — game keys `preventDefault()`, everything else does.
- The held-key auto-repeat loop stops cleanly on `unbind()` / when disabled
  (Phase 9 gates it on the active screen).

## Blocked

(resolved 2026-09-10: the Bash safety-classifier outage that held up Phase
4a's verification + commit is cleared — `node tests/run.js` runs again, 26/26
pass. It flapped again during Phase 4b but recovered; nothing is blocked.)

## Notes

- Phase 4a (game.js) is a dual-export UMD module so the same code runs in
  Node (tests) and the browser (window.Tetris.Game). Rotation is now full SRS
  (Phase 4b): rotate() tries the naive [0,0] offset first, then each kick from
  Piece.getKicks(type, from, to) in order. The kick tables (JLSTZ shared, I its
  own, O none) live in js/piece.js; getKicks() was added there. 4b fixed 3
  copy-paste bugs in the JLSTZ 2->3 / 3->2 / 3->0 rows that the new
  canonical-table regression test (typed independently of the source) catches.
  No CLAUDE.md fallback was needed — SRS is fully implemented and tested.
- 4a tests (in tests/run.js): fresh-game spawn/queue, move + wall failure,
  naive rotation in open space, lock-reset cap (200 grounded moves →
  lockResets caps at 15), lock-after-delay, hardDrop lands+scores+spawns,
  hold-once-then-blocked-until-lock, top-out (fill buffer rows 0–1 →
  spawnNext sets state=over/result=lost).
- 4b tests (in tests/run.js): a canonical-table reference test that compares
  Piece.getKicks output for all 8 JLSTZ and 8 I transitions to independently
  typed values (the regression guard for the copy-paste bug); an I piece at
  the right wall that rotates via a kick where naive fails; a JLSTZ piece
  that kicks up off the floor; an all-kicks-fail case (field filled except the
  current footprint) that returns false and leaves the piece unchanged; and
  an O piece that never rotates.
- The shared test/progress files (tests/run.js, PROGRESS.md) accumulate
  across phases, so each phase's own module file is committed in its own
  commit while run.js/PROGRESS.md ride along in the most-recent phase's
  commit — keeps "one commit per phase" for the module artifacts.
- js/scoring.js (Phase 7 module) and js/modes.js (Phase 8 module) are
  written but their test sections in tests/run.js are still TODO and the
  requires are still commented — those complete in Phases 7 and 8.
