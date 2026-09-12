// js/fxtimeline.js — pure animation timelines and a bounded popup pool.
// See PLAN.md Phase 21. Dual-export UMD: require()'d in Node (tests/run.js)
// and attached to window.Tetris.FxTimeline in the browser.
//
// Everything here is a pure function of time and state: no canvas, no DOM,
// no per-frame allocation in hot paths. The browser renderer in js/render.js
// consumes these values and owns the actual drawing.
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;

  // Durations in milliseconds. These are the canonical durations the renderer
  // and tests agree on.
  const DURATIONS = {
    lineClear: 220,
    lockFlash: 120,
    popup: 700,
    hardDropTrail: 160,
  };

  const POPUP_MAX = 24;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---- Line-clear animation timeline ---------------------------------------
  //
  // Returns { active, flash, dissolve, slide } where:
  //   active   — true while 0 < elapsed < DURATIONS.lineClear
  //   flash    — white overlay intensity on the cleared rows (1 → 0)
  //   dissolve — how transparent the cleared cells have become (0 → 1)
  //   slide    — how far rows above the cleared block have slid down (0 → 1)
  //
  // At t=0: flash is full, nothing has dissolved or slid. At t=duration:
  // flash=0, dissolve=1, slide=1. The three phases intentionally overlap so
  // the flash leads into the dissolve while the slide begins before the rows
  // are fully gone.
  function lineClearProgress(elapsedMs) {
    const d = DURATIONS.lineClear;
    if (elapsedMs <= 0) return { active: false, flash: 1, dissolve: 0, slide: 0 };
    if (elapsedMs >= d) return { active: false, flash: 0, dissolve: 1, slide: 1 };
    const p = elapsedMs / d;
    const flash = p < 0.45 ? 1 - p / 0.45 : 0;
    const dissolve = p < 0.15 ? 0 : (p < 0.75 ? (p - 0.15) / 0.60 : 1);
    const slide = p < 0.40 ? 0 : (p < 0.90 ? (p - 0.40) / 0.50 : 1);
    return { active: true, flash: clamp(flash, 0, 1), dissolve: clamp(dissolve, 0, 1), slide: clamp(slide, 0, 1) };
  }

  // ---- Lock flash timeline -------------------------------------------------
  // A brief white flash on the cells that just locked. Returns alpha in [0,1].
  function lockFlashProgress(elapsedMs) {
    const d = DURATIONS.lockFlash;
    if (elapsedMs <= 0 || elapsedMs >= d) return 0;
    return 1 - elapsedMs / d;
  }

  // ---- Popup timeline ------------------------------------------------------
  // A floating text popup rises ~40px and fades out over the duration.
  // Returns { active, yOffsetPx, alpha }. yOffset is negative (upward).
  function popupProgress(elapsedMs) {
    const d = DURATIONS.popup;
    if (elapsedMs <= 0 || elapsedMs >= d) return { active: false, yOffsetPx: 0, alpha: 0 };
    const p = elapsedMs / d;
    return {
      active: true,
      yOffsetPx: lerp(0, -40, p),
      alpha: 1 - p * p, // ease-out fade
    };
  }

  // ---- Hard-drop trail timeline ------------------------------------------
  // Returns { active, copies, alpha }. `copies` is the suggested number of
  // faded piece copies to draw behind the landing piece; it decreases as the
  // trail fades.
  function hardDropTrailProgress(elapsedMs) {
    const d = DURATIONS.hardDropTrail;
    if (elapsedMs <= 0 || elapsedMs >= d) return { active: false, copies: 0, alpha: 0 };
    const p = elapsedMs / d;
    return {
      active: true,
      copies: Math.max(1, Math.floor((1 - p) * 5)),
      alpha: 1 - p,
    };
  }

  // ---- Danger tint ---------------------------------------------------------
  // Returns an alpha in [0, 0.30] based on how full the stack is. The danger
  // region is the top 60% of the visible field; once the stack reaches the
  // very top rows the tint is strongest.
  function dangerTintAlpha(visibleRowsFilled) {
    // visibleRowsFilled is the count of visible rows (0..H) that contain at
    // least one locked cell. This is cheap to compute and a good proxy for
    // stack height without needing the exact max row each frame.
    const dangerStart = 12; // start tinting when 12+ visible rows are occupied
    const dangerEnd = 19;   // max tint near the top
    if (visibleRowsFilled <= dangerStart) return 0;
    return clamp((visibleRowsFilled - dangerStart) / (dangerEnd - dangerStart), 0, 1) * 0.30;
  }

  // ---- Popup pool (pure state) ---------------------------------------------
  //
  // The pool is a fixed ring buffer of POPUP_MAX slots. Spawning overwrites the
  // oldest slot, so the per-frame draw cost is bounded. The state object holds
  // the slots and ring cursor; tests and the renderer both pass it around.
  const Popups = {
    create() {
      const slots = [];
      for (let i = 0; i < POPUP_MAX; i++) {
        slots.push({ live: false, text: '', x: 0, y: 0, born: 0 });
      }
      return { slots: slots, next: 0, max: POPUP_MAX };
    },

    spawn(state, text, x, y, now) {
      const p = state.slots[state.next];
      state.next = (state.next + 1) % state.max;
      p.live = true;
      p.text = String(text);
      p.x = x;
      p.y = y;
      p.born = now;
      return p;
    },

    count(state, now) {
      let n = 0;
      for (const p of state.slots) {
        if (p.live && now - p.born < DURATIONS.popup) n++;
      }
      return n;
    },

    // Draw every live popup. `drawFn(text, x, y, alpha)` is supplied by the
    // renderer so this module stays canvas-free.
    draw(state, now, drawFn) {
      for (const p of state.slots) {
        if (!p.live) continue;
        const age = now - p.born;
        if (age < 0 || age >= DURATIONS.popup) { p.live = false; continue; }
        const pr = popupProgress(age);
        drawFn(p.text, p.x, p.y + pr.yOffsetPx, pr.alpha);
      }
    },
  };

  const FxTimeline = {
    DURATIONS: DURATIONS,
    POPUP_MAX: POPUP_MAX,
    lineClearProgress: lineClearProgress,
    lockFlashProgress: lockFlashProgress,
    popupProgress: popupProgress,
    hardDropTrailProgress: hardDropTrailProgress,
    dangerTintAlpha: dangerTintAlpha,
    Popups: Popups,
  };

  if (isNode) {
    module.exports = FxTimeline;
  } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.FxTimeline = FxTimeline;
  }
})(typeof window !== 'undefined' ? window : globalThis);
