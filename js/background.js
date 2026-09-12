// js/background.js — browser-only animated background renderer. See PLAN.md Phase 20.
//
// Draws to a fixed full-screen canvas behind the UI. The simulation lives in
// js/backgroundsim.js (pure, tested). Rendering uses a low-resolution offscreen
// canvas that is upscaled to the display canvas to keep the blur/glow cost
// tiny. Pauses on visibilitychange and becomes a static gradient under reduced
// motion.
(function (root) {
  'use strict';

  const T = (root.Tetris = root.Tetris || {});
  const Sim = T.BackgroundSim;
  if (!Sim) return; // backgroundsim.js must load first

  const DPR_CAP = 2;

  const state = {
    displayCanvas: null,
    offCanvas: null,
    offCtx: null,
    sim: null,
    lastGame: null,
    lastEventMs: 0,
    hidden: false,
    reducedMotion: false,
    resizePending: true,
  };

  const Background = {
    init() {
      if (state.displayCanvas) return;

      const c = document.createElement('canvas');
      c.id = 'bg-canvas';
      c.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(c, document.body.firstChild);
      state.displayCanvas = c;

      state.offCanvas = document.createElement('canvas');
      state.offCtx = state.offCanvas.getContext('2d');

      state.sim = Sim.create({ reducedMotion: false });

      const mq = root.matchMedia('(prefers-reduced-motion: reduce)');
      state.reducedMotion = mq.matches;
      if (mq.addEventListener) {
        mq.addEventListener('change', (e) => { state.reducedMotion = e.matches; state.resizePending = true; });
      } else if (mq.addListener) {
        mq.addListener((e) => { state.reducedMotion = e.matches; state.resizePending = true; });
      }

      document.addEventListener('visibilitychange', () => {
        state.hidden = document.hidden;
        if (!state.hidden) state.resizePending = true;
      });
      root.addEventListener('resize', () => { state.resizePending = true; });
      state.resizePending = true;
      return this;
    },

    frame(g) {
      if (!state.displayCanvas) this.init();
      if (state.hidden) return;

      if (state.resizePending) this._resize();

      const now = performance.now();
      const last = state.lastGame;
      let eventPulse = 0;
      let tetris = false;
      let lineClear = false;
      let levelUp = false;
      let level = (g && g.level) || 1;

      if (g && g.lastEvents) {
        const ev = g.lastEvents;
        if (ev.type === 'lineClear') {
          lineClear = true;
          eventPulse = ev.lines >= 4 ? 0.75 : 0.35;
          if (ev.lines >= 4) tetris = true;
        } else if (ev.type === 'lock') {
          // Tiny pulse on every lock so the background never feels completely dead.
          eventPulse = 0.08;
        }
      }
      // Level-up is a one-frame signal: g.level rose since the last frame.
      if (last && g && g.level > last.level) {
        levelUp = true;
        eventPulse = Math.max(eventPulse, 0.55);
      }

      state.lastGame = g ? { level: g.level } : null;

      const dt = last ? Math.min(100, now - state.lastFrameMs) : 16;
      state.lastFrameMs = now;

      Sim.step(state.sim, dt, {
        level: level,
        tetris: tetris,
        lineClear: lineClear,
        levelUp: levelUp,
        eventPulse: eventPulse,
        reducedMotion: state.reducedMotion,
      });

      this._draw();
    },

    _resize() {
      state.resizePending = false;
      const dpr = Math.min(DPR_CAP, root.devicePixelRatio || 1);
      const cssW = root.innerWidth;
      const cssH = root.innerHeight;

      state.displayCanvas.width = Math.floor(cssW * dpr);
      state.displayCanvas.height = Math.floor(cssH * dpr);
      state.displayCanvas.style.width = cssW + 'px';
      state.displayCanvas.style.height = cssH + 'px';

      // Offscreen is 1/4 resolution (capped to 512 on either axis) so the soft
      // blur/glow cost stays tiny on phones and retina screens.
      const offW = Math.min(512, Math.max(64, Math.floor(cssW * dpr / 4)));
      const offH = Math.min(512, Math.max(64, Math.floor(cssH * dpr / 4)));
      if (state.offCanvas.width !== offW || state.offCanvas.height !== offH) {
        state.offCanvas.width = offW;
        state.offCanvas.height = offH;
      }

      const ctx = state.displayCanvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'low';
      }
    },

    _draw() {
      const ctx = state.offCtx;
      const W = state.offCanvas.width;
      const H = state.offCanvas.height;
      if (!W || !H) return;

      // Dark aurora gradient base.
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#080910');
      grd.addColorStop(0.5, '#0e0f1a');
      grd.addColorStop(1, '#111220');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      // Soft moving blobs (radial gradients) for aurora feel.
      const t = performance.now() / 1000;
      const blobs = [
        { x: 0.2 + 0.1 * Math.sin(t * 0.07), y: 0.3 + 0.08 * Math.cos(t * 0.05), r: 0.6, hue: 250 },
        { x: 0.7 + 0.12 * Math.cos(t * 0.06), y: 0.6 + 0.1 * Math.sin(t * 0.04), r: 0.5, hue: 270 },
        { x: 0.5 + 0.08 * Math.sin(t * 0.03), y: 0.8 + 0.05 * Math.cos(t * 0.07), r: 0.45, hue: 190 },
      ];
      for (const b of blobs) {
        const rg = ctx.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * Math.min(W, H));
        rg.addColorStop(0, `hsla(${b.hue}, 70%, 35%, 0.10)`);
        rg.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, W, H);
      }

      // Tetromino silhouettes drifting and rotating.
      ctx.save();
      for (const s of state.sim.shapes) {
        const d = Sim.derive(state.sim, s);
        const cx = d.x * W;
        const cy = d.y * H;
        const sz = d.size * Math.min(W, H);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(d.rot);
        ctx.shadowColor = d.glow;
        ctx.shadowBlur = sz * 1.2;
        ctx.fillStyle = d.color;
        ctx.globalAlpha = d.alpha;
        this._drawPieceSilhouette(ctx, s.type, sz);
        ctx.restore();
      }
      ctx.restore();

      // Blit the low-res offscreen canvas up to the display canvas.
      const dctx = state.displayCanvas.getContext('2d');
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.clearRect(0, 0, state.displayCanvas.width, state.displayCanvas.height);
      dctx.drawImage(state.offCanvas, 0, 0, state.displayCanvas.width, state.displayCanvas.height);
    },

    _drawPieceSilhouette(ctx, type, sz) {
      // Simple 4-block silhouettes for each tetromino type.
      const half = sz * 0.5;
      ctx.beginPath();
      if (type === 'I') {
        ctx.rect(-2 * sz, -half, 4 * sz, sz);
      } else if (type === 'O') {
        ctx.rect(-sz, -half, 2 * sz, sz);
      } else if (type === 'T') {
        ctx.rect(-1.5 * sz, -half, 3 * sz, sz);
        ctx.rect(-half, half, sz, sz);
      } else if (type === 'S') {
        ctx.rect(-1.5 * sz, -half, 2 * sz, sz);
        ctx.rect(-half, half, 2 * sz, sz);
      } else if (type === 'Z') {
        ctx.rect(-half, -half, 2 * sz, sz);
        ctx.rect(-1.5 * sz, half, 2 * sz, sz);
      } else if (type === 'J') {
        ctx.rect(-1.5 * sz, -half, sz, 2 * sz);
        ctx.rect(-half, -half, 2 * sz, sz);
      } else if (type === 'L') {
        ctx.rect(half, -half, sz, 2 * sz);
        ctx.rect(-1.5 * sz, -half, 2 * sz, sz);
      }
      ctx.fill();
    },
  };

  root.Tetris.Background = Background;
})(typeof window !== 'undefined' ? window : globalThis);
