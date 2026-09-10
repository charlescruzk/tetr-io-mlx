// js/modes.js — pure game-logic, no DOM. See PLAN.md Phase 8.
//
// Dual-export: loadable via <script> in the browser (attaches to
// window.Tetris.Modes) and via require() in Node for tests/run.js.
(function (root) {
  'use strict';

  const Modes = {
    // TODO(qwen, Phase 8): fill in per SPEC.md "Modes" and "Difficulty".
    //
    // DIFFICULTY: { easy: { startLevel, ... }, normal: {...}, hard: {...} }
    DIFFICULTY: {},

    // CONFIGS: { classic: {...}, marathon: {...}, sprint: {...} }
    // Each mode config should describe (at minimum): whether gravity ramps
    // with level (marathon: yes, classic/sprint: no), and a checkWin(state)
    // / checkLoss(state) pair (or equivalent) that game.js can call each
    // tick — e.g. sprint wins the instant totalLinesCleared === 40.
    CONFIGS: {},

    // getConfig(modeName, difficultyName) -> a resolved config object
    // combining CONFIGS[modeName] with DIFFICULTY[difficultyName]'s
    // starting level/gravity.
    getConfig(modeName, difficultyName) {
      throw new Error('Modes.getConfig not implemented — see PLAN.md Phase 8');
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Modes;
  } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.Modes = Modes;
  }
})(typeof window !== 'undefined' ? window : globalThis);
