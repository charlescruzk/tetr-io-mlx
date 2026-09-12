// js/music.js — pure music data + scheduler. See PLAN.md Phase 19.
//
// Dual-export: require()'d in Node for tests/run.js and attached to
// window.Tetris.Music in the browser. No Web Audio here — this module only
// produces note data and timing math so it is fully unit-testable.
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;

  // Note representation inside a bar: beat offset, duration in beats,
  // MIDI note number, and velocity 0..1.
  //
  // beat is relative to the start of the bar; for 4/4 it lies in [0,4).
  // durBeats > 0. midi is clamped to [0,127].
  function n(beat, durBeats, midi, vel) {
    return { beat: beat, durBeats: durBeats, midi: midi | 0, vel: vel };
  }

  // A 16-bar original loop in A minor / C major at 128 BPM, 4/4. The lead is
  // a Tetris-like minor-key phrase; bass, pad, and drums support it. The same
  // data drives both the in-game mix and the softer menu variant — the audio
  // layer (js/audio.js) applies filtering/gain changes, not this module.
  const SONG = {
    bars: 16,
    beatsPerBar: 4,
    baseBpm: 128,
    menuBpm: 112,
    voices: [
      { name: 'lead', channel: 'lead', pattern: leadPattern() },
      { name: 'bass', channel: 'bass', pattern: bassPattern() },
      { name: 'pad', channel: 'pad', pattern: padPattern() },
      { name: 'kick', channel: 'kick', pattern: drumPattern('kick') },
      { name: 'snare', channel: 'snare', pattern: drumPattern('snare') },
      { name: 'hat', channel: 'hat', pattern: drumPattern('hat') },
    ],
  };

  // Short one-shot musical phrases used as stingers on big game events.
  const STINGERS = {
    tetris: {
      bpm: 150,
      notes: [
        n(0, 0.25, 72, 0.9), n(0.25, 0.25, 76, 0.9),
        n(0.5, 0.25, 79, 0.9), n(0.75, 0.5, 84, 0.9),
      ],
    },
    levelup: {
      bpm: 150,
      notes: [
        n(0, 0.25, 69, 0.8), n(0.25, 0.25, 72, 0.8),
        n(0.5, 0.25, 76, 0.8), n(0.75, 0.5, 81, 0.8),
      ],
    },
    gameover: {
      bpm: 120,
      notes: [
        n(0, 0.5, 69, 0.7), n(0.5, 0.5, 64, 0.7),
        n(1, 0.5, 60, 0.7), n(1.5, 1.0, 57, 0.7),
      ],
    },
  };

  function leadPattern() {
    const a = [
      // A section (bars 0-3)
      [n(0, 0.5, 69, 0.75), n(0.5, 0.5, 72, 0.75), n(1, 1.0, 76, 0.8), n(2, 0.5, 74, 0.75), n(2.5, 0.5, 72, 0.7), n(3, 0.5, 71, 0.7)],
      [n(0, 0.5, 72, 0.75), n(0.5, 0.5, 74, 0.75), n(1, 1.0, 76, 0.8), n(2, 0.5, 79, 0.75), n(2.5, 0.5, 77, 0.7), n(3, 0.5, 76, 0.7)],
      [n(0, 0.5, 74, 0.75), n(0.5, 0.5, 76, 0.75), n(1, 1.0, 77, 0.8), n(2, 0.5, 76, 0.75), n(2.5, 0.5, 74, 0.7), n(3, 0.5, 72, 0.7)],
      [n(0, 1.0, 76, 0.8), n(1, 1.0, 72, 0.75), n(2, 1.0, 69, 0.75), n(3, 0.5, 71, 0.7)],
    ];
    const b = [
      // B section (bars 4-7)
      [n(0, 0.5, 69, 0.75), n(0.5, 0.5, 71, 0.75), n(1, 1.0, 72, 0.8), n(2, 0.5, 74, 0.75), n(2.5, 0.5, 76, 0.7), n(3, 0.5, 77, 0.7)],
      [n(0, 0.5, 76, 0.75), n(0.5, 0.5, 77, 0.75), n(1, 1.0, 79, 0.8), n(2, 0.5, 77, 0.75), n(2.5, 0.5, 76, 0.7), n(3, 0.5, 74, 0.7)],
      [n(0, 0.5, 72, 0.75), n(0.5, 0.5, 74, 0.75), n(1, 1.0, 76, 0.8), n(2, 0.5, 72, 0.75), n(2.5, 0.5, 71, 0.7), n(3, 0.5, 69, 0.7)],
      [n(0, 1.0, 74, 0.8), n(1, 1.0, 72, 0.75), n(2, 1.0, 71, 0.75), n(3, 0.5, 69, 0.7)],
    ];
    const a2 = [
      // A' return (bars 8-11)
      [n(0, 0.5, 69, 0.75), n(0.5, 0.5, 72, 0.75), n(1, 1.0, 76, 0.8), n(2, 0.5, 74, 0.75), n(2.5, 0.5, 72, 0.7), n(3, 0.5, 71, 0.7)],
      [n(0, 0.5, 72, 0.75), n(0.5, 0.5, 74, 0.75), n(1, 1.0, 76, 0.8), n(2, 0.5, 79, 0.75), n(2.5, 0.5, 77, 0.7), n(3, 0.5, 76, 0.7)],
      [n(0, 0.5, 74, 0.75), n(0.5, 0.5, 76, 0.75), n(1, 1.0, 77, 0.8), n(2, 0.5, 79, 0.75), n(2.5, 0.5, 81, 0.7), n(3, 0.5, 84, 0.8)],
      [n(0, 1.0, 81, 0.8), n(1, 1.0, 77, 0.75), n(2, 1.0, 74, 0.75), n(3, 0.5, 72, 0.7)],
    ];
    const c = [
      // C section (bars 12-15)
      [n(0, 0.5, 69, 0.75), n(0.5, 0.5, 72, 0.75), n(1, 1.0, 76, 0.8), n(2, 0.5, 77, 0.75), n(2.5, 0.5, 79, 0.7), n(3, 0.5, 81, 0.7)],
      [n(0, 0.5, 81, 0.8), n(0.5, 0.5, 79, 0.75), n(1, 1.0, 77, 0.8), n(2, 0.5, 76, 0.75), n(2.5, 0.5, 74, 0.7), n(3, 0.5, 72, 0.7)],
      [n(0, 0.5, 71, 0.75), n(0.5, 0.5, 74, 0.75), n(1, 1.0, 77, 0.8), n(2, 0.5, 76, 0.75), n(2.5, 0.5, 74, 0.7), n(3, 0.5, 72, 0.7)],
      [n(0, 1.0, 76, 0.8), n(1, 1.0, 72, 0.75), n(2, 1.0, 69, 0.8), n(3, 1.0, 69, 0.7)],
    ];
    return a.concat(b, a2, c);
  }

  function bassPattern() {
    const p = [];
    const rows = [
      // A
      [n(0, 1.5, 45, 0.7), n(1.5, 0.5, 52, 0.5), n(2, 1.5, 45, 0.7), n(3.5, 0.5, 52, 0.5)],
      [n(0, 1.5, 45, 0.7), n(1.5, 0.5, 53, 0.5), n(2, 1.5, 45, 0.7), n(3.5, 0.5, 53, 0.5)],
      [n(0, 1.5, 50, 0.7), n(1.5, 0.5, 57, 0.5), n(2, 1.5, 50, 0.7), n(3.5, 0.5, 57, 0.5)],
      [n(0, 1.5, 52, 0.7), n(1.5, 0.5, 55, 0.5), n(2, 1.5, 52, 0.7), n(3.5, 0.5, 55, 0.5)],
      // B
      [n(0, 1.5, 45, 0.7), n(1.5, 0.5, 52, 0.5), n(2, 1.5, 45, 0.7), n(3.5, 0.5, 52, 0.5)],
      [n(0, 1.5, 48, 0.7), n(1.5, 0.5, 55, 0.5), n(2, 1.5, 48, 0.7), n(3.5, 0.5, 55, 0.5)],
      [n(0, 1.5, 45, 0.7), n(1.5, 0.5, 52, 0.5), n(2, 1.5, 45, 0.7), n(3.5, 0.5, 52, 0.5)],
      [n(0, 1.5, 43, 0.7), n(1.5, 0.5, 50, 0.5), n(2, 1.5, 43, 0.7), n(3.5, 0.5, 50, 0.5)],
      // A'
      [n(0, 1.5, 45, 0.7), n(1.5, 0.5, 52, 0.5), n(2, 1.5, 45, 0.7), n(3.5, 0.5, 52, 0.5)],
      [n(0, 1.5, 45, 0.7), n(1.5, 0.5, 53, 0.5), n(2, 1.5, 45, 0.7), n(3.5, 0.5, 53, 0.5)],
      [n(0, 1.5, 50, 0.7), n(1.5, 0.5, 57, 0.5), n(2, 1.5, 50, 0.7), n(3.5, 0.5, 57, 0.5)],
      [n(0, 1.5, 52, 0.7), n(1.5, 0.5, 55, 0.5), n(2, 1.5, 52, 0.7), n(3.5, 0.5, 55, 0.5)],
      // C
      [n(0, 1.5, 45, 0.7), n(1.5, 0.5, 52, 0.5), n(2, 1.5, 45, 0.7), n(3.5, 0.5, 52, 0.5)],
      [n(0, 1.5, 45, 0.7), n(1.5, 0.5, 53, 0.5), n(2, 1.5, 45, 0.7), n(3.5, 0.5, 53, 0.5)],
      [n(0, 1.5, 43, 0.7), n(1.5, 0.5, 50, 0.5), n(2, 1.5, 43, 0.7), n(3.5, 0.5, 50, 0.5)],
      [n(0, 1.5, 45, 0.7), n(1.5, 0.5, 52, 0.5), n(2, 1.5, 45, 0.7), n(3.5, 0.5, 52, 0.5)],
    ];
    return rows;
  }

  function padPattern() {
    const p = [];
    const chords = [
      // A: Am / Am / Dm / E
      [n(0, 4, 69, 0.35), n(0, 4, 72, 0.35), n(0, 4, 76, 0.35)],
      [n(0, 4, 69, 0.35), n(0, 4, 72, 0.35), n(0, 4, 76, 0.35)],
      [n(0, 4, 62, 0.32), n(0, 4, 65, 0.32), n(0, 4, 69, 0.32)],
      [n(0, 4, 64, 0.32), n(0, 4, 68, 0.32), n(0, 4, 71, 0.32)],
      // B
      [n(0, 4, 69, 0.35), n(0, 4, 72, 0.35), n(0, 4, 76, 0.35)],
      [n(0, 4, 65, 0.32), n(0, 4, 69, 0.32), n(0, 4, 72, 0.32)],
      [n(0, 4, 69, 0.35), n(0, 4, 72, 0.35), n(0, 4, 76, 0.35)],
      [n(0, 4, 67, 0.32), n(0, 4, 71, 0.32), n(0, 4, 74, 0.32)],
      // A'
      [n(0, 4, 69, 0.35), n(0, 4, 72, 0.35), n(0, 4, 76, 0.35)],
      [n(0, 4, 69, 0.35), n(0, 4, 72, 0.35), n(0, 4, 76, 0.35)],
      [n(0, 4, 62, 0.32), n(0, 4, 65, 0.32), n(0, 4, 69, 0.32)],
      [n(0, 4, 64, 0.32), n(0, 4, 68, 0.32), n(0, 4, 71, 0.32)],
      // C
      [n(0, 4, 69, 0.35), n(0, 4, 72, 0.35), n(0, 4, 76, 0.35)],
      [n(0, 4, 69, 0.35), n(0, 4, 73, 0.35), n(0, 4, 76, 0.35)],
      [n(0, 4, 67, 0.32), n(0, 4, 71, 0.32), n(0, 4, 74, 0.32)],
      [n(0, 4, 69, 0.35), n(0, 4, 72, 0.35), n(0, 4, 76, 0.35)],
    ];
    return chords;
  }

  function drumPattern(kind) {
    const p = [];
    if (kind === 'kick') {
      for (let i = 0; i < 16; i++) {
        const bar = i % 2 === 0
          ? [n(0, 0.25, 36, 0.9), n(2.5, 0.25, 36, 0.6)]
          : [n(0, 0.25, 36, 0.9), n(1.5, 0.25, 36, 0.65), n(2.5, 0.25, 36, 0.6)];
        p.push(bar);
      }
    } else if (kind === 'snare') {
      for (let i = 0; i < 16; i++) {
        const bar = i % 4 === 2
          ? [n(1, 0.25, 38, 0.7), n(2.5, 0.25, 38, 0.5), n(3, 0.25, 38, 0.7)]
          : [n(1, 0.25, 38, 0.7), n(3, 0.25, 38, 0.7)];
        p.push(bar);
      }
    } else if (kind === 'hat') {
      for (let i = 0; i < 16; i++) {
        const fill = i % 4 === 3;
        const notes = [n(0.5, 0.15, 42, 0.5), n(1.5, 0.15, 42, 0.5), n(2.5, 0.15, 42, 0.5), n(3.5, 0.15, 42, 0.5)];
        if (fill) notes.push(n(0, 0.15, 42, 0.55), n(1, 0.15, 42, 0.55), n(2, 0.15, 42, 0.55), n(3, 0.15, 42, 0.55));
        p.push(notes);
      }
    }
    return p;
  }

  const Music = {
    SONG: SONG,
    STINGERS: STINGERS,

    // Convert a MIDI note number to frequency (Hz).
    midiToFreq(midi) {
      return 440 * Math.pow(2, (midi - 69) / 12);
    },

    // Duration of one beat at the given BPM, in seconds.
    beatDuration(bpm) {
      return 60 / bpm;
    },

    // Total musical beats in the song.
    totalBeats(song) {
      song = song || SONG;
      return song.bars * song.beatsPerBar;
    },

    // Tempo rises with level in Marathon: +2 BPM per level above 1, capped so
    // the track never gets silly. Classic/Sprint use a fixed base tempo because
    // their levels do not ramp.
    tempoForLevel(level, baseBpm) {
      baseBpm = baseBpm || SONG.baseBpm;
      const lv = Math.max(1, level | 0);
      return Math.min(176, baseBpm + Math.max(0, (lv - 1) * 2));
    },

    // Pure duck envelope for the music bus on line clears. Returns a gain
    // multiplier 0..1 as a function of milliseconds since the clear.
    //   depth  = how much the music dips (0..1)
    //   attack = quick dip down
    //   hold   = stay dipped
    //   release = smooth return to unity
    duckGain(elapsedMs, depth, attackMs, holdMs, releaseMs) {
      depth = depth == null ? 0.35 : depth;
      attackMs = attackMs == null ? 5 : attackMs;
      holdMs = holdMs == null ? 30 : holdMs;
      releaseMs = releaseMs == null ? 120 : releaseMs;
      if (elapsedMs <= 0) return 1;
      if (elapsedMs < attackMs) {
        return 1 - depth * (elapsedMs / attackMs);
      }
      if (elapsedMs < attackMs + holdMs) {
        return 1 - depth;
      }
      const rel = elapsedMs - attackMs - holdMs;
      if (rel >= releaseMs) return 1;
      return 1 - depth * (1 - rel / releaseMs);
    },

    // Schedule every note whose start falls in [now, until) and advance the
    // cursor. The returned notes carry absolute AudioContext times in `t`
    // (seconds), duration in seconds, frequency in Hz, and the original voice
    // name / channel. The cursor is returned in beats; callers wrap it at the
    // end of the song to loop.
    schedule(song, cursorBeats, now, until, bpm) {
      song = song || SONG;
      now = +now || 0;
      until = +until || now;
      bpm = bpm || song.baseBpm;
      cursorBeats = +cursorBeats || 0;

      const beatDur = this.beatDuration(bpm);
      const startBeats = cursorBeats;
      const endBeats = startBeats + (until - now) / beatDur;
      const beatsPerBar = song.beatsPerBar;
      const startBar = Math.floor(startBeats / beatsPerBar);
      const endBar = Math.ceil(endBeats / beatsPerBar);

      const notes = [];
      for (const voice of song.voices) {
        // The song loops seamlessly; scan every logical bar that overlaps the
        // window, mapping back to the real pattern index.
        for (let bar = startBar; bar < endBar; bar++) {
          const realBar = ((bar % song.bars) + song.bars) % song.bars;
          const barNotes = voice.pattern[realBar];
          if (!barNotes) continue;
          for (const bn of barNotes) {
            const noteBeat = bar * beatsPerBar + bn.beat;
            if (noteBeat >= startBeats && noteBeat < endBeats) {
              const t = now + (noteBeat - startBeats) * beatDur;
              notes.push({
                voice: voice.name,
                channel: voice.channel || voice.name,
                t: t,
                dur: bn.durBeats * beatDur,
                freq: this.midiToFreq(bn.midi),
                midi: bn.midi,
                vel: bn.vel,
              });
            }
          }
        }
      }

      notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
      return { notes: notes, cursor: endBeats };
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Music;
  } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.Music = Music;
  }
})(typeof window !== 'undefined' ? window : globalThis);
