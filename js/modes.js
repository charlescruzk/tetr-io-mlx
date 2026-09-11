// js/modes.js — pure game-logic, no DOM. See PLAN.md Phase 8.
//
// Dual-export: loadable via <script> in the browser (attaches to
// window.Tetris.Modes) and via require() in Node for tests/run.js.
(function (root) {
    'use strict';

        // The gravity curve lives in Scoring (js/scoring.js). Pull it in per
        // environment so this module loads standalone in both: require in
        // Node, the browser global otherwise (index.html loads scoring.js
        // before this file, so the global is present).
     const Scoring = (typeof module !== 'undefined' && module.exports)
        ? require('./scoring.js')
        : (root.Tetris && root.Tetris.Scoring);

        // Difficulty presets (SPEC.md "Difficulty"): each is a starting level.
        // The starting gravity is derived from that level via the Scoring
        // curve, so the three tiers feel meaningfully different.
     const DIFFICULTY = {
      easy: { startLevel: 1 }, // slow gravity
      normal: { startLevel: 5 }, // medium gravity
      hard: { startLevel: 9 }, // fast gravity
      };

        // Mode behaviours.
     const CONFIGS = {
      classic: {
        name: 'Classic',
        rampsWithLevel: false, // fixed/gentle gravity, never speeds up
        targetLines: null, // endless; ends on top-out
          },
      marathon: {
        name: 'Marathon',
        rampsWithLevel: true, // gravity speeds up as the level rises
        targetLines: null, // endless; ends on top-out
          },
      sprint: {
        name: '40 Line Sprint',
        rampsWithLevel: false, // fixed at the difficulty's starting speed
        targetLines: 40, // race: win the moment 40 lines clear
          },
        };

     const Modes = {
      DIFFICULTY: DIFFICULTY,
      CONFIGS: CONFIGS,

           // getConfig(modeName, difficultyName) -> a resolved config object
           // combining CONFIGS[modeName] with DIFFICULTY[difficultyName]'s
           // starting level/gravity, plus helpers game.js calls each tick.
      getConfig(modeName, difficultyName) {
        if (!CONFIGS[modeName]) throw new Error('unknown mode: ' + modeName);
        if (!DIFFICULTY[difficultyName]) throw new Error('unknown difficulty: ' + difficultyName);
        const mode = CONFIGS[modeName];
        const diff = DIFFICULTY[difficultyName];
        const startLevel = diff.startLevel;
        const startGravity = Scoring.gravityForLevel(startLevel);

        return {
          mode: modeName,
          label: mode.name,
          difficulty: difficultyName,
          startLevel: startLevel,
          startGravity: startGravity,
          rampsWithLevel: mode.rampsWithLevel,
          targetLines: mode.targetLines,

               // level the game is at after clearing `linesCleared` total
               // lines. Marathon climbs one level per 10 lines; the others
               // hold their starting level.
          levelForLines(linesCleared) {
            if (!mode.rampsWithLevel) return startLevel;
            return startLevel + Math.floor(linesCleared / 10);
               },

               // Win: the mode's target is met. Only Sprint has one.
          checkWin(state) {
            return mode.targetLines !== null && state.linesCleared >= mode.targetLines;
               },

               // Loss: a top-out has happened.
          checkLoss(state) {
            return !!state.gameOver;
               },

               // 'won' | 'lost' | null — evaluated once per tick. Win is checked
               // first so the 40th line wins even on the same tick a top-out
               // would register.
          checkResult(state) {
            if (this.checkWin(state)) return 'won';
            if (this.checkLoss(state)) return 'lost';
            return null;
               },
          };
         },
        };

     if (typeof module !== 'undefined' && module.exports) {
      module.exports = Modes;
        } else {
      root.Tetris = root.Tetris || {};
      root.Tetris.Modes = Modes;
        }
})(typeof window !== 'undefined' ? window : globalThis);
