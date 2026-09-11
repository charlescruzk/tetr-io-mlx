// js/randomizer.js — pure game-logic, no DOM. See PLAN.md Phase 3.
//
// Dual-export: loadable via <script> in the browser (attaches to
// window.Tetris.Randomizer) and via require() in Node for tests/run.js.
(function (root) {
    'use strict';

      // The 7 tetromino types. Kept local so this module stays decoupled and
      // can load standalone.
    const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

      // Fisher–Yates shuffle (in place, uniform).
    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
         }
      return arr;
       }

    const Randomizer = {
      TYPES: TYPES,

         // createBag() -> a 7-bag generator:
         //   next()  -> draws and returns the next piece type string,
         //              refilling with a freshly shuffled permutation of all 7
         //              types when the current bag is empty.
         //   peek(n) -> returns the next n piece types WITHOUT consuming them,
         //              looking across a bag boundary when n exceeds what's left.
      createBag() {
        let queue = [];

          // Append a fresh shuffled bag of all 7 pieces to the end of the queue.
        function refill() {
          queue = queue.concat(shuffle(TYPES.slice()));
           }

        refill(); // one bag on hand so peek/next work immediately

        return {
          next() {
            const piece = queue.shift();
            if (queue.length === 0) refill();
            return piece;
             },

          peek(n) {
            const out = [];
            for (let i = 0; i < n; i++) {
              if (i >= queue.length) refill();
              out.push(queue[i]);
               }
            return out;
             },
             };
         },
        };

     if (typeof module !== 'undefined' && module.exports) {
      module.exports = Randomizer;
       } else {
      root.Tetris = root.Tetris || {};
      root.Tetris.Randomizer = Randomizer;
       }
})(typeof window !== 'undefined' ? window : globalThis);
