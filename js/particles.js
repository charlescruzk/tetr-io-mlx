// js/particles.js — browser-only. See PLAN.md Phase 15 + SPEC.md
// "Juice / particle effects".
//
// A pooled, bounded square-particle system drawn on the board canvas,
// layered on top of Phase 11's shake + flash (it replaces neither). It reads
// only the model signals render.js already keys off — g.lastEvents (now
// carrying the cleared rows' cell letters) and g.hardDropAt / g.hardDropLanding
// — so the game model stays pure and no event plumbing is added.
//
// Pool: a fixed ring buffer of MAX slots. Spawning overwrites the oldest
// slot first, so the count can never grow unbounded and the frame cost is
// capped no matter how fast effects trigger (it must not tank a phone).
//
// Physics is evaluated analytically from the spawn time (x = x0 + v*t,
// y = y0 + vy*t + 0.5*g*t²) rather than integrated per frame, so a long
// frame / backgrounded tab can never destabilize it, and updating costs
// nothing — the only per-frame work is one draw pass over MAX slots.
//
// No dual-export: it touches the canvas, so it's browser-only and attaches
// window.Tetris.Particles. (The spawn/update/draw math itself is DOM-free,
// so tests/run.js still smoke-tests the pool bounds with a stub ctx.)

(function (root) {
  'use strict';

  const T = (root.Tetris = root.Tetris || {});

  const MAX = 240;                 // hard cap, oldest culled first
  const GRAVITY = 0.0009;          // px per ms^2 (≈900 px/s²) on particles
  const BUFFER = (T.Board && T.Board.BUFFER) != null ? T.Board.BUFFER : 4;
  const CELL = (T.Render && T.Render.CELL) || 30;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  const Particles = {
    MAX: MAX,
    _buf: null,
    _next: 0, // ring cursor — the next spawn overwrites the oldest slot

    _init() {
      if (this._buf) return;
      this._buf = [];
      for (let i = 0; i < MAX; i++) {
        this._buf.push({ live: false, x: 0, y: 0, vx: 0, vy: 0,
                         born: 0, life: 0, size: 0, color: '' });
        }
      },

     // Take the next ring slot and write a particle into it. The ring cursor
     // overwrites the oldest slot first when the pool is full.
    _spawn(x, y, vx, vy, born, life, size, color) {
      this._init();
      const p = this._buf[this._next];
      this._next = (this._next + 1) % MAX;
      p.live = true;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.born = born; p.life = life; p.size = size; p.color = color;
      },

     // Line-clear burst: two small squares per occupied cell in the cleared
     // row(s), in that cell's own piece color; a Tetris (4 lines) is the
     // bigger, showier version — more particles per cell, longer-lived,
     // faster, plus white sparkles mixed in.
    spawnLineClear(rows, rowCells, tetris, now) {
      if (!rows || !rowCells) return;
      this._init();
      const perCell = tetris ? 3 : 2;
      const lifeMin = tetris ? 700 : 500;
      const speed = tetris ? 1.5 : 1;
      for (let i = 0; i < rows.length; i++) {
        const py = (rows[i] - BUFFER) * CELL;
        if (py < 0) continue; // hidden buffer rows never burst
        const cells = rowCells[i] || [];
        for (let x = 0; x < cells.length; x++) {
          const color = T.Render ? (T.Render.COLORS[cells[x]] || '#888') : '#888';
          const cx = x * CELL + CELL / 2;
          const cy = py + CELL / 2;
          for (let k = 0; k < perCell; k++) {
            const white = tetris && Math.random() < 0.25;
            this._spawn(
              cx + rnd(-6, 6), cy + rnd(-4, 4),
              rnd(-0.10, 0.10) * speed,        // vx: burst outward
              rnd(-0.16, -0.02) * speed,       // vy: upward pop, gravity pulls back
              now, rnd(lifeMin, lifeMin + (tetris ? 400 : 300)),
              rnd(4, 8),
              white ? '#ffffff' : color
              );
            }
          }
        }
      },

     // Hard-drop impact puff: a little dust at the piece's landing cells,
     // alongside the existing board shake — small, short-lived, mostly the
     // piece's own color with a few pale flecks.
    spawnHardDrop(landing, now) {
      if (!landing || !T.Piece) return;
      this._init();
      const cells = T.Piece.getCells(landing.type, landing.rotation, landing.x, landing.y);
      const color = T.Render ? (T.Render.COLORS[landing.type] || '#aaa') : '#aaa';
      for (let i = 0; i < cells.length; i++) {
        const cx = cells[i][0] * CELL + CELL / 2;
        const py = (cells[i][1] - BUFFER) * CELL + CELL / 2;
        if (py < 0) continue; // landed entirely in the buffer (can't happen, but guard)
        for (let k = 0; k < 3; k++) {
          this._spawn(
            cx + rnd(-8, 8), py + rnd(-4, 4),
            rnd(-0.06, 0.06),
            rnd(-0.08, -0.01),               // a soft upward puff
            now, rnd(200, 350),
            rnd(3, 5),
            Math.random() < 0.3 ? '#ffffff' : color
            );
          }
        }
      },

     // Number of currently-live particles (used by the smoke tests).
    count(now) {
      if (!this._buf) return 0;
      let n = 0;
      for (const p of this._buf) {
        if (p.live && now - p.born < p.life) n++;
        }
      return n;
      },

     // Draw every live particle, fading out over its life. Called once per
     // frame from render.js (inside the board transform, so particles shake
     // with the field). Dead slots are reclaimed here.
    draw(ctx, now) {
      if (!this._buf) return;
      for (const p of this._buf) {
        if (!p.live) continue;
        const age = now - p.born;
        if (age < 0 || age >= p.life) { p.live = false; continue; }
        const x = p.x + p.vx * age;
        const y = p.y + p.vy * age + 0.5 * GRAVITY * age * age;
        const t = age / p.life;
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillStyle = p.color;
        const s = p.size * (1 - 0.4 * t);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      ctx.globalAlpha = 1;
      },
    };

  root.Tetris.Particles = Particles;
})(window);