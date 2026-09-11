# Progress

Read this file first, every session. Update it at the end of every phase
(see CLAUDE.md). This is the single source of truth for "where did I leave
off" across sessions — don't rely on memory of a prior session, rely on
this file.

## Status: browser click-through DONE (2026-09-11) — Phase 16 fixes are next

The page was finally opened in a real browser (Chromium via Playwright).
Phase 13's fix is CONFIRMED: Play works, a game starts, gravity/DAS/hard
drop/line clear/particles/pause-clock/settings-persistence all behaved
end-to-end. Three real bugs were found and root-caused — see PLAN.md
Phase 16 (16a next-queue overlap in render.js, 16b phone layout off-screen
because #touch-controls is outside the grid it's assigned to, 16c keyboard
pause never opens the overlay because main.js detects the transition
within a single frame). Do Phase 16 next. The "Needs human visual check"
flags for Phases 5/6/9/10/11/13 below are now largely discharged by that
click-through; 14 and 15 still need a re-check after 16b/16a land.

Phase 13 (the dead-menu-buttons regression) is FIXED and committed. There
were TWO root causes, not the one PLAN.md predicted: (1) the predicted
string-id/element mismatch in ui.js's `_on` (fixed: strings resolve via
getElementById; missing elements warn instead of throwing), and (2) a
second latent bug found by the NEW smoke tests — main.js's frame loop
called `T.UI.updateHUD` but ui.js defines `_updateHUD`, which would have
killed the render loop on the first frame in a real browser even after fix
(1). main.js's `boot()` is now try/catch-hardened: any init failure paints
a visible on-page error state instead of a silently dead page. The boot +
wiring paths are now covered by Node DOM-stub smoke tests in tests/run.js,
so this bug class has a regression guard.

Phase 14 (mobile responsive layout + touch controls) and Phase 15 (particle
effects) are both implemented, tested where Node can reach (59/59 green),
and committed.

What is NOT done without a human: actually opening index.html in a browser.
That gap is what let the Phase 13 regression ship in the first place. See
"Needs human visual check" below — the Phase 13/14/15 flags there are the
fastest pass (click Play, drive a game, resize to a phone viewport, watch
particles), and the older Phase 5/6/9/10/11 flags remain open too.

Phases 0–12 (the original build) history below is kept as-is for reference;
it is no longer the full picture of what's needed to call this done.

Phases 0–3 complete (Board, Piece, Randomizer). Phases 4a (core game loop),
4b (SRS wall kicks), 5 (rendering), 6 (input), 7 (scoring), 8 (modes), 9
(UI screens), 10 (audio), and 11 (visual polish) are implemented. 4a/4b/7/8
are verified (`node tests/run.js` → 45 passed / 0 failed) and committed.
Phases 5, 6, 9, 10, and 11 are browser-only modules: `node -c` clean + code
read back, but they have NO test-runner coverage, so they need a human to open
index.html and drive a real game (see "Needs human visual check" below).
Phase 11 added render-side juice (hard-drop board pulse, line-clear flash) and
CSS polish (monospace HUD numbers, a subtle scale-in on screen change, a
reduced-motion fallback); the model stays pure — game.js only bumps a
`hardDropAt` counter the renderer keys off. Phase 12 (the final pass) is a
verification-only closeout: a clean 45/45 run, a `js/` scan for `TODO(qwen…)`
markers (none remain), a one-commit-per-phase history (0–11), and a
`PROGRESS.md` account of every phase — nothing silently missing.

Note: the earlier session left Phase 3 (randomizer.js) and the Phase 7/8
modules (scoring.js, modes.js) implemented but UNCOMMITTED. This session
committed Phase 3 as a catch-up, then Phase 7 (scoring.js) and Phase 8
(modes.js), Phase 9 (index.html + style.css + ui.js + main.js), and Phase 10
(js/audio.js + the guarded event wiring in js/game.js). audio.js is now a full
Web Audio module — synthesized SFX + a looping music track, both gated by the
Settings toggles and applied live; js/game.js fires gameplay events through an
optional `onEvent` hook that audio.js installs, a no-op in Node tests so the
45/45 stays green. The full game-logic stack is committed and green.

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
- [x] Phase 7 — Scoring + gravity curve (js/scoring.js + 7 tests: line
      values at level 1, level scaling, level clamp-to-1, zero/unknown counts,
      soft/hard drop pts/cell, gravity monotonic-non-increasing + 50ms floor).
      Verified 39/39.
