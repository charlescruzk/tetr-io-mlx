// js/randomizer.js — pure game-logic, no DOM. See PLAN.md Phase 3.
//
// Dual-export: loadable via <script> in the browser (attaches to
// window.Tetris.Randomizer) and via require() in Node for tests/run.js.
(function (root) {
  'use strict';

  const Randomizer = {
    // createBag() -> an object with:
    //   next()      -> draws and returns the next piece type string,
    //                  refilling with a freshly shuffled bag of all 7
    //                  piece types when the current bag is empty
    //   peek(n)     -> returns the next n piece types WITHOUT consuming
    //                  them (must look ahead across a bag boundary if n
    //                  exceeds what's left in the current bag)
    //
    // TODO(qwen, Phase 3): implement. Each bag must be a shuffled
    // permutation of all 7 Piece.TYPES with no piece appearing twice in
    // the same bag.
    createBag() {
      throw new Error('Randomizer.createBag not implemented — see PLAN.md Phase 3');
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Randomizer;
  } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.Randomizer = Randomizer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
