// js/render.js — browser-only. See PLAN.md Phases 5, 11, 21.
//
// Canvas 2D rendering: the board, the active piece, the ghost piece, the
// 3-piece next queue, and the hold box. Phase 21 adds a glossy cell sprite
// sheet, glowing ghost outline, lock flash, a render-side line-clear
// animation (snapshot → flash → dissolve → slide), hard-drop trail, floating
// popups, and board vignette + danger tint.
//
// All model/game logic stays in game.js — the renderer only reads signals
// the model already emits (g.lastEvents, g.hardDropAt, g.hardDropLanding,
// g.level, g.score, g.state) and keeps its own render-only timers.

(function (root) {
  'use strict';

  const T = (root.Tetris = root.Tetris || {});
  const Board = T.Board;
  const Piece = T.Piece;
  const Fx = T.FxTimeline;

  // One pixel per cell. 30px keeps a 10x20 field at 300x600.
  const CELL = 30;
  const BUFFER = Board.BUFFER; // hidden rows above the visible field (4)
  const W = Board.WIDTH;       // visible columns (10)
  const H = Board.HEIGHT;      // visible rows (20)

  // Padding around each pre-rendered cell sprite so the baked glow isn't
  // clipped. Active pieces use a bigger glow than locked cells.
  const SPRITE_PAD = 12;

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
    _sprites: null,
    _popups: null,

    // Pure render-side juice timers.
    _lastHardDrop: 0,
    _lastEvents: null,
    _lastScore: 0,
    _lastLevel: 1,
    _lastState: null,
    _flashUntil: 0,
    _flashMs: 160,
    _pulseUntil: 0,
    _pulseMs: 130,
    _lockFlash: null,
    _lineClear: null,
    _hardDropTrail: null,

    // Grab the three canvases and size their back-buffers. Idempotent, and
    // safe to call every frame: it no-ops once ready and backs off (returns
    // without setting _ready) if the DOM isn't up yet, so the caller can retry.
    setup() {
      if (this._ready) return this;
      const b = document.getElementById('board-canvas');
      const h = document.getElementById('hold-canvas');
      const n = document.getElementById('next-canvas');
      if (!b || !h || !n) return this;
      this._ctx = {
        board: b.getContext('2d'),
        hold: h.getContext('2d'),
        next: n.getContext('2d'),
      };
      const dpr = this._dpr = this._devicePixelRatio();
      this._sizeCanvas(b, this._ctx.board, W * CELL, H * CELL, dpr);
      this._sizeCanvas(h, this._ctx.hold, 4 * CELL, 4 * CELL, dpr);
      this._sizeCanvas(n, this._ctx.next, 4 * CELL, 3 * 4 * CELL, dpr);
      this._buildSprites();
      this._popups = Fx.Popups.create();
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

    // Phase 21: pre-render glossy cells with baked glow. Active pieces glow
    // more than locked cells. Drawing these is a single drawImage per cell
    // instead of a shadowBlur call every frame.
    _buildSprites() {
      this._sprites = {};
      for (const type of Object.keys(COLORS)) {
        this._sprites[type] = {
          active: this._makeSprite(type, COLORS[type], 10),
          locked: this._makeSprite(type, COLORS[type], 4),
        };
      }
    },

    _makeSprite(type, color, glow) {
      const canvas = document.createElement('canvas');
      canvas.width = CELL + SPRITE_PAD * 2;
      canvas.height = CELL + SPRITE_PAD * 2;
      const ctx = canvas.getContext('2d');
      const s = CELL;
      const edge = Math.max(2, Math.round(s * 0.12));
      const px = SPRITE_PAD;
      const py = SPRITE_PAD;

      // Glow is baked into the sprite via shadowColor.
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
      ctx.fillStyle = color;
      ctx.fillRect(px, py, s, s);
      ctx.restore();

      // Bevel highlights and inner border (no shadow here, we want them sharp).
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.fillRect(px, py, s, edge);
      ctx.fillRect(px, py, edge, s);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(px, py + s - edge, s, edge);
      ctx.fillRect(px + s - edge, py, edge, s);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);

      return canvas;
    },

    // Draw one full frame from a game object. No-ops if the DOM isn't ready.
    frame(g) {
      if (this._ready && this._devicePixelRatio() !== this._dpr) this._ready = false;
      this.setup();
      if (!this._ready) return;
      const c = this._ctx;
      const now = (typeof performance !== 'undefined' ? performance.now() : 0);
      this._updateFx(g, now);

      this._clear(c.board, W, H);

      // Hard-drop board shake.
      c.board.save();
      if (now < this._pulseUntil) {
        const t = (this._pulseUntil - now) / this._pulseMs;
        c.board.translate(0, Math.sin(now / 8) * 3 * t);
      }

      // Phase 21: hard-drop trail drawn behind the locked piece and before
      // the board so it sits under the cells.
      this._drawHardDropTrail(c.board, now);

      // Board field + active/ghost + particles + line-clear overlay.
      this._drawBoard(c.board, g.board, now);
      if (g.current) {
        this._drawGhost(c.board, g.current, g.ghostY());
        this._drawActive(c.board, g.current);
      }
      if (T.Particles) T.Particles.draw(c.board, now);

      // Lock flash overlay (white flash on the cells that just locked).
      this._drawLockFlash(c.board, now);

      // Vignette and danger tint sit on top of the field but under popups.
      this._drawVignette(c.board);
      this._drawDangerTint(c.board, g.board);

      // Floating popups (score, TETRIS!, level up, etc.).
      this._drawPopups(c.board, g, now);

      // Phase 11/15: line-clear white wash on top of everything board-side.
      if (now < this._flashUntil) {
        const t = (this._flashUntil - now) / this._flashMs;
        c.board.fillStyle = 'rgba(255,255,255,' + (0.25 * t) + ')';
        c.board.fillRect(0, 0, W * CELL, H * CELL);
      }

      c.board.restore();

      this._clear(c.hold, 4, 4);
      this._drawHold(c.hold, g.holdType, g.holdUsed);
      this._clear(c.next, 4, 12);
      this._drawNext(c.next, g.nextQueue);
    },

    // Advance the render-only FX timers. The model stays pure — all state
    // here is keyed off model signals, never written back to g.
    _updateFx(g, now) {
      if (g.hardDropAt != null && g.hardDropAt !== this._lastHardDrop) {
        this._lastHardDrop = g.hardDropAt;
        this._pulseUntil = now + this._pulseMs;
        if (T.Particles && g.hardDropLanding) {
          T.Particles.spawnHardDrop(g.hardDropLanding, now);
        }
        if (g.hardDropLanding && g.hardDropLanding.fromY != null) {
          this._hardDropTrail = {
            start: now,
            landing: g.hardDropLanding,
          };
        }
      }

      if (g.lastEvents !== this._lastEvents) {
        this._lastEvents = g.lastEvents;
        const ev = g.lastEvents;
        if (ev && ev.type === 'lineClear') {
          this._flashUntil = now + this._flashMs;
          if (T.Particles) {
            T.Particles.spawnLineClear(ev.rows, ev.rowCells, ev.lines === 4, now);
          }
          // Phase 21: capture the visible board snapshot before the collapse
          // so the line-clear animation can flash/dissolve/slide it.
          const snapshot = [];
          for (let vy = 0; vy < H; vy++) {
            snapshot.push(g.board[vy + BUFFER].slice());
          }
          this._lineClear = {
            start: now,
            rows: ev.rows.slice(),
            rowCells: (ev.rowCells || []).map((r) => r.slice()),
            snapshot: snapshot,
          };
          // Tetris and line-clear score popups.
          const centerY = this._lineClearCenterY(ev.rows);
          if (ev.lines === 4) {
            Fx.Popups.spawn(this._popups, 'TETRIS!', W * CELL / 2, centerY, now);
          }
        } else if (ev && ev.type === 'lock') {
          if (ev.cells) {
            this._lockFlash = { start: now, cells: ev.cells, piece: ev.piece };
          }
          if (T.Particles && ev.cells && ev.piece) {
            T.Particles.spawnLock(ev.cells, ev.piece, now);
          }
        }
      }

      // Score popup: +delta when the score increases.
      if (g.score !== this._lastScore) {
        const delta = g.score - this._lastScore;
        if (delta > 0) {
          Fx.Popups.spawn(this._popups, '+' + delta, W * CELL / 2, H * CELL / 2, now);
        }
        this._lastScore = g.score;
      }

      // Level-up popup + particle ring.
      if (g.level !== this._lastLevel) {
        if (g.level > this._lastLevel) {
          Fx.Popups.spawn(this._popups, 'LEVEL ' + g.level, W * CELL / 2, H * CELL / 2, now);
          if (T.Particles) {
            T.Particles.spawnLevelUp(W * CELL / 2, H * CELL / 2, now);
          }
        }
        this._lastLevel = g.level;
      }

      // Sprint win popup.
      if (g.state !== this._lastState) {
        if (g.state === 'won' && g.config && g.config.mode === 'sprint') {
          Fx.Popups.spawn(this._popups, '40 LINES!', W * CELL / 2, H * CELL / 3, now);
        }
        this._lastState = g.state;
      }
    },

    _lineClearCenterY(rows) {
      if (!rows || !rows.length) return H * CELL / 2;
      let sum = 0;
      for (const r of rows) sum += (r - BUFFER) * CELL + CELL / 2;
      return sum / rows.length;
    },

    _clear(ctx, cols, rows) {
      ctx.clearRect(0, 0, cols * CELL, rows * CELL);
      ctx.fillStyle = '#0e0f1a'; // matches --bg
      ctx.fillRect(0, 0, cols * CELL, rows * CELL);
    },

    // Phase 21: blit a pre-rendered sprite. The sprite includes the glow,
    // so this is a single drawImage call per cell.
    _blitCell(ctx, px, py, type, variant, alpha) {
      const sprite = this._sprites && this._sprites[type] && this._sprites[type][variant];
      if (!sprite) {
        // Fallback if sprites haven't built (shouldn't happen after setup).
        this._fillCell(ctx, px, py, COLORS[type] || '#888', alpha);
        return;
      }
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.drawImage(sprite, px - SPRITE_PAD, py - SPRITE_PAD);
      ctx.restore();
    },

    // Legacy cell draw path (used as fallback, and for ghost/hold/next where
    // a simple beveled fill without glow is enough).
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
    _drawBoard(ctx, board, now) {
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
          if (t) this._blitCell(ctx, x * CELL, (row - BUFFER) * CELL, t, 'locked', 1);
        }
      }

      // Phase 21: line-clear animation overlay (snapshot of pre-clear rows).
      if (this._lineClear) {
        const elapsed = now - this._lineClear.start;
        const p = Fx.lineClearProgress(elapsed);
        if (!p.active) {
          this._lineClear = null;
        } else {
          this._drawLineClearOverlay(ctx, p);
        }
      }
    },

    // Draw the pre-clear snapshot during the line-clear animation. Cleared rows
    // flash white and dissolve; rows above the cleared block slide down by the
    // number of cleared rows beneath them.
    _drawLineClearOverlay(ctx, p) {
      const snap = this._lineClear.snapshot;
      const cleared = new Set(this._lineClear.rows);
      // For each snapshot row, count how many cleared rows are below it.
      const slideBy = new Array(H).fill(0);
      for (let vy = 0; vy < H; vy++) {
        const boardY = vy + BUFFER;
        let n = 0;
        for (const r of this._lineClear.rows) {
          if (r > boardY) n++;
        }
        slideBy[vy] = n;
      }

      ctx.save();
      for (let vy = 0; vy < H; vy++) {
        const boardY = vy + BUFFER;
        const isCleared = cleared.has(boardY);
        const yPx = vy * CELL + slideBy[vy] * p.slide * CELL;
        const cells = snap[vy];
        for (let x = 0; x < W; x++) {
          const t = cells[x];
          if (!t) continue;
          if (isCleared) {
            // Dissolve the cleared cells; flash white at the start.
            const alpha = 1 - p.dissolve;
            if (alpha > 0) {
              this._blitCell(ctx, x * CELL, yPx, t, 'locked', alpha);
              if (p.flash > 0) {
                ctx.fillStyle = 'rgba(255,255,255,' + (p.flash * 0.5) + ')';
                ctx.fillRect(x * CELL, yPx, CELL, CELL);
              }
            }
          } else if (slideBy[vy] > 0) {
            // Rows above the cleared block slide down to their new positions.
            this._blitCell(ctx, x * CELL, yPx, t, 'locked', 1);
          }
        }
      }
      ctx.restore();
    },

    // A piece at absolute board position; cells in the hidden spawn buffer are
    // not drawn. Phase 21: active pieces use the glowy 'active' sprite variant.
    _drawPieceCells(ctx, type, rotation, x, y, variant, alpha) {
      const cells = Piece.getCells(type, rotation, x, y);
      for (let i = 0; i < cells.length; i++) {
        const cx = cells[i][0];
        const cy = cells[i][1];
        const py = (cy - BUFFER) * CELL;
        if (py < 0) continue;
        this._blitCell(ctx, cx * CELL, py, type, variant || 'active', alpha);
      }
    },

    // Phase 21: ghost is a glowing outline, not a dim fill, so it never reads
    // as a placed piece.
    _drawGhost(ctx, current, gy) {
      const cells = Piece.getCells(current.type, current.rotation, current.x, gy);
      const color = COLORS[current.type];
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      for (let i = 0; i < cells.length; i++) {
        const cx = cells[i][0];
        const cy = cells[i][1];
        const py = (cy - BUFFER) * CELL;
        if (py < 0) continue;
        ctx.strokeRect(cx * CELL + 1, py + 1, CELL - 2, CELL - 2);
      }
      ctx.restore();
    },

    _drawActive(ctx, current) {
      this._drawPieceCells(ctx, current.type, current.rotation, current.x, current.y, 'active', 1);
    },

    _drawHardDropTrail(ctx, now) {
      if (!this._hardDropTrail) return;
      const elapsed = now - this._hardDropTrail.start;
      const p = Fx.hardDropTrailProgress(elapsed);
      if (!p.active) {
        this._hardDropTrail = null;
        return;
      }
      const landing = this._hardDropTrail.landing;
      if (!landing || landing.fromY == null) return;
      const cells = Piece.getCells(landing.type, landing.rotation, landing.x, landing.y);
      const total = landing.y - landing.fromY;
      if (total <= 0) return;
      const color = COLORS[landing.type];
      const copies = p.copies;
      ctx.save();
      ctx.fillStyle = color;
      for (let k = 1; k <= copies; k++) {
        const frac = k / (copies + 1);
        const alpha = p.alpha * (1 - frac) * 0.45;
        const offsetY = total * frac * CELL;
        ctx.globalAlpha = alpha;
        for (let i = 0; i < cells.length; i++) {
          const cx = cells[i][0];
          const cy = cells[i][1];
          const py = (cy - BUFFER) * CELL - offsetY;
          if (py < 0) continue;
          ctx.fillRect(cx * CELL + 4, py + 4, CELL - 8, CELL - 8);
        }
      }
      ctx.restore();
    },

    _drawLockFlash(ctx, now) {
      if (!this._lockFlash) return;
      const elapsed = now - this._lockFlash.start;
      const alpha = Fx.lockFlashProgress(elapsed);
      if (alpha <= 0) {
        this._lockFlash = null;
        return;
      }
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,' + (alpha * 0.75) + ')';
      const cells = this._lockFlash.cells;
      for (let i = 0; i < cells.length; i++) {
        const cx = cells[i][0];
        const cy = cells[i][1];
        const py = (cy - BUFFER) * CELL;
        if (py < 0) continue;
        ctx.fillRect(cx * CELL, py, CELL, CELL);
      }
      ctx.restore();
    },

    _drawVignette(ctx) {
      const grd = ctx.createRadialGradient(
        W * CELL / 2, H * CELL / 2, H * CELL * 0.35,
        W * CELL / 2, H * CELL / 2, H * CELL * 0.85
      );
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.save();
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W * CELL, H * CELL);
      ctx.restore();
    },

    _drawDangerTint(ctx, board) {
      let filledRows = 0;
      for (let vy = 0; vy < H; vy++) {
        const row = board[vy + BUFFER];
        let has = false;
        for (let x = 0; x < W; x++) {
          if (row[x]) { has = true; break; }
        }
        if (has) filledRows++;
      }
      const alpha = Fx.dangerTintAlpha(filledRows);
      if (alpha <= 0) return;
      const grd = ctx.createLinearGradient(0, 0, 0, H * CELL * 0.45);
      grd.addColorStop(0, 'rgba(255,77,109,' + alpha + ')');
      grd.addColorStop(1, 'rgba(255,77,109,0)');
      ctx.save();
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W * CELL, H * CELL * 0.45);
      ctx.restore();
    },

    _drawPopups(ctx, g, now) {
      ctx.save();
      ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;
      Fx.Popups.draw(this._popups, now, (text, x, y, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x, y);
      });
      ctx.restore();
    },

    // Draw a spawn-rotation piece centered in a slotW x slotH cell slot.
    _drawPieceCentered(ctx, type, col, rowSlot, slotW, slotH, alpha) {
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
        this._blitCell(ctx, ox + cells[i][0] * CELL, oy + cells[i][1] * CELL, type, 'active', alpha);
      }
    },

    _drawHold(ctx, holdType, holdUsed) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, 4 * CELL - 1, 4 * CELL - 1);
      if (!holdType) return;
      this._drawPieceCentered(ctx, holdType, 0, 0, 4, 4, holdUsed ? 0.35 : 1);
    },

    _drawNext(ctx, nextQueue) {
      const slot = 4;
      for (let i = 0; i < 3; i++) {
        const type = nextQueue[i];
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, i * slot * CELL + 0.5, 4 * CELL - 1, slot * CELL - 1);
        if (!type) continue;
        this._drawPieceCentered(ctx, type, 0, i * slot, 4, slot, i === 0 ? 1 : 0.7 - i * 0.15);
      }
    },
  };

  root.Tetris.Render = Render;
})(window);
