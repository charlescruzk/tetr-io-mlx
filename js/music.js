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

  // A 16-bar arrangement of the public-domain Russian folk melody
  // "Korobeiniki" (the classic Tetris A theme) in A minor, 4/4 at 126 BPM.
  // The lead is the actual singable tune; bass and pad provide simple harmonic
  // support, and the drums are intentionally minimal so the melody stays clear
  // and not distracting. The same data drives both the in-game mix and the
  // softer menu variant — the audio layer (js/audio.js) applies filtering/gain
  // changes, not this module.
  const SONG = {
    bars: 16,
    beatsPerBar: 4,
    baseBpm: 126,
    menuBpm: 110,
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
    // Korobeiniki / "Tetris A" theme in A minor. Each bar is 4/4, mostly
    // eighth notes. The tune is split into four 4-bar phrases so the 16-bar
    // loop has shape: A A' B A''.
    const a = [
      // A section (bars 0-3)
      [n(0, 0.5, 76, 0.65), n(0.5, 0.5, 76, 0.65), n(1, 0.5, 71, 0.6), n(1.5, 0.5, 72, 0.6),
       n(2, 0.5, 74, 0.65), n(2.5, 0.5, 72, 0.6), n(3, 0.5, 71, 0.6), n(3.5, 0.5, 69, 0.6)],
      [n(0, 0.5, 69, 0.65), n(0.5, 0.5, 69, 0.65), n(1, 0.5, 72, 0.6), n(1.5, 0.5, 76, 0.65),
       n(2, 0.5, 74, 0.6), n(2.5, 0.5, 72, 0.6), n(3, 1.0, 71, 0.65)],
      [n(0, 0.5, 72, 0.65), n(0.5, 0.5, 74, 0.65), n(1, 0.5, 76, 0.7), n(1.5, 0.5, 72, 0.6),
       n(2, 0.5, 69, 0.65), n(2.5, 0.5, 69, 0.65), n(3, 1.0, 69, 0.6)],
      [n(0, 0.5, 74, 0.65), n(0.5, 0.5, 77, 0.65), n(1, 0.5, 81, 0.7), n(1.5, 0.5, 79, 0.65),
       n(2, 0.5, 77, 0.6), n(2.5, 0.5, 76, 0.6), n(3, 1.0, 76, 0.6)],
    ];
    const a2 = [
      // A' variation (bars 4-7) — same melody, different cadence
      [n(0, 0.5, 76, 0.65), n(0.5, 0.5, 76, 0.65), n(1, 0.5, 71, 0.6), n(1.5, 0.5, 72, 0.6),
       n(2, 0.5, 74, 0.65), n(2.5, 0.5, 72, 0.6), n(3, 0.5, 71, 0.6), n(3.5, 0.5, 69, 0.6)],
      [n(0, 0.5, 69, 0.65), n(0.5, 0.5, 69, 0.65), n(1, 0.5, 72, 0.6), n(1.5, 0.5, 76, 0.65),
       n(2, 0.5, 74, 0.6), n(2.5, 0.5, 72, 0.6), n(3, 1.0, 71, 0.65)],
      [n(0, 0.5, 72, 0.65), n(0.5, 0.5, 74, 0.65), n(1, 0.5, 76, 0.7), n(1.5, 0.5, 72, 0.6),
       n(2, 0.5, 69, 0.65), n(2.5, 0.5, 69, 0.65), n(3, 1.0, 69, 0.6)],
      [n(0, 0.5, 72, 0.65), n(0.5, 0.5, 76, 0.65), n(1, 0.5, 74, 0.7), n(1.5, 0.5, 72, 0.6),
       n(2, 0.5, 71, 0.6), n(2.5, 0.5, 71, 0.6), n(3, 1.0, 71, 0.6)],
    ];
    const b = [
      // B section (bars 8-11) — counter-melody / bridge
      [n(0, 0.5, 69, 0.6), n(0.5, 0.5, 71, 0.6), n(1, 0.5, 72, 0.65), n(1.5, 0.5, 74, 0.6),
       n(2, 0.5, 76, 0.65), n(2.5, 0.5, 77, 0.6), n(3, 0.5, 79, 0.65), n(3.5, 0.5, 81, 0.65)],
      [n(0, 0.5, 79, 0.65), n(0.5, 0.5, 77, 0.6), n(1, 0.5, 76, 0.65), n(1.5, 0.5, 74, 0.6),
       n(2, 0.5, 72, 0.6), n(2.5, 0.5, 71, 0.6), n(3, 1.0, 69, 0.65)],
      [n(0, 0.5, 71, 0.6), n(0.5, 0.5, 72, 0.6), n(1, 0.5, 74, 0.65), n(1.5, 0.5, 76, 0.6),
       n(2, 0.5, 77, 0.65), n(2.5, 0.5, 76, 0.6), n(3, 0.5, 74, 0.6), n(3.5, 0.5, 72, 0.6)],
      [n(0, 0.5, 74, 0.65), n(0.5, 0.5, 72, 0.6), n(1, 0.5, 71, 0.6), n(1.5, 0.5, 69, 0.6),
       n(2, 0.5, 67, 0.6), n(2.5, 0.5, 69, 0.6), n(3, 1.0, 71, 0.65)],
    ];
    const a3 = [
      // A'' final return (bars 12-15)
      [n(0, 0.5, 76, 0.65), n(0.5, 0.5, 76, 0.65), n(1, 0.5, 71, 0.6), n(1.5, 0.5, 72, 0.6),
       n(2, 0.5, 74, 0.65), n(2.5, 0.5, 72, 0.6), n(3, 0.5, 71, 0.6), n(3.5, 0.5, 69, 0.6)],
      [n(0, 0.5, 69, 0.65), n(0.5, 0.5, 69, 0.65), n(1, 0.5, 72, 0.6), n(1.5, 0.5, 76, 0.65),
       n(2, 0.5, 74, 0.6), n(2.5, 0.5, 72, 0.6), n(3, 1.0, 71, 0.65)],
      [n(0, 0.5, 72, 0.65), n(0.5, 0.5, 74, 0.65), n(1, 0.5, 76, 0.7), n(1.5, 0.5, 81, 0.7),
       n(2, 0.5, 79, 0.65), n(2.5, 0.5, 77, 0.65), n(3, 0.5, 76, 0.6), n(3.5, 0.5, 74, 0.6)],
      [n(0, 0.5, 72, 0.65), n(0.5, 0.5, 76, 0.65), n(1, 0.5, 74, 0.7), n(1.5, 0.5, 72, 0.6),
       n(2, 0.5, 71, 0.6), n(2.5, 0.5, 69, 0.6), n(3, 1.0, 69, 0.65)],
    ];
    return a.concat(a2, b, a3);
  }

  function bassPattern() {
    // Simple root+fifth bassline that follows the A-minor / D-minor / E-major
    // / F-major / G-major harmonic movement of the tune. Hits on beat 1 and
    // the "and" of 2, staying out of the melody's way.
    const rows = [
      // A section (Am -> Am -> Dm -> E)
      [n(0, 1.5, 45, 0.55), n(2, 0.5, 52, 0.45), n(2.5, 1.0, 45, 0.55)],
      [n(0, 1.5, 45, 0.55), n(2, 0.5, 52, 0.45), n(2.5, 1.0, 45, 0.55)],
      [n(0, 1.5, 50, 0.55), n(2, 0.5, 57, 0.45), n(2.5, 1.0, 50, 0.55)],
      [n(0, 1.5, 52, 0.55), n(2, 0.5, 59, 0.45), n(2.5, 1.0, 52, 0.55)],
      // A' variation (Am -> Am -> Dm -> E with walk)
      [n(0, 1.5, 45, 0.55), n(2, 0.5, 52, 0.45), n(2.5, 1.0, 45, 0.55)],
      [n(0, 1.5, 45, 0.55), n(2, 0.5, 52, 0.45), n(2.5, 1.0, 45, 0.55)],
      [n(0, 1.5, 50, 0.55), n(2, 0.5, 57, 0.45), n(2.5, 1.0, 50, 0.55)],
      [n(0, 1.0, 47, 0.55), n(1, 1.0, 48, 0.5), n(2, 1.0, 49, 0.5), n(3, 1.0, 50, 0.55)],
      // B section (F -> G -> Am -> E)
      [n(0, 1.5, 53, 0.55), n(2, 0.5, 60, 0.45), n(2.5, 1.0, 53, 0.55)],
      [n(0, 1.5, 55, 0.55), n(2, 0.5, 62, 0.45), n(2.5, 1.0, 55, 0.55)],
      [n(0, 1.5, 45, 0.55), n(2, 0.5, 52, 0.45), n(2.5, 1.0, 45, 0.55)],
      [n(0, 1.5, 52, 0.55), n(2, 0.5, 59, 0.45), n(2.5, 1.0, 52, 0.55)],
      // A'' final return
      [n(0, 1.5, 45, 0.55), n(2, 0.5, 52, 0.45), n(2.5, 1.0, 45, 0.55)],
      [n(0, 1.5, 45, 0.55), n(2, 0.5, 52, 0.45), n(2.5, 1.0, 45, 0.55)],
      [n(0, 1.5, 50, 0.55), n(2, 0.5, 57, 0.45), n(2.5, 1.0, 50, 0.55)],
      [n(0, 1.5, 52, 0.55), n(2, 0.5, 59, 0.45), n(2.5, 1.0, 52, 0.55)],
    ];
    return rows;
  }

  function padPattern() {
    // Soft whole-bar chords that support the tune: Am, Dm, E, F, G. Velocities
    // are low so the pad sits far behind the lead.
    const chords = [
      // A section (Am / Am / Dm / E)
      [n(0, 4, 69, 0.28), n(0, 4, 72, 0.28), n(0, 4, 76, 0.28)],
      [n(0, 4, 69, 0.28), n(0, 4, 72, 0.28), n(0, 4, 76, 0.28)],
      [n(0, 4, 62, 0.26), n(0, 4, 65, 0.26), n(0, 4, 69, 0.26)],
      [n(0, 4, 64, 0.26), n(0, 4, 68, 0.26), n(0, 4, 71, 0.26)],
      // A' (Am / Am / Dm / E7)
      [n(0, 4, 69, 0.28), n(0, 4, 72, 0.28), n(0, 4, 76, 0.28)],
      [n(0, 4, 69, 0.28), n(0, 4, 72, 0.28), n(0, 4, 76, 0.28)],
      [n(0, 4, 62, 0.26), n(0, 4, 65, 0.26), n(0, 4, 69, 0.26)],
      [n(0, 4, 64, 0.26), n(0, 4, 68, 0.26), n(0, 4, 71, 0.26), n(0, 4, 74, 0.24)],
      // B section (F / G / Am / E)
      [n(0, 4, 65, 0.28), n(0, 4, 69, 0.28), n(0, 4, 72, 0.28)],
      [n(0, 4, 67, 0.28), n(0, 4, 71, 0.28), n(0, 4, 74, 0.28)],
      [n(0, 4, 69, 0.28), n(0, 4, 72, 0.28), n(0, 4, 76, 0.28)],
      [n(0, 4, 64, 0.26), n(0, 4, 68, 0.26), n(0, 4, 71, 0.26)],
      // A'' final return
      [n(0, 4, 69, 0.28), n(0, 4, 72, 0.28), n(0, 4, 76, 0.28)],
      [n(0, 4, 69, 0.28), n(0, 4, 72, 0.28), n(0, 4, 76, 0.28)],
      [n(0, 4, 62, 0.26), n(0, 4, 65, 0.26), n(0, 4, 69, 0.26)],
      [n(0, 4, 64, 0.26), n(0, 4, 68, 0.26), n(0, 4, 71, 0.26)],
    ];
    return chords;
  }

  function drumPattern(kind) {
    // Minimal, low-velocity drums so they don't fight the melody. Kick on 1,
    // snare on 3, hats on the backbeat only — no fills.
    const p = [];
    if (kind === 'kick') {
      for (let i = 0; i < 16; i++) p.push([n(0, 0.25, 36, 0.55)]);
    } else if (kind === 'snare') {
      for (let i = 0; i < 16; i++) p.push([n(2, 0.25, 38, 0.45)]);
    } else if (kind === 'hat') {
      for (let i = 0; i < 16; i++) {
        p.push([
          n(0.5, 0.1, 42, 0.35),
          n(1.5, 0.1, 42, 0.35),
          n(2.5, 0.1, 42, 0.35),
          n(3.5, 0.1, 42, 0.35),
        ]);
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
