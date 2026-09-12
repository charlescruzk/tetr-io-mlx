// js/audio.js — browser-only. See PLAN.md Phase 19 + SPEC.md "Audio".
//
// All sound is synthesized at runtime with the Web Audio API — no external
// files, no CDN. Two buses: an SFX bus and a music bus. Both are gated by the
// Settings toggles (js/ui.js writes them to localStorage) and applied live via
// apply().
//
// The music engine (Phase 19) uses a real AudioContext-clock sequencer:
// js/music.js provides the pure note data / timing; this file voices the notes,
// runs the lookahead loop, ducks the music on line clears, and plays stingers.
// The old setInterval arpeggio is gone.
//
// Browsers keep the AudioContext suspended until a real user gesture, so the
// context is created in unlock() (ui.js wires it to the first pointerdown/
// keydown), not on load. Nothing here touches the DOM, so it's browser-only
// and just attaches window.Tetris.Audio.
(function (root) {
  'use strict';

  const T = (root.Tetris = root.Tetris || {});
  const Music = T.Music;

  // ---- state ----
  const state = {
    sfx: true,          // SFX enabled (Settings toggle)
    music: true,        // music enabled (Settings toggle)
    ctx: null,          // AudioContext, created on unlock()
    compressor: null,   // gentle master limiter
    master: null,       // pre-compressor mix bus
    sfxGain: null,      // SFX bus -> master
    musicGain: null,    // static music level -> filter -> duck -> master
    musicFilter: null,  // lowpass for the softer menu variant
    musicDuckGain: null,// sidechain dip on line clears
    unlocked: false,    // ctx created yet?
    musicRunning: false,
    musicCursor: 0,     // beats already scheduled (unbounded)
    musicBpm: 0,
    musicMenu: true,    // true when not actively playing
    musicIntensity: 0,  // 0..1, rises with level to add extra hat/arp layer
    duck: { active: false, startTime: 0 },
    stinger: { active: false, endTime: 0 },
  };

  const LOOKAHEAD_S = 0.20;  // schedule this far ahead
  const MUSIC_BASE_GAIN = 0.10;
  const MENU_GAIN = 0.045;
  const MENU_FILTER_HZ = 520;
  const GAME_FILTER_HZ = 9000;

  // ---- SFX catalog (SPEC.md "SFX needed") ----
  // Each entry is a single blip {freq,dur,type,gain}, a {noise} burst, or an
  // {arpeggio:[...]} run of notes. 'tetris' is bigger/longer so a four-line
  // clear is audibly distinct from a 1–3 line clear.
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
    // UI / menu sounds:
    menu:     { freq: 440, dur: 0.05, type: 'sine',     gain: 0.09 },
    start:    { arpeggio: [392.00, 523.25, 659.25], dur: 0.28, type: 'triangle', gain: 0.16 },
    pause:    { freq: 261.63, dur: 0.12, type: 'sine',  gain: 0.14 },
    win:      { arpeggio: [523.25, 659.25, 783.99, 1046.50, 1318.51], dur: 0.60, type: 'sine', gain: 0.20 },
    gameover: { arpeggio: [392.00, 329.63, 261.63], dur: 0.50, type: 'sawtooth', gain: 0.16 },
  };

  const Audio = {
    // ---- lifecycle ----
    // Create/resume the AudioContext. Must run inside a user gesture
    // (ui.js wires it to the first pointerdown/keydown).
    unlock() {
      try {
        if (!state.ctx) {
          const AC = root.AudioContext || root.webkitAudioContext;
          if (!AC || !Music) return; // no Web Audio or music data — stay silent
          state.ctx = new AC();

          // Master bus: compressor -> destination.
          state.compressor = state.ctx.createDynamicsCompressor();
          state.compressor.threshold.value = -10;
          state.compressor.knee.value = 8;
          state.compressor.ratio.value = 6;
          state.compressor.attack.value = 0.003;
          state.compressor.release.value = 0.12;
          state.compressor.connect(state.ctx.destination);

          state.master = state.ctx.createGain();
          state.master.gain.value = 1;
          state.master.connect(state.compressor);

          // SFX bus.
          state.sfxGain = state.ctx.createGain();
          state.sfxGain.gain.value = 1;
          state.sfxGain.connect(state.master);

          // Music bus: static gain -> lowpass (menu variant) -> duck -> master.
          state.musicFilter = state.ctx.createBiquadFilter();
          state.musicFilter.type = 'lowpass';
          state.musicFilter.frequency.value = MENU_FILTER_HZ;
          state.musicFilter.Q.value = 0.5;

          state.musicDuckGain = state.ctx.createGain();
          state.musicDuckGain.gain.value = 1;

          state.musicGain = state.ctx.createGain();
          state.musicGain.gain.value = MUSIC_BASE_GAIN;
          state.musicGain.connect(state.musicFilter);
          state.musicFilter.connect(state.musicDuckGain);
          state.musicDuckGain.connect(state.master);

          state.unlocked = true;
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
      if (def.arpeggio) return _arpeggio(def, state.sfxGain);
      _note(def.freq, def.dur, def.type, def.gain, state.sfxGain);
    },

    // Start the looping background track. Idempotent; the actual scheduling
    // happens in frame() on the AudioContext clock.
    startMusic() {
      if (!state.ctx) return;
      state.musicRunning = true;
      state.musicCursor = 0;
      state.musicBpm = 0;
    },

    // Stop scheduling new music notes (e.g. on game over / toggle off).
    stopMusic() {
      state.musicRunning = false;
    },

    // Apply Settings live (music/sfx toggles). Called from ui.js on every flip
    // and on load. Turns a just-enabled bus on immediately.
    apply(settings) {
      if (!settings) return;
      if (typeof settings.music === 'boolean') {
        state.music = settings.music;
        if (state.music) this.startMusic();
        else this.stopMusic();
      }
      if (typeof settings.sfx === 'boolean') state.sfx = settings.sfx;
    },

    // Per-frame pump from main.js. Reads g.level / g.state to drive tempo,
    // mix layers, and the menu variant. Schedules music notes ahead of
    // ctx.currentTime.
    frame(g) {
      if (!state.ctx || !state.music || !state.musicRunning) return;
      if (state.ctx.state === 'suspended') {
        try { state.ctx.resume(); } catch (e) { return; }
      }

      const ctx = state.ctx;
      const now = ctx.currentTime;
      const until = now + LOOKAHEAD_S;
      const isMenu = !g || g.state !== 'playing';
      const level = (g && g.level) || 1;

      // BPM follows the level in-game; menu is slower.
      const bpm = isMenu
        ? Music.SONG.menuBpm
        : Music.tempoForLevel(level, Music.SONG.baseBpm);
      state.musicBpm = bpm;

      // Intensity rises with level: extra hat/arp spawns above level 5.
      state.musicIntensity = isMenu ? 0 : Math.min(1, Math.max(0, (level - 5) / 10));

      // Smooth crossfade between menu (soft/filtered/quiet) and game mix.
      _applyMix(isMenu, now);

      // Schedule the next chunk of the composed track.
      const song = Music.SONG;
      const res = Music.schedule(song, state.musicCursor, now, until, bpm);
      for (const note of res.notes) {
        _playMusicNote(note);
      }
      state.musicCursor = res.cursor;

      // Keep the duck envelope moving if active.
      if (state.duck.active) {
        const elapsedMs = (now - state.duck.startTime) * 1000;
        const gain = Music.duckGain(elapsedMs);
        state.musicDuckGain.gain.setValueAtTime(gain, now);
        if (elapsedMs >= 200) state.duck.active = false;
      }
    },

    // Route the game's event stream to SFX + duck + stingers.
    install(game) {
      if (!game) return;
      game.onEvent = function (name) { Audio.onGameEvent(name); };
    },

    onGameEvent(name) {
      if (state.sfx && state.ctx) Audio.play(name);
      if (!state.ctx || !state.music) return;

      // Duck the music bus on every line clear (short sidechain dip).
      if (name === 'lineclear' || name === 'tetris') {
        state.duck.active = true;
        state.duck.startTime = state.ctx.currentTime;
      }
      // Stingers for big moments.
      if (name === 'tetris') _playStinger('tetris');
      else if (name === 'levelup') _playStinger('levelup');
      else if (name === 'gameover') _playStinger('gameover');
    },
  };

  // ---- music voice synthesis ----

  function _playMusicNote(note) {
    const ctx = state.ctx;
    if (!ctx) return;
    if (note.channel === 'lead') return _voiceLead(note);
    if (note.channel === 'bass') return _voiceBass(note);
    if (note.channel === 'pad') return _voicePad(note);
    if (note.channel === 'kick') return _voiceKick(note);
    if (note.channel === 'snare') return _voiceSnare(note);
    if (note.channel === 'hat') return _voiceHat(note);
  }

  function _voiceLead(note) {
    const ctx = state.ctx;
    const t = note.t;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(note.vel * 0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + note.dur * 0.85);

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = note.freq;
    osc.connect(g);
    g.connect(state.musicGain);
    osc.start(t);
    osc.stop(t + note.dur + 0.05);
  }

  function _voiceBass(note) {
    const ctx = state.ctx;
    const t = note.t;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(250, t + note.dur * 0.6);
    filter.Q.value = 0.8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(note.vel * 0.55, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + note.dur * 0.9);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = note.freq;
    osc.connect(filter);
    filter.connect(g);
    g.connect(state.musicGain);
    osc.start(t);
    osc.stop(t + note.dur + 0.03);
  }

  function _voicePad(note) {
    const ctx = state.ctx;
    const t = note.t;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(note.vel * 0.22, t + 0.18);
    g.gain.setValueAtTime(note.vel * 0.22, t + note.dur - 0.12);
    g.gain.linearRampToValueAtTime(0, t + note.dur);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600;
    filter.Q.value = 0.6;

    const detunes = [-10, 0, 10];
    for (const det of detunes) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = note.freq;
      osc.detune.value = det;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + note.dur);
    }
    filter.connect(g);
    g.connect(state.musicGain);
  }

  function _voiceKick(note) {
    const ctx = state.ctx;
    const t = note.t;
    const dur = Math.min(note.dur, 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(note.vel * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + dur);
    osc.connect(g);
    g.connect(state.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  function _voiceSnare(note) {
    const ctx = state.ctx;
    const t = note.t;
    const dur = Math.min(note.dur, 0.14);
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1100;

    const g = ctx.createGain();
    g.gain.value = note.vel * 0.55;
    src.connect(filter);
    filter.connect(g);
    g.connect(state.musicGain);
    src.start(t);
  }

  function _voiceHat(note) {
    const ctx = state.ctx;
    const t = note.t;
    const dur = Math.min(note.dur, 0.06);
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) {
      // High-energy noise with fast decay.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;

    const g = ctx.createGain();
    g.gain.value = note.vel * 0.35;
    src.connect(filter);
    filter.connect(g);
    g.connect(state.musicGain);
    src.start(t);
  }

  // ---- SFX synthesis helpers ----

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

  // Arpeggio scheduled back-to-back on the requested bus (SFX or music).
  function _arpeggio(def, bus) {
    const ctx = state.ctx;
    if (!ctx) return;
    const notes = def.arpeggio;
    const step = def.dur / notes.length;
    const base = ctx.currentTime;
    for (let i = 0; i < notes.length; i++) {
      const t = base + i * step;
      const dur = step * 1.4;
      _noteAt(t, notes[i], dur, def.type || 'sine', def.gain || 0.15, bus || state.sfxGain);
    }
  }

  function _noteAt(t, freq, dur, type, gain, bus) {
    const ctx = state.ctx;
    if (!ctx) return;
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

  // ---- stingers + mix helpers ----

  function _playStinger(name) {
    const st = Music && Music.STINGERS && Music.STINGERS[name];
    if (!st || !state.ctx) return;
    const ctx = state.ctx;
    const t = ctx.currentTime;
    const beatDur = 60 / st.bpm;
    for (const n of st.notes) {
      const nt = t + n.beat * beatDur;
      const dur = n.durBeats * beatDur;
      // Stingers use the lead/bass voicing through the music bus so they sit
      // in the mix rather than on top of it.
      _noteAt(nt, Music.midiToFreq(n.midi), dur, 'triangle', n.vel * 0.25, state.musicGain);
    }
    state.stinger.active = true;
    state.stinger.endTime = t + 2 * beatDur;
  }

  function _applyMix(isMenu, now) {
    const targetGain = isMenu ? MENU_GAIN : MUSIC_BASE_GAIN;
    state.musicGain.gain.setTargetAtTime(targetGain, now, 0.15);

    const targetFilter = isMenu ? MENU_FILTER_HZ : GAME_FILTER_HZ;
    state.musicFilter.frequency.setTargetAtTime(targetFilter, now, 0.2);
  }

  root.Tetris.Audio = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
