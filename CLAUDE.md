# Tetris-IO-MLX — Build Instructions (read this first)

This project is being built autonomously by the local model driving this
session (qwen3.8:27b-mlx via Claude Code). Follow `local-model-efficiency`
discipline: small verifiable phases, explicit decomposition, verify with the
checker not the vibe, flag and move on rather than grinding on one hard
feature.

## Read in this order, every session

1. `PROGRESS.md` — what's already done, what phase you're on, any open flags.
   Always start here, especially in a fresh session with no memory of prior
   sessions.
2. `SPEC.md` — full game design spec. What "done" looks like.
3. `PLAN.md` — the phase-by-phase build order and each phase's Definition of
   Done.

## Hard constraints

- No build step. No npm, no bundler, no framework. Vanilla HTML/CSS/JS +
  Canvas 2D + Web Audio API only.
- The pure game-logic files (`js/board.js`, `js/piece.js`,
  `js/randomizer.js`, `js/scoring.js`, `js/modes.js`) use a dual-export UMD
  pattern already scaffolded in each file — loadable via `<script>` in the
  browser AND via `require()` in Node for `tests/run.js`. Keep that pattern;
  don't switch to ES modules or add a build step.
- All other `js/*.js` files are browser-only, loaded via plain `<script>`
  tags in the exact order listed in `index.html`. Order matters — don't
  reorder without checking what depends on what.
- No external network calls, no CDN, no external audio/image files. Audio is
  synthesized at runtime in `audio.js` via the Web Audio API — nothing to
  download.
- Must run by double-clicking `index.html` (file:// protocol), no server
  required. If something you add breaks file:// (e.g. `fetch()` of a local
  file, ES `import`), stop and fix it before continuing.

## How to verify each phase

1. **Logic changes** (board/piece/randomizer/scoring/modes): run
   `node tests/run.js` from the project root. It must exit 0. Add/extend
   tests in `tests/run.js` for whatever you just built before marking a
   phase done — a phase without a new passing test is not done.
2. **Visual/interaction changes** (rendering, input, audio, UI screens): you
   likely have no way to see the rendered page yourself. Do a static check
   instead — `node -c js/whatever.js` for syntax errors, read the code back
   once for obvious mistakes — then write a one-line note in `PROGRESS.md`
   under "Needs human visual check" describing exactly what to look at.
   Don't claim a visual phase is verified when it wasn't actually seen.
3. After a phase's checks pass: update `PROGRESS.md` (mark it done, note
   anything flagged), then commit:
   `git add -A && git commit -m "<phase>: <one line>"`.
   One commit per phase, not one commit at the end.

## When you're stuck

Two features in this spec are genuinely hard and are allowed a fallback:

- **SRS wall kicks** (PLAN.md Phase 4b): if the full kick table isn't
  converging after a real attempt, ship basic rotation with no wall kicks
  (rotation just fails if the naive rotated position collides) and write a
  `PROGRESS.md` flag: "Phase 4b: wall kicks not implemented, basic rotation
  only." Don't loop on this indefinitely.
- **T-spin detection/scoring**: out of scope for the base build (see
  SPEC.md). Don't attempt it unless every other phase is done and verified.

Anything else that stalls after a real attempt: flag it in `PROGRESS.md`
under "Blocked" with what you tried, and move on to the next phase that
doesn't depend on it. A flagged gap is more useful than a silent one.

## Grade A bar — don't consider this finished before every line is true

This is a checklist, not a vibe. Go through it literally before calling the
build done — don't self-assess "feels good," verify each line against the
actual repo state.

- [ ] `node tests/run.js` exits 0, and it covers Board, Piece, Randomizer,
      Scoring, and Modes (the two commented-out `require`s at the top of
      `tests/run.js` are uncommented and have real tests under them, not
      just imported and ignored).
- [ ] No `// TODO(qwen...)` markers remain in `js/` except ones explicitly
      converted into a `PROGRESS.md` "Blocked" or fallback entry per "When
      you're stuck" above. An unimplemented TODO with no flag is a Grade A
      failure, full stop.
- [ ] Every control in SPEC.md's Controls section does what it says,
      including hold's once-per-piece lock and DAS/ARR repeat on
      move/soft-drop (not raw single-keydown).
- [ ] All three modes (Classic, Marathon, Sprint) and all three difficulty
      tiers are selectable and produce visibly different behavior
      (different starting gravity at minimum).
- [ ] All six screens in SPEC.md exist and are reachable in both
      directions (you can get to Settings from Pause and back to Pause, not
      just forward).
- [ ] Settings persist across a reload (`localStorage`) and audio actually
      mutes when toggled off.
- [ ] Every phase in `PLAN.md` has a matching entry in `PROGRESS.md` marked
      either done, needs-human-visual-check with a specific note, or
      blocked with what was tried. Nothing silently skipped.
- [ ] `git log` shows one commit per phase, not a single squashed commit at
      the end.

If any line is false, the build is not done — go fix that line, don't move
on. If a line is false because of an allowed fallback (wall kicks,
T-spin), that's fine — it just needs to be truthfully flagged, not silently
false.
