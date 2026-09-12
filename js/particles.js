// js/particles.js — browser-only. See PLAN.md Phase 15 + SPEC.md
// "Juice / particle effects", exaggerated in Phase 24.
//
// A pooled, bounded particle system drawn on the board canvas, layered on
// top of Phase 11's shake + flash (it replaces neither). It reads only the
// model signals render.js already keys off — g.lastEvents (carrying the
// cleared rows' cell letters / the locked cells) and g.hardDropAt /
// g.hardDropLanding — so the game model stays pure and no event plumbing is
// added.
//
// Three particle kinds, all drawn additively ('lighter') so overlaps bloom:
//   chunk — a spinning solid square in the piece's color (debris)
//   spark — a fast streak: a line from where it was ~40ms ago to where it is
//           now, so speed reads as motion blur
//   orb   — a soft radial-gradient glow sprite (pre-rendered per color)
// plus a small separate list of "waves": expanding rings and horizontal row
// sweeps (shockwaves) that are one-shot shapes rather than pooled particles.
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
// Reduced motion: `prefers-reduced-motion: reduce` scales every spawn count
// down to roughly the pre-Phase-24 (subtle) level and drops the shockwaves,
// so the game stays fully readable; nothing here runs on a timer, so a hidden
// tab costs nothing (rAF stops → no draw calls).
//
// No dual-export: it touches the canvas, so it's browser-only and attaches
// window.Tetris.Particles. (The spawn/update math itself is DOM-free, so
// tests/run.js smoke-tests the pool bounds and spawn counts with a stub ctx.)

