// js/touch.js — browser-only. See PLAN.md Phase 14 + SPEC.md "Mobile & touch".
//
// On-screen touch controls for phones: a thin layer NEXT to input.js that
// calls the exact same game action surface (g.move / g.rotate / g.softDrop /
// g.hardDrop / g.hold) — it owns no game logic of its own. Left / Right /
// Soft Drop get the same DAS/ARR hold-repeat as the keyboard; Rotate CW/CCW,
// Hard Drop, and Hold are single-shot per press.
//
// Events: touchstart/touchend/touchcancel with preventDefault() — kills the
// ~300ms tap delay and the synthetic-click double-fire, and stops the page
// from scrolling out from under a held movement button. The buttons are
// hidden on non-touch devices via CSS ((hover: none) and (pointer: coarse)
// in style.css); this module still runs harmlessly either way, since the
// elements just aren't visible/pressable on desktop.
//
// No dual-export: it touches the DOM, so it's browser-only and attaches
// window.Tetris.Touch.

(function (root) {
  'use strict';

  const T = (root.Tetris = root.Tetris || {});

  // Same feel as input.js (SPEC: DAS ~150-170ms, ARR ~30-50ms).
  const DAS = 160;
  const ARR = 40;

  // Actions that repeat while held (mirrors input.js's DAS_KEYS).
  const REPEAT = new Set(['left', 'right', 'soft']);

  // Style helpers that tolerate the test stub's bare `style` object.
  function setStyle(el, prop, value) {
    if (el.style) el.style[prop] = value;
  }
  function setVar(el, name, value) {
    if (el.style && el.style.setProperty) el.style.setProperty(name, value);
  }

  const Touch = {
    DAS: DAS,
    ARR: ARR,
    _g: null,          // the live game object, pointed at by UI.startGame
    _enabled: false,
    _repeat: {},       // action -> { nextAt } while a button is held
    _raf: null,
    _loopFn: null,
    _controls: null,
    _buttons: null,

    // Find the control container, render the active profile's layout into
    // it, and start the repeat loop. Called once from main.js boot(); safe
    // if the markup is absent (e.g. stripped).
    init() {
      const controls = document.getElementById('touch-controls');
      if (!controls) return this;
      this._controls = controls;
      // Phase 27: the buttons are generated from the layout model (the static
      // markup in index.html is the no-JS/default fallback and is replaced).
      const layout = (T.UI && T.UI.layout) || (T.Layout && T.Layout.create());
      if (layout) this.render(layout);
      else this._bindExisting(controls);
       // The repeat loop mirrors input.js's rAF timer loop. It only runs
      // while something is held, so it costs nothing when idle.
      this._loopFn = (ts) => this._loop(ts);
      this._raf = requestAnimationFrame(this._loopFn);
      return this;
      },

    // Phase 27: (re)build the two thumb clusters from a layout. Each side is
    // its own CSS grid sized to the bounding box of its buttons (see
    // Layout.clusters), so an unused row costs no height. Called at boot and
    // whenever the active profile's layout changes.
    render(layout) {
      const controls = this._controls || document.getElementById('touch-controls');
      if (!controls || !T.Layout) return this;
      this._controls = controls;
      this._repeat = {};
      this._buttons = [];
      if (controls.replaceChildren) controls.replaceChildren();
      else controls.innerHTML = '';
      const clusters = T.Layout.clusters(layout);
      for (const side of ['left', 'right']) {
        const c = clusters[side];
        if (!c) continue;
        const el = document.createElement('div');
        el.className = 'touch-cluster touch-' + side;
        setStyle(el, 'gridTemplateColumns', 'repeat(' + c.cols + ', minmax(0, 1fr))');
        setVar(el, '--cols', String(c.cols));
        for (const it of c.items) {
          const label = T.Layout.LABELS[it.action];
          const btn = document.createElement('button');
          btn.className = 'tbtn' + (label.primary ? ' tbtn-primary' : '') +
                          (label.small ? ' tbtn-small' : '');
          btn.dataset.action = it.action;
          btn.setAttribute('aria-label', label.aria);
          btn.setAttribute('type', 'button');
          btn.textContent = label.text;
          setStyle(btn, 'gridColumn', (it.c + 1) + ' / span ' + it.w);
          setStyle(btn, 'gridRow', String(it.r + 1));
          this._bindButton(btn);
          el.appendChild(btn);
          }
        controls.appendChild(el);
        }
      return this;
      },

    // Fallback when the layout model isn't loaded: bind the static markup.
    _bindExisting(controls) {
      this._buttons = [];
      for (const btn of controls.querySelectorAll('[data-action]')) this._bindButton(btn);
      },

    _bindButton(btn) {
      this._buttons.push(btn);
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this._press(btn);
        }, { passive: false });
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this._release(btn.dataset.action);
        }, { passive: false });
      btn.addEventListener('touchcancel', () => {
        this._release(btn.dataset.action);
        });
      },

    // Point at the live game (same lifecycle as Input.bind via ui.js).
    bind(game) {
      this._g = game;
      return this;
      },

    // Gate with the keyboard layer (ui.js calls both from _syncInput).
    setEnabled(on) {
      this._enabled = !!on;
      if (!on) this._repeat = {};
      },

    _press(btn) {
      if (!this._enabled || !this._g) return;
      const action = btn.dataset.action;
      if (REPEAT.has(action)) {
        this._fire(action);
        this._repeat[action] = { nextAt: performance.now() + DAS };
        } else {
        this._fire(action);
        }
      },

    _release(action) {
      delete this._repeat[action];
      },

    // Same dispatch shape as input.js _fire: one action -> one game call.
    // Every g.* action self-guards on state (playing-only), so a press while
    // paused or on the game-over overlay is a harmless no-op.
    _fire(action) {
      const g = this._g;
      if (!g) return;
      switch (action) {
        case 'left': g.move(-1); return;
        case 'right': g.move(1); return;
        case 'soft': g.softDrop(); return;
        case 'cw': g.rotate(1); return;
        case 'ccw': g.rotate(-1); return;
        case 'hard': g.hardDrop(); return;
        case 'hold': g.hold(); return;
        default: return;
        }
      },

    // rAF tick: fire any held repeat action that has come due, reschedule.
    _loop(ts) {
      for (const action in this._repeat) {
        const d = this._repeat[action];
        if (ts >= d.nextAt) {
          this._fire(action);
          d.nextAt = ts + ARR;
          }
        }
      this._raf = requestAnimationFrame(this._loopFn);
      },
    };

  root.Tetris.Touch = Touch;
})(window);