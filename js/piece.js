// js/piece.js — pure game-logic, no DOM. See PLAN.md Phase 2 (shapes) and
// Phase 4b (SRS wall kicks — can live here or in a new js/kicks.js, keep
// the same dual-export pattern if you split it out).
//
// Dual-export: loadable via <script> in the browser (attaches to
// window.Tetris.Piece) and via require() in Node for tests/run.js.
(function (root) {
  'use strict';

  const Piece = {
    TYPES: ['I', 'O', 'T', 'S', 'Z', 'J', 'L'],

    // TODO(qwen, Phase 2): shape data for all 7 tetrominoes, 4 rotation
    // states each (index 0 = spawn, 1 = R (clockwise once), 2 = 180, 3 = L
    // (counter-clockwise once) — standard SRS naming). Each state is 4
    // [x, y] cells relative to a consistent per-piece origin. O piece's 4
    // states should all be identical (it doesn't visually rotate).
    SHAPES: {
      // I: [...], O: [...], T: [...], S: [...], Z: [...], J: [...], L: [...]
    },

    // getCells(type, rotation, x, y)
    //   type: one of Piece.TYPES. rotation: 0-3. x, y: board offset.
    //   Returns 4 [x, y] absolute board cells for that piece+rotation+pos.
    getCells(type, rotation, x, y) {
      throw new Error('Piece.getCells not implemented — see PLAN.md Phase 2');
    },

    // TODO(qwen, Phase 4b): wall kick tables.
    // KICKS_JLSTZ: standard 5-point offset table per rotation transition
    // KICKS_I: separate table for the I piece
    // getKicks(type, fromRotation, toRotation) -> array of [dx, dy] to try
    // in order after the naive rotation fails Board.collides.
    KICKS_JLSTZ: {},
    KICKS_I: {},
    getKicks(type, fromRotation, toRotation) {
      throw new Error('Piece.getKicks not implemented — see PLAN.md Phase 4b');
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Piece;
  } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.Piece = Piece;
  }
})(typeof window !== 'undefined' ? window : globalThis);
