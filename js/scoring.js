// js/scoring.js — pure game-logic, no DOM. See PLAN.md Phase 7.
//
// Dual-export: loadable via <script> in the browser (attaches to
// window.Tetris.Scoring) and via require() in Node for tests/run.js.
(function (root) {
  'use strict';

  const Scoring = {
    // TODO(qwen, Phase 7): point values per SPEC.md "Scoring".
    // linesScore(numLinesCleared, level) -> points for clearing that many
    // lines at once at the given level (single/double/triple/tetris table
    // x level).
    linesScore(numLinesCleared, level) {
      throw new Error('Scoring.linesScore not implemented — see PLAN.md Phase 7');
    },

    // softDropScore(cells) -> points for a soft drop of that many cells
    softDropScore(cells) {
      throw new Error('Scoring.softDropScore not implemented — see PLAN.md Phase 7');
    },

    // hardDropScore(cells) -> points for a hard drop of that many cells
    hardDropScore(cells) {
      throw new Error('Scoring.hardDropScore not implemented — see PLAN.md Phase 7');
    },

    // gravityForLevel(level) -> ms per row-drop at that level (or frames,
    // your choice, just be consistent with how game.js consumes it).
    // Must be monotonically decreasing (faster) as level increases, then
    // cap around level 15-20 per SPEC.md. Document your formula/table as a
    // comment here.
    gravityForLevel(level) {
      throw new Error('Scoring.gravityForLevel not implemented — see PLAN.md Phase 7');
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Scoring;
  } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.Scoring = Scoring;
  }
})(typeof window !== 'undefined' ? window : globalThis);
