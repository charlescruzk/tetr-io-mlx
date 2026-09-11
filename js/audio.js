// js/audio.js — browser-only. See PLAN.md Phase 10 + SPEC.md "Audio".
//
// All sound is synthesized at runtime with the Web Audio API — no external
// files, no CDN. Two buses: an SFX bus (move/rotate/lock/line-clear/…) and a
// music bus (a looping arpeggio). Both are gated by the Settings toggles
// (js/ui.js writes them to localStorage) and applied live via apply().
//
// Browsers keep the AudioContext suspended until a real user gesture, so the
// context is created in unlock() (ui.js wires it to the first pointerdown/
// keydown), not on load. Nothing here touches the DOM, so it's browser-only
// and just attaches window.Tetris.Audio — like input.js, no dual-export.
(function (root) {
   'use strict';

  const T = (root.Tetris = root.Tetris || {});

   // ---- state ----
  const state = {
    sfx: true,          // SFX enabled (Settings toggle)
    music: true,        // music enabled (Settings toggle)
    ctx: null,          // AudioContext, created on unlock()
    master: null,       // master gain -> destination
    sfxGain: null,      // SFX bus -> master
    musicGain: null,    // music bus -> master
    unlocked: false,    // ctx created yet?
    musicTimer: null,   // setInterval id for the music loop
    musicStep: 0,       // index into the music pattern
    };

   // ---- SFX catalog (SPEC.md "SFX needed") ----
   // Each entry is a single blip {freq,dur,type,gain}, a {noise} burst, or an
   // {arpeggio:[...]} run of notes. 'tetris' is a bigger, longer arpeggio so a
   // four-line clear is audibly distinct from a 1–3 line clear.
  const SFX = {
    move:     { freq: 220, dur: 0.03, type: 'square',   gain: 0.10 },
    rotate:   { freq: 330, dur: 0.04, type: 'square',   gain: 0.12 },
    softdrop: { freq: 160, dur: 0.03, type: 'sine',     gain: 0.07 },
    harddrop: { noise: true, dur: 0.12, gain: 0.22 },
    lock:     { freq: 140, dur: 0.05, type: 'triangle', gain: 0.18 },
    hold:     { freq: 440, dur: 0.05, type: 'sine',     gain: 0.12 },
    lineclear:{ arpeggio: [523.25, 659.25, 783.99], dur: 0.18, type: 'sine',     gain: 0.18 },
    tetris:   { arpeggio: [523.25, 659.25, 783.99, 1046.50], dur: 0.34, type: 'sine', gain: 0.22 },
    levelup:  { arpeggio: [392.00, 523.25, 659.25, 783.99], dur: 0.40, type: 'triangle', gain: 0.18 },
    // UI / menu sounds (driven by ui.js, not the gameplay event stream):
    menu:     { freq: 440, dur: 0.05, type: 'sine',     gain: 0.09 },
    start:    { arpeggio: [392.00, 523.25, 659.25], dur: 0.28, type: 'triangle', gain: 0.16 },
    pause:    { freq: 261.63, dur: 0.12, type: 'sine',  gain: 0.14 },
    win:      { arpeggio: [523.25, 659.25, 783.99, 1046.50, 1318.51], dur: 0.60, type: 'sine', gain: 0.20 },
    gameover: { arpeggio: [392.00, 329.63, 261.63], dur: 0.50, type: 'sawtooth', gain: 0.16 },
    };

   // A short repeating arpeggio loop for the background track. C–E–G–C' over E.
  const MUSIC_PATTERN = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63];
  const MUSIC_STEP_MS = 260; // tempo of the loop
  const MUSIC_NOTE_DUR = 0.24;
  const MUSIC_GAIN = 0.05;

  const Audio = {
     // ---- lifecycle ----
       // Create/resume the AudioContext. Must run inside a user gesture
       // (ui.js wires it to the first pointerdown/keydown); calling it on load
       // leaves the context suspended and browsers won't produce sound.
    unlock() {
      try {
        if (!state.ctx) {
          const AC = root.AudioContext || root.webkitAudioContext;
          if (!AC) return; // no Web Audio at all — stay silent, don't throw
          state.ctx = new AC();
          state.master = state.ctx.createGain();
          state.master.gain.value = 1;
          state.master.connect(state.ctx.destination);
          state.sfxGain = state.ctx.createGain();
          state.sfxGain.gain.value = 1;
          state.sfxGain.connect(state.master);
          state.musicGain = state.ctx.createGain();
          state.musicGain.gain.value = MUSIC_GAIN;
          state.musicGain.connect(state.master);
          state.unlocked = true;
           // If music is on, start the loop now that we can actually hear it.
          if (state.music) this.startMusic();
        } else if (state.ctx.state === 'suspended') {
          state.ctx.resume();
        }
       } catch (e) { /* audio unavailable — fail silently */ }
     },

      // Play a named SFX. No-op when SFX is off, the context is locked, or the
      // name isn't in the catalog.
    play(name) {
      if (!state.sfx || !state.ctx) return;
      const def = SFX[name];
      if (!def) return;
      if (def.noise) return _noise(def);
      if (def.arpeggio) return _arpeggio(def);
      _note(def.freq, def.dur, def.type, def.gain, state.sfxGain);
     },

      // Start the looping background track. Idempotent — a second call while it
      // already runs is ignored. No-op when music is off or the ctx is locked.
    startMusic() {
      if (!state.music || !state.ctx || state.musicTimer != null) return;
      if (state.ctx.state === 'suspended') state.ctx.resume();
      state.musicStep = 0;
      state.musicTimer = setInterval(_musicTick, MUSIC_STEP_MS);
     },

      // Stop the background track (e.g. on game over / when toggled off).
    stopMusic() {
      if (state.musicTimer != null) {
        clearInterval(state.musicTimer);
        state.musicTimer = null;
        }
     },

      // Apply Settings live (music/sfx toggles). Called from ui.js on every
      // flip and on load. Turns a just-enabled bus on immediately.
    apply(settings) {
      if (!settings) return;
      if (typeof settings.music === 'boolean') {
        state.music = settings.music;
        if (state.music) this.startMusic();
        else this.stopMusic();
        }
      if (typeof settings.sfx === 'boolean') state.sfx = settings.sfx;
     },

      // Route the game's event stream to the SFX bus. game.onEvent is an
      // optional hook game.js calls on move/rotate/lock/lineClear/…; install it
      // on a fresh game so its events make sound. Safe to call before unlock()
      // — play() no-ops until the context exists.
    install(game) {
      if (!game) return;
      game.onEvent = function (name) {
        if (state.sfx && state.ctx) Audio.play(name);
        };
     },
  };

   // ---- synthesis helpers (operate on the AudioContext in `state`) ----

   // One oscillator + a quick attack/release envelope on a bus.
  function _note(freq, dur, type, gain, bus) {
    const ctx = state.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(bus || state.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    }

   // An arpeggio: schedule its notes back-to-back on the SFX bus.
  function _arpeggio(def) {
    if (!state.ctx) return;
    const notes = def.arpeggio;
    const step = def.dur / notes.length;
    for (let i = 0; i < notes.length; i++) {
      setTimeout(function () {
        _note(notes[i], step * 1.6, def.type || 'sine', def.gain || 0.15, state.sfxGain);
         }, i * step * 1000);
        }
    }

   // A short filtered noise burst — used for the hard-drop "thunk".
  function _noise(def) {
    const ctx = state.ctx;
    if (!ctx) return;
    const dur = def.dur || 0.1;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = def.gain || 0.2;
    src.connect(g);
    g.connect(state.sfxGain);
    src.start();
    }

   // One step of the music loop — a single note from the pattern, looping.
  function _musicTick() {
    if (!state.music || !state.ctx || state.musicTimer == null) return;
    const f = MUSIC_PATTERN[state.musicStep % MUSIC_PATTERN.length];
    state.musicStep++;
    _note(f, MUSIC_NOTE_DUR, 'triangle', 1, state.musicGain);
    }

  root.Tetris.Audio = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
