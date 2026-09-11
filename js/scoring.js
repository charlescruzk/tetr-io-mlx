// js/scoring.js — pure game-logic, no DOM. See PLAN.md Phase 7.
//
// Dual-export: loadable via <script> in the browser (attaches to
// window.Tetris.Scoring) and via require() in Node for tests/run.js.
(function (root) {
    'use strict';

       // Line-clear points, per SPEC.md "Scoring" (base build, no T-spin
       // bonus). Values scale by current game level (minimum 1).
    const LINE_POINTS = {
      0: 0,
      1: 100, // single
      2: 300, // double
      3: 500, // triple
      4: 800, // tetris (4 lines)
       };
    const SOFT_DROP_POINTS = 1; // per cell dropped
    const HARD_DROP_POINTS = 2; // per cell dropped

    const Scoring = {
      LINE_POINTS: LINE_POINTS,
      SOFT_DROP_POINTS: SOFT_DROP_POINTS,
      HARD_DROP_POINTS: HARD_DROP_POINTS,

          // linesScore(numLinesCleared, level)
          //   Points for clearing that many lines at once at `level`.
          //   Level is clamped to a minimum of 1.
      linesScore(numLinesCleared, level) {
        const lv = Math.max(1, level | 0);
        const base = LINE_POINTS[numLinesCleared] || 0;
        return base * lv;
          },

          // softDropScore(cells) / hardDropScore(cells) — 1 / 2 points per cell.
      softDropScore(cells) {
        return cells * SOFT_DROP_POINTS;
          },
      hardDropScore(cells) {
        return cells * HARD_DROP_POINTS;
          },

          // gravityForLevel(level) -> milliseconds between automatic row-drops
          // at that level. Monotonically decreasing (faster) as level rises,
          // then capped so the curve flattens near the top.
          //
          // Curve: 1000ms at level 1, decaying 15% per level
          //   ms = max(50, 1000 * 0.85^(level-1))
          // which yields ~1000/860/731/621/528/449/381/324/276/234ms ... and
          // floors at 50ms around level 20. Fast enough to feel "hard," slow
          // enough that Easy (level 1) stays gentle.
      gravityForLevel(level) {
        const lv = Math.max(1, level | 0);
        let ms = 1000 * Math.pow(0.85, lv - 1);
        if (ms < 50) ms = 50;
        return ms;
          },
         };

     if (typeof module !== 'undefined' && module.exports) {
      module.exports = Scoring;
        } else {
      root.Tetris = root.Tetris || {};
      root.Tetris.Scoring = Scoring;
        }
})(typeof window !== 'undefined' ? window : globalThis);
