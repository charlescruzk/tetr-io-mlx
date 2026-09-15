// js/layout.js — pure game-logic, no DOM. See PLAN.md Phase 27.
//
// The touch-control layout model. The on-screen buttons live on a COLS x ROWS
// grid split down the middle: columns 0..SPLIT-1 are the left-thumb cluster,
// SPLIT..COLS-1 the right-thumb cluster (touch.js renders each cluster as its
// own CSS grid, so portrait and landscape both work from one layout). Every
// one of the seven actions occupies exactly one cell, or two side-by-side
// cells when `w` is 2 (the wide soft-drop bar in the default). A button can
// never straddle the split.
//
// Layouts are plain data ({ action: { c, r, w } }) and every mutator returns
// a new layout (or null when the edit isn't possible), so the editor in
// ui.js can be a thin "select an action, tap a cell" loop and the rules stay
// testable in Node. `parse()` validates so a corrupt profile can't produce a
// layout with a missing or overlapping button.
//
// Dual-export: loadable via <script> in the browser (attaches to
// window.Tetris.Layout) and via require() in Node for tests/run.js.
(function (root) {
  'use strict';

  const COLS = 6;
  const ROWS = 3;
  const SPLIT = 3;
  const ACTIONS = ['left', 'right', 'soft', 'hard', 'cw', 'ccw', 'hold'];

  // What each button shows. `small` renders the word-labels in a smaller
  // face; `primary` gets the accent fill (the main rotate).
  const LABELS = {
    left:  { text: '←', aria: 'Move left' },
    right: { text: '→', aria: 'Move right' },
    soft:  { text: '↓', aria: 'Soft drop' },
    hard:  { text: 'Drop', aria: 'Hard drop', small: true },
    cw:    { text: '↻', aria: 'Rotate clockwise', primary: true },
    ccw:   { text: '↺', aria: 'Rotate counter-clockwise' },
    hold:  { text: 'Hold', aria: 'Hold', small: true },
  };

  const PRESETS = {
    // Phase 14/18 layout: movement left, actions right.
    default: {
      name: 'Default',
      cells: {
        left: { c: 0, r: 1, w: 1 }, right: { c: 1, r: 1, w: 1 }, soft: { c: 0, r: 2, w: 2 },
        hold: { c: 3, r: 1, w: 1 }, ccw: { c: 4, r: 1, w: 1 },
        cw: { c: 3, r: 2, w: 1 }, hard: { c: 4, r: 2, w: 1 },
      },
    },
    // Hard drop above the arrows, both rotations stacked in one column,
    // Hold out on the far right.
    dropTop: {
      name: 'Drop on top',
      cells: {
        hard: { c: 0, r: 0, w: 2 }, left: { c: 0, r: 1, w: 1 }, right: { c: 1, r: 1, w: 1 },
        soft: { c: 0, r: 2, w: 2 },
        ccw: { c: 3, r: 1, w: 1 }, cw: { c: 3, r: 2, w: 1 }, hold: { c: 5, r: 2, w: 1 },
      },
    },
    // The default flipped for left-handed players.
    mirrored: {
      name: 'Mirrored',
      cells: {
        left: { c: 4, r: 1, w: 1 }, right: { c: 5, r: 1, w: 1 }, soft: { c: 4, r: 2, w: 2 },
        hold: { c: 2, r: 1, w: 1 }, ccw: { c: 1, r: 1, w: 1 },
        cw: { c: 2, r: 2, w: 1 }, hard: { c: 1, r: 2, w: 1 },
      },
    },
  };

  function clone(layout) {
    const out = {};
    for (const a of Object.keys(layout)) {
      out[a] = { c: layout[a].c, r: layout[a].r, w: layout[a].w };
    }
    return out;
  }

  function create(preset) {
    const p = PRESETS[preset] || PRESETS.default;
    return clone(p.cells);
  }

  // Every cell a placement covers.
  function footprint(cell) {
    const out = [];
    for (let i = 0; i < cell.w; i++) out.push([cell.c + i, cell.r]);
    return out;
  }

  // In bounds and entirely on one side of the split.
  function cellFits(cell) {
    if (!cell || !(cell.w === 1 || cell.w === 2)) return false;
    if (!Number.isInteger(cell.c) || !Number.isInteger(cell.r)) return false;
    if (cell.r < 0 || cell.r >= ROWS || cell.c < 0) return false;
    const last = cell.c + cell.w - 1;
    if (last >= COLS) return false;
    return (last < SPLIT) || (cell.c >= SPLIT);
  }

  function overlaps(a, b) {
    if (a.r !== b.r) return false;
    return a.c < b.c + b.w && b.c < a.c + a.w;
  }

  // All seven actions present, each fits, none overlap.
  function isValid(layout) {
    if (!layout || typeof layout !== 'object') return false;
    for (const a of ACTIONS) if (!cellFits(layout[a])) return false;
    for (let i = 0; i < ACTIONS.length; i++) {
      for (let j = i + 1; j < ACTIONS.length; j++) {
        if (overlaps(layout[ACTIONS[i]], layout[ACTIONS[j]])) return false;
      }
    }
    return true;
  }

  // Which action covers (c, r), or null.
  function occupant(layout, c, r) {
    for (const a of ACTIONS) {
      const cell = layout[a];
      if (cell && cell.r === r && c >= cell.c && c < cell.c + cell.w) return a;
    }
    return null;
  }

  // Move `action` so its left cell is at (c, r), keeping its width. Anything
  // it would land on is displaced into the cells the moved action vacated
  // (a swap); if that displaced button doesn't fit there, the move fails.
  // Returns the new layout, or null.
  function move(layout, action, c, r) {
    if (ACTIONS.indexOf(action) < 0 || !layout[action]) return null;
    const next = clone(layout);
    const from = next[action];
    const to = { c: c, r: r, w: from.w };
    if (!cellFits(to)) return null;
    if (to.c === from.c && to.r === from.r) return next;
    next[action] = to;
    // Displace whoever we landed on into our old spot.
    const displaced = ACTIONS.filter((a) => a !== action && overlaps(next[a], to))
      .sort((a, b) => next[a].c - next[b].c); // keep their left-to-right order
    let slotC = from.c;
    for (const a of displaced) {
      const cell = { c: slotC, r: from.r, w: next[a].w };
      // A displaced pair (two singles under a wide bar) packs left-to-right
      // into the vacated bar; anything that doesn't fit fails the move.
      if (!cellFits(cell) || overlaps(cell, to)) return null;
      next[a] = cell;
      slotC += cell.w;
    }
    return isValid(next) ? next : null;
  }

  // Make an action one or two cells wide (growing to the right); null if the
  // wider footprint doesn't fit or would cover another button.
  function setWide(layout, action, wide) {
    if (ACTIONS.indexOf(action) < 0 || !layout[action]) return null;
    const next = clone(layout);
    next[action].w = wide ? 2 : 1;
    if (!cellFits(next[action])) {
      // Try growing to the left instead before giving up.
      next[action].c -= 1;
      if (!cellFits(next[action])) return null;
    }
    return isValid(next) ? next : null;
  }

  // Mirror the whole layout across the split. The left/right arrows swap
  // back afterwards so "←" still sits left of "→" — mirroring is about which
  // thumb does what, not about reversing the arrows.
  function mirror(layout) {
    const next = clone(layout);
    for (const a of ACTIONS) {
      const cell = next[a];
      cell.c = COLS - (cell.c + cell.w);
    }
    const l = next.left; next.left = next.right; next.right = l;
    return isValid(next) ? next : null;
  }

  // Per-cluster render data with local coordinates: each side is trimmed to
  // the bounding box of its buttons so an unused row or column costs no
  // space (and an empty side renders nothing).
  function clusters(layout) {
    const out = { left: null, right: null };
    for (const side of ['left', 'right']) {
      const items = [];
      let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
      for (const a of ACTIONS) {
        const cell = layout[a];
        const onSide = side === 'left' ? cell.c < SPLIT : cell.c >= SPLIT;
        if (!onSide) continue;
        items.push({ action: a, c: cell.c, r: cell.r, w: cell.w });
        minC = Math.min(minC, cell.c); maxC = Math.max(maxC, cell.c + cell.w - 1);
        minR = Math.min(minR, cell.r); maxR = Math.max(maxR, cell.r);
      }
      if (!items.length) continue;
      for (const it of items) { it.c -= minC; it.r -= minR; }
      out[side] = { cols: maxC - minC + 1, rows: maxR - minR + 1, items: items };
    }
    return out;
  }

  // Which preset (if any) a layout equals — the editor highlights it.
  function presetOf(layout) {
    for (const key of Object.keys(PRESETS)) {
      const p = PRESETS[key].cells;
      let same = true;
      for (const a of ACTIONS) {
        const x = layout[a], y = p[a];
        if (!x || x.c !== y.c || x.r !== y.r || x.w !== y.w) { same = false; break; }
      }
      if (same) return key;
    }
    return null;
  }

  function serialize(layout) {
    return JSON.stringify(layout);
  }

  // Validate a stored layout; anything off falls back to the default.
  function parse(raw) {
    let data;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return create(); }
    if (!data || typeof data !== 'object') return create();
    const layout = {};
    for (const a of ACTIONS) {
      const cell = data[a];
      if (!cell || typeof cell !== 'object') return create();
      layout[a] = { c: cell.c, r: cell.r, w: cell.w == null ? 1 : cell.w };
    }
    return isValid(layout) ? layout : create();
  }

  const Layout = {
    COLS, ROWS, SPLIT, ACTIONS, LABELS, PRESETS,
    create, clone, isValid, occupant, move, setWide, mirror, clusters, presetOf,
    footprint, serialize, parse,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Layout;
  } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.Layout = Layout;
  }
})(typeof window !== 'undefined' ? window : globalThis);