(function (root) {
  'use strict';

  const T = (root.Tetris = root.Tetris || {});

  const MAX = 900;                 // hard cap, oldest culled first
  const GRAVITY = 0.0011;          // px per ms^2 (≈1100 px/s²) on particles
  const SPARK_TRAIL_MS = 40;       // how far back a spark's streak reaches
  const REDUCED_SCALE = 0.3;       // spawn-count multiplier under reduced motion
  const BUFFER = (T.Board && T.Board.BUFFER) != null ? T.Board.BUFFER : 4;
  const CELL = (T.Render && T.Render.CELL) || 30;
  const WHITE = '#ffffff';

  const KIND_CHUNK = 0;
  const KIND_SPARK = 1;
  const KIND_ORB = 2;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function color(type, fallback) {
    return (T.Render && T.Render.COLORS[type]) || fallback || '#aaa';
  }

  const Particles = {
    MAX: MAX,
    _buf: null,
    _next: 0, // ring cursor — the next spawn overwrites the oldest slot
    _waves: null,
    _glow: null,   // color -> pre-rendered radial glow sprite (browser only)
    _mq: null,     // prefers-reduced-motion media query, resolved lazily
    _reduced: null, // explicit override for tests (null = ask matchMedia)

    _init() {
      if (this._buf) return;
      this._buf = [];
      for (let i = 0; i < MAX; i++) {
        this._buf.push({ live: false, kind: KIND_CHUNK, x: 0, y: 0, vx: 0, vy: 0,
                         born: 0, life: 0, size: 0, color: '', rot: 0, spin: 0,
                         grav: 1 });
      }
      this._waves = [];
      this._glow = {};
    },

    // True when the viewer asked for reduced motion. Tests set `_reduced`
    // directly; the browser path resolves matchMedia once and tracks changes.
    reducedMotion() {
      if (this._reduced != null) return this._reduced;
      if (this._mq === null) {
        this._mq = false;
        if (typeof root.matchMedia === 'function') {
          try {
            const mq = root.matchMedia('(prefers-reduced-motion: reduce)');
            this._mq = mq;
            const onChange = (e) => { this._mqMatches = e.matches; };
            if (mq.addEventListener) mq.addEventListener('change', onChange);
            else if (mq.addListener) mq.addListener(onChange);
            this._mqMatches = mq.matches;
          } catch (e) { this._mq = false; }
        }
      }
      return this._mq ? !!this._mqMatches : false;
    },

    // Spawn-count multiplier: 1 normally, REDUCED_SCALE under reduced motion.
    _scale() { return this.reducedMotion() ? REDUCED_SCALE : 1; },
    _n(count) { return Math.max(1, Math.round(count * this._scale())); },

    // Take the next ring slot and write a particle into it. The ring cursor
    // overwrites the oldest slot first when the pool is full.
    _spawn(kind, x, y, vx, vy, born, life, size, col, grav) {
      this._init();
      const p = this._buf[this._next];
      this._next = (this._next + 1) % MAX;
      p.live = true;
      p.kind = kind;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.born = born; p.life = life; p.size = size; p.color = col;
      p.rot = rnd(0, Math.PI * 2);
      p.spin = rnd(-0.012, 0.012);
      p.grav = grav == null ? 1 : grav;
    },

    // One-shot expanding ring (kind 'ring') or horizontal row sweep
    // (kind 'sweep'). Bounded: at most 24 live waves, oldest dropped.
    _wave(kind, x, y, born, life, r0, r1, col, width) {
      this._init();
      if (this.reducedMotion()) return;
      if (this._waves.length >= 24) this._waves.shift();
      this._waves.push({ kind, x, y, born, life, r0, r1, color: col, width });
    },

    // Line-clear explosion. Every occupied cell in the cleared row(s) blows
    // apart into spinning chunks of its own color, throws off fast sparks
    // (mostly sideways — the row is being ripped out), and leaves a glow orb
    // behind; each row also fires a horizontal shockwave sweep. A Tetris is
    // the bigger, showier version: more of everything, faster, longer-lived,
    // white sparkles mixed in, and a full-board ring on top.
    spawnLineClear(rows, rowCells, tetris, now) {
      if (!rows || !rowCells) return;
      this._init();
      const chunks = this._n(tetris ? 7 : 5);
      const sparks = this._n(tetris ? 6 : 4);
      const orbs = this._n(tetris ? 2 : 1);
      const lifeMin = tetris ? 900 : 650;
      const speed = tetris ? 1.5 : 1;
      let cy0 = 0, nRows = 0;
      for (let i = 0; i < rows.length; i++) {
        const py = (rows[i] - BUFFER) * CELL;
        if (py < 0) continue; // hidden buffer rows never burst
        const cells = rowCells[i] || [];
        const rowY = py + CELL / 2;
        cy0 += rowY; nRows++;
        this._wave('sweep', (cells.length * CELL) / 2, rowY, now, tetris ? 420 : 300,
                   0, (cells.length * CELL) / 2 + CELL, WHITE, tetris ? CELL * 1.2 : CELL * 0.8);
        for (let x = 0; x < cells.length; x++) {
          const col = color(cells[x], '#888');
          const cx = x * CELL + CELL / 2;
          const cy = rowY;
          // Outward-from-center bias so the row visibly splits apart.
          const dir = cx < (cells.length * CELL) / 2 ? -1 : 1;
          for (let k = 0; k < chunks; k++) {
            this._spawn(KIND_CHUNK,
              cx + rnd(-8, 8), cy + rnd(-6, 6),
              (rnd(0.05, 0.45) * dir + rnd(-0.12, 0.12)) * speed,
              rnd(-0.55, -0.08) * speed,
              now, rnd(lifeMin, lifeMin + (tetris ? 600 : 400)),
              rnd(5, tetris ? 15 : 12),
              tetris && Math.random() < 0.2 ? WHITE : col, 1);
          }
          for (let k = 0; k < sparks; k++) {
            this._spawn(KIND_SPARK,
              cx + rnd(-6, 6), cy + rnd(-4, 4),
              (rnd(0.25, 0.9) * dir + rnd(-0.15, 0.15)) * speed,
              rnd(-0.25, 0.12) * speed,
              now, rnd(280, 520),
              rnd(2, 3.5),
              Math.random() < 0.5 ? WHITE : col, 0.35);
          }
          for (let k = 0; k < orbs; k++) {
            this._spawn(KIND_ORB,
              cx + rnd(-4, 4), cy + rnd(-4, 4),
              rnd(-0.05, 0.05), rnd(-0.12, -0.02),
              now, rnd(450, 750),
              rnd(CELL * 1.2, CELL * 2.2),
              col, 0.05);
          }
        }
      }
      if (tetris && nRows) {
        const cx = (rowCells[0] ? rowCells[0].length : 10) * CELL / 2;
        const cy = cy0 / nRows;
        this._wave('ring', cx, cy, now, 600, CELL, CELL * 12, WHITE, 10);
        this._wave('ring', cx, cy, now + 90, 600, CELL, CELL * 12, '#33e0ff', 6);
        // A shower of white sparks in every direction from the block's center.
        const burst = this._n(48);
        for (let i = 0; i < burst; i++) {
          const a = rnd(0, Math.PI * 2);
          const s = rnd(0.3, 0.8);
          this._spawn(KIND_SPARK, cx, cy, Math.cos(a) * s, Math.sin(a) * s,
                      now, rnd(400, 700), rnd(2, 4), WHITE, 0.2);
        }
      }
    },

    // Lock sparkle: bright flecks and a couple of small sparks at the cells
    // that just locked. Used for both hard-drop and soft-drop locks.
    spawnLock(cells, type, now) {
      if (!cells || !type) return;
      this._init();
      const col = color(type);
      const flecks = this._n(6);
      for (let i = 0; i < cells.length; i++) {
        const cx = cells[i][0] * CELL + CELL / 2;
        const py = (cells[i][1] - BUFFER) * CELL + CELL / 2;
        if (py < 0) continue;
        for (let k = 0; k < flecks; k++) {
          const spark = k < 2;
          this._spawn(spark ? KIND_SPARK : KIND_CHUNK,
            cx + rnd(-12, 12), py + rnd(-12, 12),
            rnd(-0.12, 0.12), rnd(-0.14, 0.02),
            now, rnd(180, 340),
            spark ? rnd(1.5, 2.5) : rnd(2.5, 5.5),
            Math.random() < 0.5 ? WHITE : col, 0.5);
        }
      }
    },

    // Level-up: three staggered rings racing outward from the board center,
    // a radial burst of sparks, and confetti chunks raining from the top.
    spawnLevelUp(boardCenterX, boardCenterY, now) {
      this._init();
      const rings = ['#ffffff', '#33e0ff', '#b57cff'];
      for (let r = 0; r < rings.length; r++) {
        this._wave('ring', boardCenterX, boardCenterY, now + r * 110, 700,
                   CELL * 0.5, CELL * 11, rings[r], 8 - r * 2);
      }
      const count = this._n(64);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + rnd(-0.05, 0.05);
        const speed = rnd(0.25, 0.6);
        this._spawn(i % 2 ? KIND_SPARK : KIND_CHUNK,
          boardCenterX, boardCenterY,
          Math.cos(angle) * speed, Math.sin(angle) * speed,
          now, rnd(600, 1000),
          i % 2 ? rnd(2, 3.5) : rnd(4, 9),
          i % 3 === 0 ? WHITE : (i % 3 === 1 ? '#33e0ff' : '#b57cff'), 0.15);
      }
      const confetti = this._n(60);
      const palette = Object.keys((T.Render && T.Render.COLORS) || {});
      for (let i = 0; i < confetti; i++) {
        const col = palette.length ? color(palette[i % palette.length]) : WHITE;
        this._spawn(KIND_CHUNK,
          rnd(0, boardCenterX * 2), rnd(-CELL, boardCenterY * 0.4),
          rnd(-0.06, 0.06), rnd(0.05, 0.25),
          now + rnd(0, 250), rnd(900, 1500),
          rnd(4, 9), col, 0.35);
      }
    },

    // Hard-drop impact: a slam. Dust chunks and sparks kick up from every
    // landing cell, a wide flat shockwave sweeps out along the landing row,
    // and glow orbs bloom under the piece.
    spawnHardDrop(landing, now) {
      if (!landing || !T.Piece) return;
      this._init();
      const cells = T.Piece.getCells(landing.type, landing.rotation, landing.x, landing.y);
      const col = color(landing.type);
      const chunks = this._n(7);
      const sparks = this._n(5);
      let sx = 0, sy = 0, n = 0, maxY = -Infinity;
      for (let i = 0; i < cells.length; i++) {
        const cx = cells[i][0] * CELL + CELL / 2;
        const py = (cells[i][1] - BUFFER) * CELL + CELL / 2;
        if (py < 0) continue; // landed entirely in the buffer (can't happen, but guard)
        sx += cx; sy += py; n++;
        if (py > maxY) maxY = py;
        for (let k = 0; k < chunks; k++) {
          this._spawn(KIND_CHUNK,
            cx + rnd(-10, 10), py + rnd(-4, 8),
            rnd(-0.26, 0.26),
            rnd(-0.42, -0.1),
            now, rnd(320, 560),
            rnd(3, 8),
            Math.random() < 0.3 ? WHITE : col, 1);
        }
        for (let k = 0; k < sparks; k++) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          this._spawn(KIND_SPARK,
            cx + rnd(-8, 8), py + CELL * 0.3,
            rnd(0.2, 0.6) * dir,
            rnd(-0.18, -0.02),
            now, rnd(220, 400),
            rnd(1.5, 3),
            Math.random() < 0.5 ? WHITE : col, 0.6);
        }
        this._spawn(KIND_ORB, cx, py, 0, -0.02, now, rnd(300, 450),
                    rnd(CELL * 1.4, CELL * 2), col, 0);
      }
      if (n) {
        const cx = sx / n;
        this._wave('sweep', cx, maxY + CELL * 0.5, now, 260, 0, CELL * 5, col, CELL * 0.6);
        this._wave('ring', cx, sy / n, now, 360, CELL * 0.4, CELL * 5, WHITE, 5);
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

    // Number of live shockwaves (used by the smoke tests).
    waveCount(now) {
      if (!this._waves) return 0;
      let n = 0;
      for (const w of this._waves) if (now - w.born < w.life) n++;
      return n;
    },

    // Position of a particle at a given age (analytic, see header).
    _pos(p, age, out) {
      out.x = p.x + p.vx * age;
      out.y = p.y + p.vy * age + 0.5 * GRAVITY * p.grav * age * age;
      return out;
    },

    // Pre-rendered radial glow per color; drawn via drawImage so the per-
    // particle cost is one blit, not a gradient build. Browser only —
    // returns null in Node (the draw falls back to a plain square).
    _glowSprite(col) {
      if (typeof document === 'undefined' || !document.createElement) return null;
      const cached = this._glow[col];
      if (cached !== undefined) return cached;
      const size = 64;
      const c = document.createElement('canvas');
      const g = c && c.getContext ? c.getContext('2d') : null;
      if (!g || !g.createRadialGradient) { this._glow[col] = null; return null; }
      c.width = size; c.height = size;
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, col);
      grad.addColorStop(0.35, col);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      this._glow[col] = c;
      return c;
    },

    // Draw every live particle and wave, fading out over its life. Called
    // once per frame from render.js (inside the board transform, so
    // particles shake with the field). Dead slots are reclaimed here.
    draw(ctx, now) {
      if (!this._buf) return;
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      const a = { x: 0, y: 0 }, b = { x: 0, y: 0 };

      // Waves first (under the debris).
      if (this._waves.length) {
        for (let i = this._waves.length - 1; i >= 0; i--) {
          const w = this._waves[i];
          const age = now - w.born;
          if (age >= w.life) { this._waves.splice(i, 1); continue; }
          if (age < 0) continue;
          const t = age / w.life;
          const ease = 1 - (1 - t) * (1 - t);           // ease-out
          const r = w.r0 + (w.r1 - w.r0) * ease;
          const alpha = (1 - t) * 0.9;
          if (w.kind === 'ring') {
            if (!ctx.arc) continue;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = w.color;
            ctx.lineWidth = w.width * (1 - t * 0.6);
            ctx.beginPath();
            ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            // Row sweep: a bright band widening out from the center, fading
            // toward its leading edges.
            const hh = w.width / 2;
            ctx.globalAlpha = alpha * 0.4;
            ctx.fillStyle = w.color;
            ctx.fillRect(w.x - r, w.y - hh, r * 2, hh * 2);
            ctx.globalAlpha = alpha;
            ctx.fillRect(w.x - r, w.y - 1.5, 4, 3);
            ctx.fillRect(w.x + r - 4, w.y - 1.5, 4, 3);
          }
        }
      }

      for (const p of this._buf) {
        if (!p.live) continue;
        const age = now - p.born;
        if (age >= p.life) { p.live = false; continue; }
        if (age < 0) continue;
        this._pos(p, age, a);
        const t = age / p.life;
        const fade = 1 - t * t;                             // hold bright, then drop
        if (p.kind === KIND_SPARK) {
          this._pos(p, Math.max(0, age - SPARK_TRAIL_MS), b);
          ctx.globalAlpha = fade;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          if (ctx.beginPath && ctx.lineTo && ctx.stroke) {
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(a.x, a.y);
            ctx.stroke();
          } else {
            ctx.fillStyle = p.color;
            ctx.fillRect(a.x - p.size / 2, a.y - p.size / 2, p.size, p.size);
          }
        } else if (p.kind === KIND_ORB) {
          const s = p.size * (1 + 0.6 * t);
          const sprite = this._glowSprite(p.color);
          ctx.globalAlpha = fade * 0.7;
          if (sprite && ctx.drawImage) {
            ctx.drawImage(sprite, a.x - s / 2, a.y - s / 2, s, s);
          } else {
            ctx.fillStyle = p.color;
            ctx.fillRect(a.x - s / 4, a.y - s / 4, s / 2, s / 2);
          }
        } else {
          const s = p.size * (1 - 0.3 * t);
          ctx.globalAlpha = fade;
          ctx.fillStyle = p.color;
          if (ctx.save && ctx.rotate && ctx.translate) {
            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(p.rot + p.spin * age);
            ctx.fillRect(-s / 2, -s / 2, s, s);
            // Hot core: a smaller white square, additive, gives each chunk
            // a bright center that blooms when chunks overlap.
            ctx.globalAlpha = fade * 0.45;
            ctx.fillStyle = WHITE;
            ctx.fillRect(-s / 4, -s / 4, s / 2, s / 2);
            ctx.restore();
          } else {
            ctx.fillRect(a.x - s / 2, a.y - s / 2, s, s);
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = prevOp || 'source-over';
    },
  };

  root.Tetris.Particles = Particles;
})(window);