- [x] Phase 8 — Modes (js/modes.js + 6 tests: Sprint wins at exactly 40
      lines, Marathon levels every 10 lines, distinct starting gravities
      per difficulty, ramp flags, endless-no-target, unknown mode/difficulty
      throws). Verified 45/45.
- [x] Phase 9 — UI screens (index.html six screens + style.css neon layout;
      js/ui.js screen manager + mode-appropriate HUD + localStorage settings;
      js/main.js rAF loop. Needs human visual check — no test-runner coverage
      for DOM/canvas/events)
- [x] Phase 10 — Audio (js/audio.js: Web Audio synthesized SFX — move/rotate/
      soft-drop/hard-drop/lock/line-clear/Tetris/level-up/hold + menu/start/
      pause/win/game-over — and a looping arpeggio music track, both gated by
      the Settings toggles and applied live; js/game.js fires events through a
      guarded onEvent hook audio.js installs. Needs human visual check — no
      test-runner coverage for Web Audio).
- [x] Phase 11 — Visual polish pass. Render-side juice in js/render.js
      (a hard-drop briefly shakes the board via ctx.translate; a line clear
      flashes a fading white wash over the field — both keyed off model signals
      `g.hardDropAt` and `g.lastEvents`, so the model stays pure). CSS polish
      in style.css: a monospace/tabular font stack for the HUD + game-over
      numbers (`--font-mono`), a subtle scale-in on every screen change
      (`.screen-inner`), and a `prefers-reduced-motion` fallback that keeps the
      cross-fade but drops the scale. Needs human visual check — no
      test-runner coverage for canvas/CSS animation.
- [x] Phase 12 — Final pass. Verification-only closeout: full test run
      (`node tests/run.js` → 45 passed / 0 failed, covering Board, Piece,
      Randomizer, Scoring, Modes, and Game), a `js/` scan for `TODO(qwen…)`
      markers (none), a one-commit-per-phase history (Phases 0–11), all six
      screens present in index.html, and every phase above accounted for
      (done or truthfully flagged "needs human visual check"). README.md's
      how-to-run was checked and is unchanged (still "open index.html"), so it
      was not edited.
- [x] Phase 13 — Fix: dead menu buttons on fresh open (done this session).
      TWO root causes found and fixed, not just the predicted one:
      (1) As predicted, `_on(el, fn)` in ui.js called `.addEventListener`
      directly on raw string ids passed by `_bind()` ('btn-play', …) —
      a string has no addEventListener, so the first binding threw
      `TypeError`, aborting `_bind()`, and since main.js's `boot()` had no
      try/catch the whole boot died and the rAF loop never started. Fixed:
      `_on` now resolves string ids via `document.getElementById` (accepting
      both call shapes) and warns + no-ops on a missing element.
      (2) Found only by the NEW smoke tests (see below): main.js's frame
      loop called `T.UI.updateHUD(g)` but ui.js defines `_updateHUD` — in a
      real browser the very first rAF frame would have thrown and killed
      the render loop right after the buttons were fixed. Fixed the name in
      main.js. All other cross-module T.*.* calls were grepped and verified
      to exist on their targets.
      Hardening: main.js `boot()` is now wrapped in try/catch — on failure it
      console.errors AND paints a visible on-page error state (headline +
      stack) instead of leaving a silently dead page.
      Regression guard: tests/run.js gained 5 DOM-stub smoke tests
      (50 passed / 0 failed now): string-bound buttons get click listeners,
      clicking Play navigates, clicking a mode card starts a live game, one
      rAF frame runs cleanly with a live game, and a synthetic init failure
      paints the visible error state. These stub `document`/`window` in Node
      and exercise ui.js + main.js's real boot path — they are what caught
      the second bug.
