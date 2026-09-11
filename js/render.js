// js/render.js — browser-only. See PLAN.md Phase 5.
//
// Canvas 2D rendering: the board, the active piece, the ghost piece (its
// landing position, recomputed every frame from Game.ghostY), the 3-piece
// next queue, and the hold box. Reads state from the game object created by
// game.js; writes nothing back to it.
//
// No dual-export: it touches the DOM/canvas, so it is browser-only and just
// attaches window.Tetris.Render. The requestAnimationFrame loop that drives
// frame() and the screen wiring come in Phase 9; this phase is the renderer.
//
// Colors mirror the --piece-* tokens in style.css so the canvas and the rest
// of the UI stay in sync. If you change one, change the other.

(function (root) {
  'use strict';

  const T = (root.Tetris = root.Tetris || {});
  const Board = T.Board;
  const Piece = T.Piece;

  // One pixel per cell. 30px keeps a 10x20 field at 300x600.
  const CELL = 30;
  const BUFFER = Board.BUFFER; // hidden rows above the visible field (4)
  const W = Board.WIDTH;       // visible columns (10)
  const H = Board.HEIGHT;      // visible rows (20)

  // Guideline piece colors — matches the --piece-* CSS tokens in style.css.
  const COLORS = {
    I: '#33e0ff',
    O: '#ffd93d',
    T: '#b57cff',
    S: '#3ddc84',
    Z: '#ff5a5a',
    J: '#4d7bff',
    L: '#ff9f43',
  };

  const Render = {
    CELL: CELL,
    COLORS: COLORS,
    _ready: false,
    _ctx: {},
     // Pure render-side juice (Phase 11): a hard-drop pulses the board, a line
     // clear flashes it. Timed in ms; the model already collapsed the rows.
    _lastHardDrop: 0,
    _lastEvents: null,
    _flashUntil: 0,
    _flashMs: 160,
    _pulseUntil: 0,
    _pulseMs: 130,

    // Grab the three canvases and size their back-buffers. Idempotent, and
    // safe to call every frame: it no-ops once ready and backs off (returns
    // without setting _ready) if the DOM isn't up yet, so the caller can retry.
    setup() {
      if (this._ready) return this;
      const b = document.getElementById('board-canvas');
      const h = document.getElementById('hold-canvas');
      const n = document.getElementById('next-canvas');
      if (!b || !h || !n) return this; // DOM not ready; retry next frame
      this._ctx = {
        board: b.getContext('2d'),
        hold: h.getContext('2d'),
        next: n.getContext('2d'),
      };
      // Back-buffers are allocated at devicePixelRatio and drawn through a
      // base scale transform, so all drawing code stays in logical CELL
      // units while the bitmap is crisp on retina/phone screens. The CSS
      // display size is set separately (style.css), never inferred from
      // the bitmap size.
      const dpr = this._dpr = this._devicePixelRatio();
      this._sizeCanvas(b, this._ctx.board, W * CELL, H * CELL, dpr);
      this._sizeCanvas(h, this._ctx.hold, 4 * CELL, 4 * CELL, dpr);
      this._sizeCanvas(n, this._ctx.next, 4 * CELL, 3 * 4 * CELL, dpr); // three stacked 4x4 slots
      this._ready = true;
      return this;
    },

    _devicePixelRatio() {
      const w = (typeof window !== 'undefined') ? window : null;
      const dpr = (w && w.devicePixelRatio) || 1;
      return Math.min(Math.max(dpr, 1), 3);
    },

    _sizeCanvas(canvas, ctx, logicalW, logicalH, dpr) {
      canvas.width = Math.round(logicalW * dpr);
      canvas.height = Math.round(logicalH * dpr);
      if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    // Draw one full frame from a game object. No-ops if the DOM isn't ready.
    frame(g) {
      // A DPR change (window dragged to another monitor, browser zoom)
      // re-allocates the back-buffers at the new density.
      if (this._ready && this._devicePixelRatio() !== this._dpr) this._ready = false;
      this.setup();
      if (!this._ready) return;
      const c = this._ctx;
       // now drives the FX timers; falls back to 0 off-canvas so a test never
       // sees a NaN. performance.now() is what the rAF loop in main.js uses.
      const now = (typeof performance !== 'undefined' ? performance.now() : 0);
      this._updateFx(g, now);
      this._clear(c.board, W, H);
       // A hard-drop briefly shakes the whole field (translate, then restore).
      c.board.save();
      if (now < this._pulseUntil) {
        const t = (this._pulseUntil - now) / this._pulseMs;
        c.board.translate(0, Math.sin(now / 8) * 3 * t);
        }
      this._drawBoard(c.board, g.board);
      if (g.current) {
        this._drawGhost(c.board, g.current, g.ghostY());
        this._drawActive(c.board, g.current);
       }
       // Phase 15: particles draw inside the shake transform, so a burst
       // moves with the field during the hard-drop pulse.
      if (T.Particles) T.Particles.draw(c.board, now);
      c.board.restore();
       // A line clear flashes a white wash over the field, fading out.
      if (now < this._flashUntil) {
        const t = (this._flashUntil - now) / this._flashMs;
        c.board.fillStyle = 'rgba(255,255,255,' + (0.25 * t) + ')';
        c.board.fillRect(0, 0, W * CELL, H * CELL);
        }
      this._clear(c.hold, 4, 4);
      this._drawHold(c.hold, g.holdType, g.holdUsed);
      this._clear(c.next, 4, 12);
      this._drawNext(c.next, g.nextQueue);
     },

    // ---- internals (operate on a canvas 2D context) ----

     // Advance the render-only FX timers. A hard-drop bumps g.hardDropAt; a line
     // clear replaces g.lastEvents with a fresh {type:'lineClear'} object. We key
     // off those changes so the model stays pure — it never writes render state.
     // The first frame sees hardDropAt as undefined (guard with != null) so a
     // fresh board doesn't pulse on its own.
     _updateFx(g, now) {
      if (g.hardDropAt != null && g.hardDropAt !== this._lastHardDrop) {
        this._lastHardDrop = g.hardDropAt;
        this._pulseUntil = now + this._pulseMs;
         // Phase 15: an impact puff where the piece landed, alongside the shake.
        if (T.Particles && g.hardDropLanding) {
          T.Particles.spawnHardDrop(g.hardDropLanding, now);
          }
         }
      if (g.lastEvents !== this._lastEvents) {
        this._lastEvents = g.lastEvents;
        if (g.lastEvents && g.lastEvents.type === 'lineClear') {
          this._flashUntil = now + this._flashMs;
           // Phase 15: a burst in the cleared rows' own cell colors — bigger
           // and showier for a Tetris (4 lines).
          if (T.Particles) {
            T.Particles.spawnLineClear(
              g.lastEvents.rows, g.lastEvents.rowCells,
              g.lastEvents.lines === 4, now);
            }
          }
        }
     },

    _clear(ctx, cols, rows) {
      ctx.clearRect(0, 0, cols * CELL, rows * CELL);
      ctx.fillStyle = '#0e0f1a'; // matches --bg
      ctx.fillRect(0, 0, cols * CELL, rows * CELL);
    },

    // A single filled cell with a beveled (3D) edge and a 1px grid border.
    // alpha < 1 dims the whole cell (used for the ghost and a spent hold).
    _fillCell(ctx, px, py, color, alpha) {
      const s = CELL;
      const edge = Math.max(2, Math.round(s * 0.12));
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.fillStyle = color;
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.fillRect(px, py, s, edge);
      ctx.fillRect(px, py, edge, s);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(px, py + s - edge, s, edge);
      ctx.fillRect(px + s - edge, py, edge, s);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
      ctx.restore();
    },

    // The static field: a faint grid, then every locked cell.
    _drawBoard(ctx, board) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = 1; x < W; x++) {
        ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H * CELL); ctx.stroke();
      }
      for (let y = 1; y < H; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W * CELL, y * CELL); ctx.stroke();
      }
      for (let row = BUFFER; row < BUFFER + H; row++) {
        for (let x = 0; x < W; x++) {
          const t = board[row][x];
          if (t) this._fillCell(ctx, x * CELL, (row - BUFFER) * CELL, COLORS[t] || '#888');
        }
      }
    },

    // A piece at absolute board position; cells that sit in the hidden spawn
    // buffer (row < BUFFER) are not drawn — they're above the visible field.
    _drawPieceCells(ctx, type, rotation, x, y, color, alpha) {
      const cells = Piece.getCells(type, rotation, x, y);
      for (let i = 0; i < cells.length; i++) {
        const cx = cells[i][0];
        const cy = cells[i][1];
        const py = (cy - BUFFER) * CELL;
        if (py < 0) continue; // in the buffer
        this._fillCell(ctx, cx * CELL, py, color, alpha);
      }
    },

    _drawGhost(ctx, current, gy) {
      this._drawPieceCells(ctx, current.type, current.rotation, current.x, gy, COLORS[current.type], 0.30);
    },

    _drawActive(ctx, current) {
      this._drawPieceCells(ctx, current.type, current.rotation, current.x, current.y, COLORS[current.type], 1);
    },

    // Draw a spawn-rotation piece centered in a slotW x slotH cell slot whose
    // top-left is at (col, rowSlot) in cell coordinates.
    _drawPieceCentered(ctx, type, col, rowSlot, slotW, slotH, color, alpha) {
      const cells = Piece.getCells(type, 0, 0, 0);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < cells.length; i++) {
        const x = cells[i][0], y = cells[i][1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const pw = (maxX - minX + 1) * CELL;
      const ph = (maxY - minY + 1) * CELL;
      const ox = col * CELL + Math.floor((slotW * CELL - pw) / 2) - minX * CELL;
      const oy = rowSlot * CELL + Math.floor((slotH * CELL - ph) / 2) - minY * CELL;
      for (let i = 0; i < cells.length; i++) {
        this._fillCell(ctx, ox + cells[i][0] * CELL, oy + cells[i][1] * CELL, color, alpha);
      }
    },

    // Hold box: a bordered slot; the held piece is dimmed when this piece's
    // hold has already been used (so the player knows it's spent until lock).
    _drawHold(ctx, holdType, holdUsed) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, 4 * CELL - 1, 4 * CELL - 1);
      if (!holdType) return;
      this._drawPieceCentered(ctx, holdType, 0, 0, 4, 4, COLORS[holdType], holdUsed ? 0.35 : 1);
    },

    // Next queue: up to 3 pieces, one per stacked 4x4 slot, ordered next-first.
    _drawNext(ctx, nextQueue) {
      const slot = 4;
      for (let i = 0; i < 3; i++) {
        const type = nextQueue[i];
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, i * slot * CELL + 0.5, 4 * CELL - 1, slot * CELL - 1);
        if (!type) continue;
        // further-out pieces dim slightly for a sense of depth.
        // rowSlot is a CELL row, so slot i starts at i * slot cells down —
        // passing bare i drew all three pieces in the first 4x4 box (16a).
        this._drawPieceCentered(ctx, type, 0, i * slot, 4, slot, COLORS[type], i === 0 ? 1 : 0.7 - i * 0.15);
      }
    },
  };

  root.Tetris.Render = Render;
})(window);
