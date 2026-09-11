// js/input.js — browser-only. See PLAN.md Phase 6 + SPEC.md "Controls".
//
// Keyboard handling for every control in the spec, with DAS/ARR-style repeat
// on the held movement keys. Reads the game object (created by game.js) and
// calls its actions — it writes nothing of its own to game state.
//
// No dual-export: it touches window/performance/rAF, so it's browser-only and
// just attaches window.Tetris.Input. It runs its own requestAnimationFrame
// loop for the DAS/ARR timers, so it's self-contained and doesn't depend on
// main.js's render loop; Phase 9 may fold this into a single frame loop.

(function (root) {
  'use strict';

  const T = (root.Tetris = root.Tetris || {});

   // DAS = milliseconds a key is held before the first auto-repeat.
   // ARR = milliseconds between auto-repeats once DAS has elapsed.
   // Ranges from SPEC.md: initial delay ~150-170ms, repeat ~30-50ms.
  const DAS = 160;
  const ARR = 40;

   // Held keys get DAS/ARR. Everything else is single-shot (fires once per
   // physical keydown — the OS key-repeat is ignored; see _onKeyDown).
  const DAS_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown']);

   // Every code we react to, so we can preventDefault only on game keys and
   // leave the browser to do its normal thing for the rest.
  const HANDLED = new Set([
    'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp',
    'KeyX', 'KeyZ', 'KeyC', 'ShiftLeft', 'ShiftRight',
    'Space', 'Escape', 'KeyP',
   ]);

  const Input = {
    DAS: DAS,
    ARR: ARR,
    _g: null,
    _enabled: true,
    _held: new Set(),   // codes currently physically down
    _dash: {},          // code -> { nextAt } for the DAS/ARR timer
    _raf: null,
    _onDown: null,
    _onUp: null,
    _loopFn: null,

     // Attach to a game object. Idempotent: re-binding just re-points at the
     // new game; the listener/loop are installed once.
    bind(game) {
      this._g = game;
      if (this._raf == null) {
        this._onDown = (e) => this._onKeyDown(e);
        this._onUp = (e) => this._onKeyUp(e);
        this._loopFn = (ts) => this._loop(ts);
        window.addEventListener('keydown', this._onDown);
        window.addEventListener('keyup', this._onUp);
        this._raf = requestAnimationFrame(this._loopFn);
       }
      return this;
     },

     // Tear the listeners and loop down (e.g. on quit-to-menu).
    unbind() {
      if (this._raf != null) {
        cancelAnimationFrame(this._raf);
        this._raf = null;
       }
      if (this._onDown) window.removeEventListener('keydown', this._onDown);
      if (this._onUp) window.removeEventListener('keyup', this._onUp);
      this._held.clear();
      this._dash = {};
     },

     // Phase 9 will gate this on which screen is showing. Default on.
    setEnabled(on) {
      this._enabled = !!on;
      if (!on) { this._held.clear(); this._dash = {}; }
     },

     // The single action surface: map a key code to exactly one game action.
     // Every action here self-guards on g.state, so calling it while paused
     // or game-over is a harmless no-op.
    _fire(code) {
      const g = this._g;
      if (!g || !this._enabled) return;
      switch (code) {
        case 'ArrowLeft': g.move(-1); return;
        case 'ArrowRight': g.move(1); return;
        case 'ArrowDown': g.softDrop(); return;
        case 'ArrowUp':
        case 'KeyX': g.rotate(1); return;
        case 'KeyZ': g.rotate(-1); return;
        case 'Space': g.hardDrop(); return;
        case 'KeyC':
        case 'ShiftLeft':
        case 'ShiftRight': g.hold(); return;
        case 'Escape':
        case 'KeyP': this._togglePause(); return;
        default: return;
       }
     },

     // Esc / P: pause when playing, resume when paused, ignore otherwise.
    _togglePause() {
      const g = this._g;
      if (!g) return;
      if (g.state === 'playing') g.pause();
      else if (g.state === 'paused') g.resume();
     },

    _onKeyDown(e) {
      const code = e.code;
      if (!HANDLED.has(code)) return; // not a game key — let the browser
      e.preventDefault();
      if (!this._enabled) return;
       // The OS fires keydown repeatedly while a key is held. We drive the
       // repeat ourselves (DAS/ARR), so ignore the OS repeats entirely.
      if (e.repeat) return;
      this._held.add(code);
      this._fire(code); // immediate first action
       // Only the movement/soft-drop keys get an auto-repeat timer.
      if (DAS_KEYS.has(code)) {
        this._dash[code] = { nextAt: performance.now() + DAS };
       }
     },

    _onKeyUp(e) {
      this._held.delete(e.code);
      delete this._dash[e.code];
     },

     // rAF tick: fire any held DAS/ARR key that has come due, and reschedule.
    _loop(ts) {
      const dash = this._dash;
      for (const code of this._held) {
        const d = dash[code];
        if (d && ts >= d.nextAt) {
          this._fire(code);
          d.nextAt = ts + ARR;
         }
       }
      this._raf = requestAnimationFrame(this._loopFn);
     },
   };

  root.Tetris.Input = Input;
})(window);