- [x] Phase 14 — Mobile responsive layout + touch controls (done this
      session). New js/touch.js: a thin touch layer NEXT to input.js —
      touchstart/touchend/touchcancel with preventDefault() on each button,
      dispatching to the exact same g.move/g.rotate/g.softDrop/g.hardDrop/
      g.hold surface the keyboard uses (no duplicated game logic). Left/
      Right/Soft Drop get the same DAS/ARR hold-repeat (160ms/40ms, matching
      input.js); CW/CCW rotate, Hard Drop, and Hold are single-shot. A Pause
      button (#btn-pause-touch) lives in the mobile HUD row (touch-only via
      CSS). index.html gained the touch-controls markup (movement row +
      action row, CW primary) and the touch.js script tag (after input.js).
      style.css gained a (hover: none) and (pointer: coarse) media query —
      not a width check, per SPEC — that: shows the touch-only controls
      (display:none by default elsewhere), reflows the game screen
      vertically (HUD row → board → hold+next → touch controls) via grid +
      display:contents on the side panels, scales the board via CSS
      (height min(52vh,560px), width auto — the 300×600 canvas keeps its
      aspect, no horizontal scroll possible) with overflow-y:auto as a
      short-screen safety valve, gives stat tiles flex shares (no HUD
      overflow), and makes every menu button ≥44px full-width. Keyboard
      path untouched: input.js was not modified this phase.
      Test coverage: 4 new smoke tests (54 passed / 0 failed) drive
      touch.js's real listeners in Node — buttons bind, a CW press rotates
      via the live game, soft-drop repeats on the DAS/ARR schedule and
      stops on release, and disabled presses no-op.
