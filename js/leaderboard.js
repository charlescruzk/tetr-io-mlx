// js/leaderboard.js — pure game-logic, no DOM. See PLAN.md Phase 25.
//
// A per-mode top-10 leaderboard. Everything here is data-in/data-out: the
// UI layer (ui.js) owns localStorage and the screens, this module owns the
// rules — what qualifies, how each mode ranks, what columns each mode shows,
// and a validating parser so a corrupt/foreign localStorage blob can never
// take the game down. Boards are treated as immutable: every mutator returns
// a new board.
//
// Ranking rules (SPEC.md "Modes"):
//   classic  — score desc, then lines desc, then time asc (faster wins ties)
//   marathon — score desc, then level desc, then lines desc, then time asc
//   sprint   — only *completed* 40-line runs count; time asc, then score desc
//
// Dual-export: loadable via <script> in the browser (attaches to
// window.Tetris.Leaderboard) and via require() in Node for tests/run.js.
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = 10;
  const MODES = ['classic', 'marathon', 'sprint'];
  const DIFFICULTIES = ['easy', 'normal', 'hard'];
  const NAME_MAX = 12;
  const DEFAULT_NAME = 'PLAYER';

  const MODE_NAMES = { classic: 'Classic', marathon: 'Marathon', sprint: '40L Sprint' };
  const DIFF_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

  // m:ss for the endless modes, m:ss.hh for Sprint (hundredths matter there).
  function formatTime(ms, precise) {
    const total = Math.max(0, ms || 0);
    const s = Math.floor(total / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    let out = m + ':' + (sec < 10 ? '0' : '') + sec;
    if (precise) {
      const hh = Math.floor((total % 1000) / 10);
      out += '.' + (hh < 10 ? '0' : '') + hh;
    }
    return out;
  }

  function formatScore(n) {
    return String(Math.max(0, Math.floor(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // The columns each mode's table shows, in order. `fmt` renders the value.
  const COLUMNS = {
    classic: [
      { key: 'score', label: 'Score', fmt: (e) => formatScore(e.score) },
      { key: 'lines', label: 'Lines', fmt: (e) => String(e.lines) },
      { key: 'timeMs', label: 'Time', fmt: (e) => formatTime(e.timeMs) },
      { key: 'difficulty', label: 'Diff', fmt: (e) => DIFF_NAMES[e.difficulty] || '' },
    ],
    marathon: [
      { key: 'score', label: 'Score', fmt: (e) => formatScore(e.score) },
      { key: 'level', label: 'Lvl', fmt: (e) => String(e.level) },
      { key: 'lines', label: 'Lines', fmt: (e) => String(e.lines) },
      { key: 'timeMs', label: 'Time', fmt: (e) => formatTime(e.timeMs) },
      { key: 'difficulty', label: 'Diff', fmt: (e) => DIFF_NAMES[e.difficulty] || '' },
    ],
    sprint: [
      { key: 'timeMs', label: 'Time', fmt: (e) => formatTime(e.timeMs, true) },
      { key: 'score', label: 'Score', fmt: (e) => formatScore(e.score) },
      { key: 'difficulty', label: 'Diff', fmt: (e) => DIFF_NAMES[e.difficulty] || '' },
    ],
  };

  // The one number that headlines an entry (what "the record" is in that mode).
  function headline(mode, entry) {
    if (!entry) return '';
    return mode === 'sprint' ? formatTime(entry.timeMs, true) : formatScore(entry.score);
  }

  // Sort comparator per mode: negative → a ranks above b.
  function compare(mode, a, b) {
    if (mode === 'sprint') {
      return (a.timeMs - b.timeMs) || (b.score - a.score) || (a.date - b.date);
    }
    if (mode === 'marathon') {
      return (b.score - a.score) || (b.level - a.level) || (b.lines - a.lines)
          || (a.timeMs - b.timeMs) || (a.date - b.date);
    }
    return (b.score - a.score) || (b.lines - a.lines) || (a.timeMs - b.timeMs)
        || (a.date - b.date);
  }

  // Trim, strip control characters, cap the length; empty → DEFAULT_NAME.
  function sanitizeName(raw) {
    let s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (s.length > NAME_MAX) s = s.slice(0, NAME_MAX);
    return s || DEFAULT_NAME;
  }

  let idCounter = 0;
  function newId(date) {
    idCounter += 1;
    return String(date) + '-' + idCounter + '-' + Math.floor(Math.random() * 1e6);
  }

  function create() {
    return { version: VERSION, classic: [], marathon: [], sprint: [] };
  }

  // Build a candidate entry from a finished game (or any object shaped like
  // one: config.mode/difficulty, score, linesCleared, level, timeMs, result).
  function entryFromGame(g, name, date) {
    const cfg = g.config || {};
    return {
      id: newId(date == null ? Date.now() : date),
      name: sanitizeName(name),
      mode: MODES.indexOf(cfg.mode) >= 0 ? cfg.mode : 'classic',
      difficulty: DIFFICULTIES.indexOf(cfg.difficulty) >= 0 ? cfg.difficulty : 'normal',
      score: Math.max(0, Math.floor(g.score || 0)),
      lines: Math.max(0, Math.floor(g.linesCleared || 0)),
      level: Math.max(1, Math.floor(g.level || 1)),
      timeMs: Math.max(0, Math.floor(g.timeMs || 0)),
      won: g.result === 'won',
      date: date == null ? Date.now() : date,
    };
  }

  // Does this result belong on a board at all? Sprint only records finished
  // runs (a top-out at 30 lines has no time to rank); the endless modes need
  // at least one point so an instant top-out doesn't litter the table.
  function qualifies(entry) {
    if (!entry || MODES.indexOf(entry.mode) < 0) return false;
    if (entry.mode === 'sprint') return !!entry.won && entry.timeMs > 0;
    return entry.score > 0;
  }

  // 1-based position the entry would take on its mode's board, or null if
  // it doesn't qualify or falls outside the top MAX.
  function rank(board, entry) {
    if (!qualifies(entry)) return null;
    const list = board[entry.mode] || [];
    let pos = 1;
    for (const e of list) {
      if (compare(entry.mode, entry, e) < 0) break;
      pos += 1;
    }
    return pos <= MAX ? pos : null;
  }

  // Insert an entry; returns { board, rank } with a NEW board (the input is
  // untouched). rank is null when the entry didn't make it (board unchanged).
  function insert(board, entry) {
    const r = rank(board, entry);
    if (r == null) return { board: board, rank: null };
    const list = (board[entry.mode] || []).slice();
    list.splice(r - 1, 0, Object.assign({}, entry));
    if (list.length > MAX) list.length = MAX;
    const next = Object.assign({}, board);
    next[entry.mode] = list;
    return { board: next, rank: r };
  }

  // Rename an entry in place (by id) — the game-over name box edits the row
  // that was already saved, so an untyped name never loses the score.
  function rename(board, mode, id, name) {
    const list = board[mode] || [];
    const i = list.findIndex((e) => e.id === id);
    if (i < 0) return board;
    const next = Object.assign({}, board);
    next[mode] = list.slice();
    next[mode][i] = Object.assign({}, list[i], { name: sanitizeName(name) });
    return next;
  }

  // The #1 entry for a mode, or null.
  function record(board, mode) {
    const list = board[mode] || [];
    return list.length ? list[0] : null;
  }

  function serialize(board) {
    return JSON.stringify(board);
  }

  // Validate every field of every row; anything malformed is dropped rather
  // than trusted, and a non-object/garbage blob yields a fresh board.
  function parse(raw) {
    const board = create();
    let data;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return board; }
    if (!data || typeof data !== 'object') return board;
    for (const mode of MODES) {
      const list = Array.isArray(data[mode]) ? data[mode] : [];
      const clean = [];
      for (const e of list) {
        if (!e || typeof e !== 'object') continue;
        const row = {
          id: typeof e.id === 'string' && e.id ? e.id : newId(0),
          name: sanitizeName(e.name),
          mode: mode,
          difficulty: DIFFICULTIES.indexOf(e.difficulty) >= 0 ? e.difficulty : 'normal',
          score: isFinite(e.score) ? Math.max(0, Math.floor(e.score)) : 0,
          lines: isFinite(e.lines) ? Math.max(0, Math.floor(e.lines)) : 0,
          level: isFinite(e.level) ? Math.max(1, Math.floor(e.level)) : 1,
          timeMs: isFinite(e.timeMs) ? Math.max(0, Math.floor(e.timeMs)) : 0,
          won: mode === 'sprint' ? true : !!e.won,
          date: isFinite(e.date) ? Math.floor(e.date) : 0,
        };
        if (qualifies(row)) clean.push(row);
      }
      clean.sort((a, b) => compare(mode, a, b));
      if (clean.length > MAX) clean.length = MAX;
      board[mode] = clean;
    }
    return board;
  }

  const Leaderboard = {
    VERSION, MAX, MODES, NAME_MAX, DEFAULT_NAME, MODE_NAMES, DIFF_NAMES, COLUMNS,
    create, entryFromGame, qualifies, rank, insert, rename, record,
    compare, sanitizeName, formatTime, formatScore, headline,
    serialize, parse,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Leaderboard;
  } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.Leaderboard = Leaderboard;
  }
})(typeof window !== 'undefined' ? window : globalThis);
