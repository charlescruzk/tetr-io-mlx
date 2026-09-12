// js/backgroundsim.js — pure background animation simulation. See PLAN.md Phase 20.
//
// Dual-export: require()'d in Node for tests/run.js and attached to
// window.Tetris.BackgroundSim in the browser. No canvas here — just positions,
// velocities, wrap-around, and pulse decay — so it is unit-testable.
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;

  const DEFAULT_SHAPE_COUNT = 18;
  const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const PALETTES = {
    dark: { hueBase: 240, hueRange: 30, sat: 55, light: 18, alpha: 0.18 },
    clear: { hueBase: 260, hueRange: 60, sat: 70, light: 28, alpha: 0.28 },
    tetris: { hueBase: 190, hueRange: 80, sat: 75, light: 32, alpha: 0.35 },
  };

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function wrap(v) { return v - Math.floor(v); }

  function makeShape(index, total) {
    return {
      x: Math.random(),
      y: Math.random(),
      rot: Math.random() * Math.PI * 2,
      vx: rand(-0.03, 0.03),
      vy: rand(-0.02, 0.02),
      vr: rand(-0.3, 0.3),
      type: PIECE_TYPES[index % PIECE_TYPES.length],
      size: rand(0.04, 0.09),
      alpha: rand(0.08, 0.18),
      pulse: 0,
      pulseDecay: rand(0.8, 1.2),
    };
  }

  const BackgroundSim = {
    DEFAULT_SHAPE_COUNT: DEFAULT_SHAPE_COUNT,
    PALETTES: PALETTES,
    PIECE_TYPES: PIECE_TYPES,

    create(opts) {
      opts = opts || {};
      const count = opts.count || DEFAULT_SHAPE_COUNT;
      const shapes = [];
      for (let i = 0; i < count; i++) shapes.push(makeShape(i, count));
      return {
        width: 1,
        height: 1,
        shapes: shapes,
        palette: 'dark',
        reducedMotion: !!opts.reducedMotion,
        // Event pulses decay over this many milliseconds.
        eventPulse: 0,
        eventPulseDecay: 1.2,
      };
    },

    // Advance the simulation by dtMs. `opts` carries reactive inputs:
    //   level        — higher levels make shapes drift a little faster
    //   eventPulse   — inject a pulse (line clear / tetris / level up)
    //   reducedMotion — if true, positions do not change
    step(state, dtMs, opts) {
      opts = opts || {};
      const dt = dtMs / 1000;
      const speedMul = 1 + ((opts.level || 1) - 1) * 0.035;

      // Palette reacts to play intensity.
      if (opts.tetris) state.palette = 'tetris';
      else if (opts.lineClear || opts.levelUp) state.palette = 'clear';
      else state.palette = 'dark';

      // Inject event pulse if requested.
      if (opts.eventPulse > 0) {
        state.eventPulse = Math.max(state.eventPulse, opts.eventPulse);
      }
      // Decay the global event pulse.
      if (state.eventPulse > 0) {
        state.eventPulse = Math.max(0, state.eventPulse - dtMs * state.eventPulseDecay);
      }

      for (const s of state.shapes) {
        // Decay per-shape pulse.
        if (s.pulse > 0) {
          s.pulse = Math.max(0, s.pulse - dtMs * s.pulseDecay);
        }
        // Reduced motion keeps everything still.
        if (state.reducedMotion || opts.reducedMotion) continue;
        s.x = wrap(s.x + s.vx * dt * speedMul);
        s.y = wrap(s.y + s.vy * dt * speedMul);
        s.rot += s.vr * dt * speedMul;
      }
      return state;
    },

    // Snapshot of derived drawing values (no canvas). Useful for tests and
    // keeps the renderer from recomputing the same math.
    derive(state, shape) {
      const pal = PALETTES[state.palette];
      const pulse = clamp(state.eventPulse + shape.pulse, 0, 1);
      const alpha = clamp(shape.alpha + pulse * pal.alpha * 1.8, 0, 0.85);
      const hue = pal.hueBase + (shape.x - 0.5) * pal.hueRange;
      const size = shape.size * (1 + pulse * 0.25);
      return {
        x: shape.x,
        y: shape.y,
        rot: shape.rot,
        size: size,
        alpha: alpha,
        color: `hsla(${hue}, ${pal.sat}%, ${pal.light}%, ${alpha})`,
        glow: `hsla(${hue}, ${pal.sat}%, ${pal.light + 15}%, ${alpha * 0.5})`,
      };
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BackgroundSim;
  } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.BackgroundSim = BackgroundSim;
  }
})(typeof window !== 'undefined' ? window : globalThis);