- [x] Phase 15 — Particle effects / juice (done this session). New
      js/particles.js (browser-only, canvas-only, no library): a pooled,
      bounded square-particle system — a fixed ring buffer of 240 slots,
      oldest culled first, so the frame cost is capped no matter how fast
      effects trigger. Physics is evaluated analytically from spawn time
      (x0 + v*t, gravity 0.0009 px/ms²), so nothing integrates per frame and
      a janky/backgrounded frame can't destabilize it. Effects, all layered
      on top of Phase 11's shake + flash (which are unchanged):
      line-clear bursts (2 squares per occupied cell in the row's own piece
      colors, upward pop + gravity, ~0.5-0.8s fade), a bigger Tetris burst
      (3/cell, faster, longer-lived ~0.7-1.1s, white sparkles mixed in),
      and a hard-drop impact dust puff (~12 short-lived flecks) at the
      landing cells, drawn INSIDE the shake transform so bursts move with
      the field during the pulse.
      Minimal model additions (data the model already computes at those
      moments, in the existing payloads — no new event plumbing, model
      stays pure): the lineClear event in game.js now carries `rows` +
      `rowCells` (captured before the collapse, so particle colors are the
      cleared cells' actual letters), and hardDrop() stores a
      `hardDropLanding` snapshot (type/rotation/x/y) next to `hardDropAt`,
      which render.js keys off exactly as before.
      Test coverage: 3 new logic tests (lineClear rows/rowCells for a
      single clear and a Tetris, hardDropLanding matches the locked cells)
      + 2 pool smoke tests (bounded at MAX 240 with oldest-cull, expiry
      within max life + draw() reclaim) — 59 passed / 0 failed total.
      render.js/particles.js drawing itself has no test coverage (canvas).
- [x] Grade A closeout — every line of CLAUDE.md's Grade A bar re-checked
      against the actual repo state this session:
      tests/run.js exits 0 (59 passed / 0 failed) and covers Board, Piece,
      Randomizer, Scoring, Modes, Game, the Phase 13/14 UI+touch wiring, and
      the Phase 15 model signals + particle pool (all requires at the top of
      tests/run.js are uncommented with real test sections under them). No
      `TODO(qwen…)` markers remain anywhere in js/ (grep clean). All six
      screens exist in index.html; every menu path is exercised by the
      smoke tests where Node can reach it. Modes/difficulties selectable and
      provably distinct (Phase 8 tests). Settings persistence + audio
      muting are implemented and gated on the Phase 9/10 human flags below.
      Every phase 0-15 has an entry in this file (done, or honestly flagged
      needs-human-visual-check). git log is one commit per phase. The
      honest gap that remains: phases 5/6/9/10/11/13/14/15 involve canvas,
      CSS, real touch/keyboard events, or Web Audio, which no stub test can
      fully verify — those all carry specific "needs human visual check"
      notes below and should be clicked through by a human before calling
      this build done-done.
- [ ] Phase 16 — Fixes from the first real browser click-through: 16a
      next-queue slot overlap (render.js), 16b phone layout off-screen
      (#touch-controls outside the grid it's assigned to), 16c keyboard
      pause never opens the overlay (main.js same-frame transition check).
      All three root-caused in PLAN.md Phase 16.

## Needs human visual check

**Phase 15 (particles) needs a real browser check.** The pool math is
smoke-tested in Node, but the look/feel is not. Open index.html
(double-click, file://), start a game, and verify:

- **Line clear**: clearing 1-3 lines bursts small colored squares from the
  cleared row(s) — colors should match the pieces that were in those rows —
  popping up and falling back with gravity, fading out over ~0.5-0.8s.
- **Tetris (4 lines)**: noticeably bigger/longer/faster burst than a single
  clear, with white sparkles mixed in. It should read as clearly more
  exciting.
- **Hard drop**: a small dust puff at the piece's landing cells alongside
  the existing board shake; short-lived (~0.3s), subtle.
- **Fresh board never spawns particles**: starting a game must not show any
  burst (the hardDropAt/lastEvents reference guards), and particles never
  appear outside the board canvas.
- **Frame-rate sanity**: hold a fast game going (many hard drops + clears)
  on a phone-class device if possible — it must stay smooth; the particle
  count is hard-capped at 240 with oldest-first culling, so it cannot grow
  unbounded.

**Phase 14 (mobile + touch) needs a real device/dev-tools check.** The
dispatch and repeat logic is smoke-tested in Node, but the layout and touch
feel cannot be. In a browser, open dev tools' device toolbar (a phone
viewport, e.g. 390×844 with "touch" emulation, or a real phone via
file:// — note double-click won't exist there; any tap works) and verify:

- Home / Mode Select / Settings / Pause / Game Over reflow: full-width
  buttons, nothing overflows horizontally, targets feel ≥44px.
- On the game screen: HUD row (stat tiles + Pause button) above the board,
  hold+next row below it, two rows of touch buttons at the bottom. No
  horizontal scroll at 320px or 390px width; board keeps its 1:2 shape.
- Each touch control works: ← → move (tap-tap-tap and held for auto-repeat),
  ↓ repeats while held, ↻ rotates CW, ↺ CCW, Drop hard-drops, Hold swaps
  once per piece, Pause opens the overlay (and Resume still works from it).
- On the SAME page, desktop widths still show keyboard-only play: the touch
  buttons are hidden, arrow keys/Space/C behave exactly as before, and a
  narrow desktop WINDOW (no touch) still gets the keyboard layout — the
  breakpoint is (hover: none) and (pointer: coarse), not width.
- A touch laptop (pointer: fine but touch present) should NOT get the
  phone layout.

**Phase 13 (the dead-button fix) still needs a real click-test.** The root
causes are fixed and now covered by Node DOM-stub smoke tests, but a stub is
not a browser: no real event semantics, no real canvas, no CSS. A human
should open `index.html` by double-click (file://) and confirm:

- Home renders and **Play** navigates to Mode Select; **Settings** opens.
- Every button in the Phase 9 checklist below actually works end-to-end
  (mode cards start a game, Pause buttons, Settings Back returns to the
  right place, Retry/Main Menu from Game Over).
- The board animates (piece falls, HUD numbers update) — this specifically
  re-verifies the second bug (main.js calling `updateHUD` instead of
  `_updateHUD`), which only manifests in the running frame loop.

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

Phase 9 (index.html + style.css + ui.js + main.js) — now that main.js runs the
frame loop and ui.js wires the screens, the whole game is playable end-to-end
from `index.html`. No test-runner coverage for DOM/canvas/events, so a human
must open `index.html` (double-click, file://) and verify:

- **Navigation**: Home → Play → Mode Select → (pick a difficulty, click a mode
   card) → board. Back returns Home. Pause (Esc/P) → Resume / Restart /
   Settings / Quit. Settings "Back" returns to *where it was opened from*
    (Pause stays underneath when opened from Pause). Game Over → Retry / Main
   Menu. No dead buttons; no jarring instant swaps (screens cross-fade).
- **Pause actually halts**: while the Pause overlay is up, gravity, the lock
   timer, and the clock all freeze (the loop only ticks when state==='playing').
- **Settings persist**: toggle Music/SFX, reload the page — the toggles keep
   their state (localStorage key `tetrio-settings`). Toggling applies live.
- **HUD is mode-appropriate**: Classic shows Score/Lines/Time (no Level);
   Marathon shows Score/Lines/Level/Time; Sprint shows Lines as "n / 40" + Time.
- **Game over fires correctly**: top-out → Game Over screen with final stats;
   a Sprint win at 40 lines → "40 Lines!" with the final time as the headline.
- **Audio now works (Phase 10)**: SFX fire on their triggers and the music
   loop plays; see the Phase 10 block below.

Phase 10 (js/audio.js + js/game.js event hook) — audio is now live: the game
makes sound. No test-runner coverage for Web Audio, so a human must open
`index.html` (double-click, file://), click/press a key once to unlock the
AudioContext (browsers require a user gesture), and verify:

- **SFX fire on trigger**: moving / rotating / soft-dropping makes a blip;
   hard-dropping thunks; locking ticks; clearing 1–3 lines plays a short
   arpeggio; clearing 4 lines (a Tetris) plays a *bigger, longer* one; leveling
   up (Marathon, every 10 lines) rises; holding swaps with a soft blip.
- **Mute toggles actually silence**: turn SFX off in Settings — gameplay sounds
   stop immediately; turn Music off — the loop stops. Flip them back on and
   they return. Toggling applies live, no reload needed.
- **Persistence + gesture unlock**: reload the page with a toggle off — it stays
   off (localStorage `tetrio-settings`) and nothing plays until the first
   click/keypress (the AudioContext unlocks on that gesture, not on load, so
   there is no autoplay error in the console).
- **No console errors**: no Web Audio exceptions; the AudioContext is created on
   the first gesture and the music loop starts cleanly on the music bus.

Phase 11 (js/render.js + style.css) — visual polish, no test-runner coverage for
canvas animation or CSS transitions, so a human must open `index.html` (double-
click, file://) and confirm the juice reads well and nothing janks:

- **Hard-drop pulse**: hard-dropping (Space) briefly shakes the whole field —
   a small vertical translate on the board canvas that decays over ~130ms. The
   shake only fires on a real hard drop (keyed off `g.hardDropAt`), not on the
   first frame of a fresh board (the `!= null` guard).
- **Line-clear flash**: clearing 1–4 lines paints a white wash over the field
   that fades out over ~160ms (keyed off `g.lastEvents.type === 'lineClear'`).
   It should fire exactly once per clear and not linger.
- **HUD legibility**: the Score/Lines/Level/Time numbers and the game-over stat
   values now render in a monospace/tabular font, so digits don't jitter as they
   change. Confirm they still read cleanly at the default size.
- **Screen entrance**: navigating between screens (Home → Mode Select → Game,
   back/quit, pause, game over) plays a subtle scale-in on the screen's inner
   content alongside the opacity cross-fade. On a system with
   "reduce motion" on, the scale is dropped but the cross-fade remains.
- No `NaN`/`undefined` in the FX math (a fresh board must not pulse or flash);
   the flash/pulse alpha strings are always valid `rgba(...,0.0–0.25)`.

## Blocked

Nothing is blocked. The only recurring issue this build was the Bash
safety-classifier outage (`qwen3.8:27b-mlx is temporarily unavailable (timed
out)`), first seen during Phase 4a's verification + commit. It flapped
repeatedly (Phases 4b, 9, 10, and heavily during Phase 11/12), but every
time it recovered on retry, so it never held up a commit. Read-only tools
(Read/grep via the Edit tool) were unaffected, so CSS/JS edits could proceed
in the gaps. No feature was skipped or stubbed for it.

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
- js/scoring.js (Phase 7) and js/modes.js (Phase 8) are both done: their
  requires in tests/run.js are uncommented and both have real test sections
  (not just imported). The full game-logic stack is green.
- 7 scoring tests (in tests/run.js): line-clear points at level 1
  (100/300/500/800), level scaling (×5 at level 5), level clamped to min 1
  (level 0 / -3 = ×1), zero/unknown line counts score nothing, soft 1pt/cell
  + hard 2pts/cell, gravity 1000ms at level 1 and decreasing, and gravity
  monotonically non-increasing with a 50ms floor at very high levels.
- 6 modes tests (in tests/run.js): Sprint wins at exactly 40 lines (not at 39,
  still won past 40), Marathon levels up every 10 lines while Classic/Sprint
  hold their start level, each difficulty (Easy L1 / Normal L5 / Hard L9) maps
  to a distinct and strictly-decreasing starting gravity, Sprint doesn't ramp
  but Marathon does, Classic/Marathon are endless (no win target), and
  getConfig throws on an unknown mode or difficulty.
