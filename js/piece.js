// js/piece.js — pure game-logic, no DOM. See PLAN.md Phase 2 (shapes) and
// Phase 4b (SRS wall kicks — can live here or in a new js/kicks.js, keep
// the same dual-export pattern if you split it out).
//
// Dual-export: loadable via <script> in the browser (attaches to
// window.Tetris.Piece) and via require() in Node for tests/run.js.
(function (root) {
    'use strict';

     // The 7 tetromino types. Enumerated up front so the SHAPES builder below
     // can iterate before the Piece object is materialized.
    const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

     // Spawn orientations, expressed as [x, y] cells in a per-piece bounding
     // box with origin at the box's top-left. Rotations R (1), 180 (2), L (3)
     // are generated below by repeatedly rotating the spawn state 90° clockwise,
     // so every piece's 4 states are true, consistent rotations of one another.
    const SPAWN = {
      I: [[0, 1], [1, 1], [2, 1], [3, 1]], // 4x4 box, horizontal in row 1
      O: [[0, 0], [1, 0], [0, 1], [1, 1]], // 2x2 box
      T: [[1, 0], [0, 1], [1, 1], [2, 1]], // 3x3 box, pointing up
      S: [[1, 0], [2, 0], [0, 1], [1, 1]],
      Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
      J: [[0, 0], [0, 1], [1, 1], [2, 1]],
      L: [[2, 0], [0, 1], [1, 1], [2, 1]],
      };
    const BOX = { I: 4, O: 2, T: 3, S: 3, Z: 3, J: 3, L: 3 };

     // 90° clockwise rotation within a `box`-sized grid (y increases downward):
     // (x, y) -> (box - 1 - y, x).
    function rotateCW(cells, box) {
      return cells.map(([x, y]) => [box - 1 - y, x]);
      }

     // Build SHAPES[type] = [state0, state1, state2, state3], each a list of 4
     // [x, y] cells. The O piece is rotation-invariant (its 2x2 maps onto
     // itself), so all 4 of its states are identical.
    const SHAPES = {};
    for (const type of TYPES) {
      const box = BOX[type];
      const states = [SPAWN[type].map((c) => c.slice())];
      for (let r = 1; r < 4; r++) {
        states[r] = rotateCW(states[r - 1], box);
        }
      SHAPES[type] = states;
      }

      // SRS wall-kick offset tables. States are 0=spawn,1=R,2=180,3=L. Each
      // entry is up to 5 [dx, dy] offsets tried in order when a naive rotation
      // (offset [0,0]) collides. The convention is the standard SRS reference
      // where +y is UP; game.js negates dy when applying, because this board's
      // y grows downward. JLSTZ share one table; the I piece uses its own. The
      // O piece never rotates, so callers skip it.
    const KICKS_JLSTZ = {
      '0->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
      '1->0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
      '1->2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
      '2->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
      '2->3': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
      '3->2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
      '3->0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
      '0->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, 2]],
       };
    const KICKS_I = {
      '0->1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
      '1->0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
      '1->2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
      '2->1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
      '2->3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
      '3->2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
      '3->0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
      '0->3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
       };

    const Piece = {
      TYPES: TYPES,

        // Shape data for all 7 tetrominoes, 4 rotation states each
        // (index 0 = spawn, 1 = R, 2 = 180, 3 = L — standard SRS naming).
      SHAPES: SHAPES,

        // getCells(type, rotation, x, y)
        //   type: one of Piece.TYPES. rotation: 0-3. x, y: board offset.
        //   Returns 4 [x, y] absolute board cells for that piece+rotation+pos.
      getKicks(type, from, to) {
        // SRS wall-kick offsets, tried in order when the naive rotation collides.
        // Offsets are [dx, dy] in the standard +y-up convention; callers on a
        // y-down board negate dy. JLSTZ share a table; I has its own; O never
        // rotates (empty). Falls back to the naive [0,0] if a key is missing.
        if (type === 'O') return [];
        const table = type === 'I' ? KICKS_I : KICKS_JLSTZ;
        const key = (((from % 4) + 4) % 4) + '->' + (((to % 4) + 4) % 4);
        const kicks = table[key];
        return kicks ? kicks : [[0, 0]];
      },

      getCells(type, rotation, x, y) {
        const states = SHAPES[type];
        if (!states) throw new Error('unknown piece type: ' + type);
        const state = states[((rotation % 4) + 4) % 4];
        return state.map((c) => [c[0] + x, c[1] + y]);
        },
      };

    if (typeof module !== 'undefined' && module.exports) {
      module.exports = Piece;
      } else {
      root.Tetris = root.Tetris || {};
      root.Tetris.Piece = Piece;
      }
})(typeof window !== 'undefined' ? window : globalThis);
