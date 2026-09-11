# Progress

Read this file first, every session. Update it at the end of every phase
(see CLAUDE.md). This is the single source of truth for "where did I leave
off" across sessions — don't rely on memory of a prior session, rely on
this file.

## Status: Phase 4a done (26/26 tests pass)

Phases 0–3 complete (Board, Piece, Randomizer). Phase 4a (core game loop)
is implemented, verified (`node tests/run.js` → 26 passed / 0 failed), and
committed. Next: Phase 4b (SRS wall kicks).

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
- [ ] Phase 4b — SRS wall kicks
- [ ] Phase 5 — Rendering
- [ ] Phase 6 — Input
- [ ] Phase 7 — Scoring + gravity curve (js/scoring.js written; tests pending)
- [ ] Phase 8 — Modes (js/modes.js written; tests pending)
- [ ] Phase 9 — UI screens
- [ ] Phase 10 — Audio
- [ ] Phase 11 — Visual polish pass
- [ ] Phase 12 — Final pass

## Needs human visual check

(nothing yet — phases 5, 6, 9, 10, 11 will add specific notes here)

## Blocked

(resolved 2026-09-10: the Bash safety-classifier outage that held up Phase
4a's verification + commit is cleared — `node tests/run.js` runs again, 26/26
pass. Nothing currently blocked.)

## Notes

- Phase 4a (game.js) is a dual-export UMD module so the same code runs in
  Node (tests) and the browser (window.Tetris.Game). Rotation is NAIVE for
  4a (tried at offset 0,0, no kick table); Phase 4b will add SRS kicks via
  Piece.getKicks and switch game.js's rotate() to iterate them (or fall back
   to naive, flagged here, per CLAUDE.md).
- 4a tests (in tests/run.js): fresh-game spawn/queue, move + wall failure,
   naive rotation in open space, lock-reset cap (200 grounded moves →
  lockResets caps at 15), lock-after-delay, hardDrop lands+scores+spawns,
  hold-once-then-blocked-until-lock, top-out (fill buffer rows 0–1 →
  spawnNext sets state=over/result=lost).
- The shared test/progress files (tests/run.js, PROGRESS.md) accumulate
  across phases, so each phase's own module file is committed in its own
  commit while run.js/PROGRESS.md ride along in the most-recent phase's
   commit — keeps "one commit per phase" for the module artifacts.
- js/scoring.js (Phase 7 module) and js/modes.js (Phase 8 module) are
  written but their test sections in tests/run.js are still TODO and the
  requires are still commented — those complete in Phases 7 and 8.
