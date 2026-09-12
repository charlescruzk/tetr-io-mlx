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
   // The game's state as of the END of the previous frame. Comparing against
   // it (not against this frame's starting state) is what makes between-
   // frames transitions visible: a keypress that pauses the game lands
   // between two frames, so reading g.state fresh each frame always saw
   // 'paused' on both sides and the pause overlay never opened (Phase 16c).
  let lastState = null;

  function frame(ts) {
    if (!last) last = ts;
    let dt = ts - last;
    last = ts;
    if (dt > MAX_DT) dt = MAX_DT;

    const g = T.UI.game;

    if (g) {
      const prev = lastState;
      lastState = g.state;

       // Advance the simulation only while actively playing. Paused/over/won
       // states are frozen: no gravity, no lock timer, no clock.
      if (g.state === 'playing') {
        g.tick(dt);
        T.UI._updateHUD(g);
        }

      // Phase 19: pump the music sequencer. Runs even in paused/over states so
      // the menu variant keeps playing; the audio layer gates on its own flags.
      if (T.Audio && T.Audio.frame) T.Audio.frame(g);

      // Phase 20: pump the animated background. Runs everywhere so the menus
      // aren't static, but pauses on visibilitychange/reduced motion internally.
      if (T.Background && T.Background.frame) T.Background.frame(g);

       // React to any playing→X transition since the previous frame ended —
       // whether it happened inside g.tick or via input between frames.
      if (prev === 'playing') {
        if (g.state === 'paused') T.UI.openPause();
        else if (g.state === 'over' || g.state === 'won') T.UI.endGame();
        } else if (prev === 'paused' && g.state === 'playing') {
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
      // Phase 14: wire the touch controls (a no-op where the markup or the
      // device doesn't have them).
      if (T.Touch && T.Touch.init) T.Touch.init();
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
