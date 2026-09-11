// js/main.js — browser-only. See PLAN.md Phase 9.
//
// Thin glue. Boots the UI once the DOM is up, then runs a single
// requestAnimationFrame loop that: ticks the game (gravity + lock delay) only
// while it's playing, reacts to the game's state transitions (pause overlay,
// game-over screen), and paints a frame whenever the board is visible. All
// real behavior lives in game/render/input/ui/audio — this just pumps them.
(function (root) {
    'use strict';

  const T = (root.Tetris = root.Tetris || {});

      // Clamp dt so a backgrounded tab (or a long GC pause) doesn't dump a
      // huge time step into gravity on the first frame back.
  const MAX_DT = 100;

  let last = 0;

  function frame(ts) {
    if (!last) last = ts;
    let dt = ts - last;
    last = ts;
    if (dt > MAX_DT) dt = MAX_DT;

    const g = T.UI.game;

    if (g) {
      const before = g.state;

       // Advance the simulation only while actively playing. Paused/over/won
       // states are frozen: no gravity, no lock timer, no clock.
      if (before === 'playing') {
        g.tick(dt);
        T.UI._updateHUD(g);
           // React to a transition that happened this tick (or via input).
        if (g.state === 'paused') T.UI.openPause();
        else if (g.state === 'over' || g.state === 'won') T.UI.endGame();
        } else if (before === 'paused' && g.state === 'playing') {
        // Resumed by the Resume button or Esc/P: keep the overlay closed
        // (main.js only OPENS overlays; the UI buttons close them).
        T.UI._hideOverlay('pause');
        }

       // Paint the board whenever it's on screen (including a frozen frame
       // behind the pause/game-over overlays).
      if (T.UI.isGameVisible()) T.Render.frame(g);
      }

    requestAnimationFrame(frame);
    }

  function boot() {
    try {
      T.UI.init();
      requestAnimationFrame(frame);
      } catch (err) {
      // Phase 13 hardening: a failed init used to leave a silently dead page
      // (the raw HTML/CSS still renders, so it *looks* fine but every button
      // is dead). Fail loudly instead: log it and paint a visible error state.
      console.error('Tetris: init failed', err);
      try {
        document.body.innerHTML =
          '<div style="font:16px/1.6 monospace;color:#f66;background:#0e0f1a;' +
          'padding:24px;max-width:640px;margin:10vh auto">' +
          '<h1 style="font-size:20px;color:#f88">Something went wrong</h1>' +
          '<p>The game failed to start:</p><pre style="white-space:pre-wrap;' +
          'color:#faa">' + String(err && err.stack || err) + '</pre></div>';
        } catch (e2) { /* nothing else to do */ }
      }
    }

      // Scripts are loaded at the end of <body>, so the DOM is already parsed
      // by the time this runs; but guard for DOMContentLoaded anyway in case
      // the load order changes.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
    } else {
    boot();
    }
})(typeof window !== 'undefined' ? window : globalThis);
