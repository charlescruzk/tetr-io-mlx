# Tetris-IO-MLX — Game Design Spec

A modern single-player Tetris for the browser, styled after tetr.io: dark
theme, clean UI, fast and responsive. Runs entirely client-side from
`index.html` — no server, no build step, no external assets.

## Visual style

- Dark background (near-black, e.g. `#0e0f1a`), neon-accented UI
  (electric blue/purple accents for buttons/borders/glow), rounded cells
  with a subtle bevel or inner-shadow, smooth CSS transitions between
  screens (150-250ms fade/scale), no jarring instant screen swaps.
- Standard guideline piece colors: I = cyan, O = yellow, T = purple,
  S = green, Z = red, J = blue, L = orange. Use these consistently on the
  board, next queue, hold box, and ghost piece (ghost = same color at ~25%
  opacity, outline or translucent fill).
- Legible monospace or geometric sans font for HUD numbers
  (score/lines/time/level).

## Screens

1. **Home** — title/logo, "Play" (goes to mode select), "Settings",
   version/credits line. No "Quit" here — it's a browser tab, nothing to
   quit to.
2. **Mode select** — three cards/buttons: Classic, Marathon, 40 Line Sprint
   (see Modes below), each with a one-line description. A difficulty
   selector (Easy / Normal / Hard) applies to whichever mode is chosen.
   "Back" returns to Home.
3. **In-game** — board (10 wide x 20 visible tall, plus a small buffer of
   hidden rows above for piece spawn — see `Board.BUFFER` in `board.js`),
   next queue (next 3 pieces), hold box, score/lines/level/time HUD
   appropriate to the active mode.
4. **Pause overlay** (Esc or P during play) — Resume, Restart (same
   mode+difficulty), Settings, Quit to Main Menu. Pausing must actually
   stop the gravity/lock timers, not just hide the UI.
5. **Settings** (reachable from Home and from Pause) — Music on/off, SFX
   on/off. Persist to `localStorage`, apply immediately (no save button,
   toggles apply live). The pause-reachable version keeps the pause state
   underneath — its "Back" returns to Pause, not to the live board.
6. **Game over / results** — final stats for the mode played (score, lines,
   time, level for Classic/Marathon; time and completion status for
   Sprint), "Retry" (same mode+difficulty) and "Main Menu" buttons.

## Controls (guideline-standard, not remappable in the base build)

- Left / Right arrow: move
- Down arrow: soft drop (held = repeated soft drop, points per cell per
  Scoring below)
- Up arrow or X: rotate clockwise
- Z: rotate counter-clockwise
- Space: hard drop (instant, locks immediately)
- C or Shift: hold (swap current piece into hold slot; can't hold again
  until the next piece locks)
- Esc or P: pause / resume
- Movement uses a DAS/ARR-style repeat: first move on keydown, then a short
  initial delay (~150-170ms), then fast repeat (~30-50ms) while held. Don't
  ship raw single-keydown-only movement — it feels bad and isn't "modern."

## Core mechanics

- **Board**: 10 columns x 20 visible rows, plus hidden buffer rows above
  row 0 for piece spawn.
- **Pieces**: 7 standard tetrominoes (I, O, T, S, Z, J, L), each with 4
  rotation states.
- **Randomizer**: 7-bag — each bag is a shuffled permutation of all 7
  pieces, drawn one at a time; refill with a new shuffled bag when empty.
  The next-queue preview must always be able to show at least 3 upcoming
  pieces, pulling from the current or a freshly generated bag as needed.
- **Rotation**: SRS-style states (spawn, R, 2, L) with a wall-kick table for
  JLSTZ pieces and a separate kick table for the I piece. O piece has a
  single state (no rotation). See CLAUDE.md's "When you're stuck" for the
  fallback if the kick table proves too hard.
- **Lock delay**: piece locks ~500ms after it can no longer fall, resetting
  on successful move/rotate, capped at 15 resets so a piece can't be
  stalled forever.
- **Ghost piece**: translucent preview of where the current piece would
  land on hard drop, updates live as the piece moves/rotates.
- **Hold**: one hold slot, swappable once per piece — locks out further
  holds until the current piece locks into the board.
- **Line clear**: full rows flash/fade briefly (~150-200ms) before rows
  above shift down.
- **Scoring** (base build — no T-spin bonus):
  - Single: 100 x level, Double: 300 x level, Triple: 500 x level,
    Tetris (4 lines): 800 x level
  - Soft drop: 1 point per cell dropped
  - Hard drop: 2 points per cell dropped
  - "Level" here means current game level (see Modes), minimum 1
- **Game over**: top-out — a new piece can't spawn without immediately
  colliding.

## Modes

- **Classic** — endless play, fixed/gentle gravity that does not increase
  with level (one comfortable constant speed per difficulty tier — see
  Difficulty), scored, ends on top-out. Tracks score, lines, time.
- **Marathon** — endless play with the standard guideline level-up curve:
  level increases every 10 lines cleared, gravity speeds up per level
  (document your chosen frames-per-row formula/table as a comment in
  `scoring.js` — PLAN.md Phase 7), caps around level 15-20. Ends on top-out.
  Tracks score, lines, level, time.
- **40 Line Sprint** — race to clear 40 lines as fast as possible, timer
  counts up from 0, gravity fixed at the chosen difficulty's starting speed
  (does not ramp with level). Ends the moment the 40th line clears (final
  time is the headline stat) or on top-out (shown as incomplete).

## Difficulty

Applies as a starting-level / starting-gravity preset, selectable at mode
select, used by Classic, Marathon, and Sprint:

- **Easy** — starting level 1, slow gravity
- **Normal** — starting level 5, medium gravity
- **Hard** — starting level 9, fast gravity

Exact frame/ms values per level are a `PLAN.md` Phase 8 implementation
detail — the tiers need to feel meaningfully different, not hit exact
reference numbers.

## Audio

- No external audio files. All music and SFX are synthesized at runtime
  with the Web Audio API (oscillators/noise + gain envelopes).
- SFX needed: move, rotate, soft drop tick, hard drop, lock, line clear,
  Tetris (4-line clear — distinct/bigger sound), level up, hold, pause,
  game over.
- Music: a simple looping background track — a short repeating
  arpeggio/chord loop is enough, doesn't need to be sophisticated.
- Independent on/off toggles for music and SFX in Settings, persisted to
  `localStorage`, applied immediately.

## Explicitly out of scope for this build

- T-spin detection/scoring, back-to-back bonus, combo bonus
- Key rebinding
- Mobile/touch controls
- Multiplayer, leaderboards, accounts
- Any network calls
