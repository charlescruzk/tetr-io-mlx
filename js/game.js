// js/game.js — orchestrates board.js + piece.js + randomizer.js + scoring.js +
// modes.js into a running game: current piece, gravity, lock delay, hold,
// spawning, top-out. No DOM/canvas here — that's render.js.
//
// Dual-export: require()'d in Node for tests/run.js (Phase 4a testable
// logic: lock-delay reset cap, top-out), and attached to window.Tetris.Game
// in the browser. It touches no DOM, so the same code serves both.
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Board = isNode ? require('./board.js') : root.Tetris.Board;
  const Piece = isNode ? require('./piece.js') : root.Tetris.Piece;
  const Randomizer = isNode ? require('./randomizer.js') : root.Tetris.Randomizer;
  const Scoring = isNode ? require('./scoring.js') : root.Tetris.Scoring;
  const Modes = isNode ? require('./modes.js') : root.Tetris.Modes;

  // Tunables exposed for tests + tweaking.
  const LOCK_DELAY_MS = 500; // piece locks this long after it can no longer fall
  const MAX_LOCK_RESETS = 15; // a grounded move/rotate can reset the timer this
  // many times before the lock is forced
  const NEXT_QUEUE = 3; // how many upcoming pieces the preview shows
  const SPAWN_Y = 0; // pieces enter at the top of the hidden buffer

   // Fire a gameplay event (move/rotate/lock/lineClear/...) to the optional
   // listener the audio layer installs on the game object (game.onEvent). A
   // no-op when nobody's listening — e.g. in Node tests — so the core logic
   // is unaffected and the test surface stays green.
  function emit(g, name) {
    if (g.onEvent) g.onEvent(name);
   }

  const Game = {
    LOCK_DELAY_MS: LOCK_DELAY_MS,
    MAX_LOCK_RESETS: MAX_LOCK_RESETS,
    NEXT_QUEUE: NEXT_QUEUE,

    // create(opts) -> a fresh, ready-to-play game.
    //   opts: { mode, difficulty } (defaults classic/normal), or a
    //   pre-resolved config object.
    create(opts) {
      const config = (opts && opts.mode)
        ? Modes.getConfig(opts.mode, opts.difficulty || 'normal')
        : (opts || Modes.getConfig('classic', 'normal'));

      const g = {
        config: config,
        board: Board.create(),
        bag: Randomizer.createBag(),
        current: null, // { type, rotation, x, y }
        nextQueue: [],
        holdType: null,
        holdUsed: false,
        gravityMs: config.startGravity,
        gravityAcc: 0,
        lockTimer: 0,
        lockResets: 0,
        onGround: false,
        score: 0,
        linesCleared: 0,
        level: config.startLevel,
        timeMs: 0,
        state: 'playing', // 'playing' | 'paused' | 'over' | 'won'
        result: null, // 'won' | 'lost' | null
        lastEvents: [],
      };

      for (let i = 0; i < NEXT_QUEUE; i++) g.nextQueue.push(g.bag.next());
      spawnNext(g);
      bind(g);
      return g;
    },
  };

  // ---- internal helpers (operate on the game object g) ----

  function spawnXFor(type) {
    return type === 'O' ? 4 : 3; // center the 3x3/4x4 pieces on a 10-wide field
  }

  // Place a piece of `type` at its spawn point. Detects an immediate
  // collision as a top-out (game over).
  function setPieceFrom(g, type) {
    g.current = { type: type, rotation: 0, x: spawnXFor(type), y: SPAWN_Y };
    g.onGround = false;
    g.lockTimer = 0;
    g.lockResets = 0;
    g.gravityAcc = 0;
    if (collidesAt(g, 0, g.current.x, g.current.y)) {
      g.state = 'over';
      g.result = 'lost';
    }
  }

  function collidesAt(g, rotation, x, y) {
    return Board.collides(g.board, Piece.getCells(g.current.type, rotation, x, y), 0, 0);
  }

  function canDrop(g) {
    if (!g.current) return false;
    return !collidesAt(g, g.current.rotation, g.current.x, g.current.y + 1);
  }

  // Spawn the next queued piece as the active piece; refill the queue.
  // Returns false if the spawn collides (top-out).
  function spawnNext(g) {
    const type = g.nextQueue.shift();
    g.nextQueue.push(g.bag.next());
    setPieceFrom(g, type);
    return g.state !== 'over';
  }

  // Note a successful move/rotate that lands the piece back on the ground:
  // reset the lock timer, but only up to the reset cap.
  function noteGroundMove(g) {
    if (g.lockResets < MAX_LOCK_RESETS) {
      g.lockResets++;
      g.lockTimer = 0;
    }
  }

  // Move the active piece horizontally by dx. Returns true if it moved.
  function move(g, dx) {
    if (g.state !== 'playing' || !g.current) return false;
    const nx = g.current.x + dx;
    if (!collidesAt(g, g.current.rotation, nx, g.current.y)) {
      g.current.x = nx;
      g.onGround = !canDrop(g);
      if (g.onGround) noteGroundMove(g);
      return true;
    }
    return false;
  }

  // Rotate the active piece (dir +1 = CW, -1 = CCW). Phase 4b: SRS wall
  // kicks — the target state is tried at the naive offset [0,0] first, then
  // each kick from Piece.getKicks(type, from, to) in order until one lands
  // without colliding. Kicks are in +y-up SRS convention, so dy is negated on
  // this y-down board. The O piece never rotates. Returns true if it rotated.
  function rotate(g, dir) {
    if (g.state !== 'playing' || !g.current || g.current.type === 'O') return false;
    const from = g.current.rotation;
    const to = ((from + dir) % 4 + 4) % 4;
         // SRS wall kicks: naive offset [0,0] first, then each kick in order.
         // Offsets are [dx, dy] with +y up, so negate dy on this y-down board.
    const kicks = Piece.getKicks(g.current.type, from, to);
    for (let k = 0; k < kicks.length; k++) {
      const nx = g.current.x + kicks[k][0];
      const ny = g.current.y - kicks[k][1];
      if (!collidesAt(g, to, nx, ny)) {
        g.current.rotation = to;
        g.current.x = nx;
        g.current.y = ny;
        g.onGround = !canDrop(g);
        if (g.onGround) noteGroundMove(g);
        return true;
     }
       }
    return false;
  }

  // Soft drop one row (1 point). Returns true if it moved.
  function softDrop(g) {
    if (g.state !== 'playing' || !g.current) return false;
    if (canDrop(g)) {
      g.current.y++;
      g.score += Scoring.softDropScore(1);
      g.onGround = !canDrop(g);
      if (g.onGround) noteGroundMove(g);
      return true;
    }
    return false;
  }

  // Hard drop: slide to the floor, score 2 pts/cell, lock, spawn next.
  // Returns the number of cells dropped.
  function hardDrop(g) {
    if (g.state !== 'playing' || !g.current) return 0;
    let cells = 0;
    while (canDrop(g)) {
      g.current.y++;
      cells++;
    }
    g.onGround = true;
    if (cells > 0) g.score += Scoring.hardDropScore(cells);
    emit(g, 'harddrop');
    lockAndNext(g);
    return cells;
  }

  // Test helper: move the active piece down to its lowest valid position
  // WITHOUT locking or scoring.
  function dropToFloor(g) {
    if (!g.current) return 0;
    let cells = 0;
    while (canDrop(g)) {
      g.current.y++;
      cells++;
    }
    g.onGround = true;
    return cells;
  }

  // Hold: swap the active piece into the hold slot (once per piece).
  // An empty hold pulls the next queued piece; a filled one swaps.
  function holdPiece(g) {
    if (g.state !== 'playing' || !g.current || g.holdUsed) return false;
    const cur = g.current.type;
    if (g.holdType === null) {
      g.holdType = cur;
      spawnNext(g);
    } else {
      const prev = g.holdType;
      g.holdType = cur;
      setPieceFrom(g, prev);
    }
    // Any hold consumes this piece's single hold, empty-slot or swap.
    g.holdUsed = true;
    return true;
  }

  // Lock the active piece, clear full rows, update score/level, and
  // spawn the next piece. Handles win (sprint) and the top-out after spawn.
  function lockAndNext(g) {
    const c = g.current;
    if (!c) return;
    const prevLevel = g.level; // to detect a level-up below (Marathon)
    Board.lock(g.board, Piece.getCells(c.type, c.rotation, 0, 0), c.x, c.y, c.type);
    g.holdUsed = false; // holding is allowed again for the next piece

    const full = Board.findFullRows(g.board);
    g.lastEvents = [];
    if (full.length) {
      Board.clearRows(g.board, full);
      g.linesCleared += full.length;
      g.score += Scoring.linesScore(full.length, g.level);
      g.level = g.config.levelForLines(g.linesCleared);
      if (g.config.rampsWithLevel) g.gravityMs = Scoring.gravityForLevel(g.level);
      g.lastEvents = { type: 'lineClear', lines: full.length, score: g.score };
        // 4 lines is a Tetris (distinct, bigger sound); 1–3 is a line clear.
      emit(g, full.length === 4 ? 'tetris' : 'lineclear');
      if (g.level > prevLevel) emit(g, 'levelup');
      if (g.config.checkWin({ linesCleared: g.linesCleared })) {
        g.state = 'won';
        g.result = 'won';
        return;
      }
    } else {
      g.lastEvents = { type: 'lock' };
      emit(g, 'lock');
    }
    spawnNext(g);
  }

  // Advance the simulation by dtMs: gravity drops + lock delay.
  // Returns the events produced this tick (lineClear / lock / win / over).
  function tick(g, dtMs) {
    if (g.state !== 'playing' || !g.current) return g.lastEvents;
    g.timeMs += dtMs;

    // 1. Gravity — drop one row per gravityMs of accumulated time.
    g.gravityAcc += dtMs;
    while (g.gravityAcc >= g.gravityMs) {
      g.gravityAcc -= g.gravityMs;
      if (!canDrop(g)) break;
      g.current.y++;
    }

    // 2. Lock delay — accumulate while grounded; lock when the timer runs out.
    g.onGround = !canDrop(g);
    if (g.onGround) {
      g.lockTimer += dtMs;
      if (g.lockTimer >= LOCK_DELAY_MS) lockAndNext(g);
    } else {
      g.lockTimer = 0;
    }
    return g.lastEvents;
  }

  // Expose a couple of internal queries for the render/input layers.
  function ghostY(g) {
    if (!g.current) return 0;
    let y = g.current.y;
    while (!collidesAt(g, g.current.rotation, g.current.x, y + 1)) y++;
    return y;
  }

  // Bind the public action surface onto the game object.
  function bind(g) {
    g.move = function (dx) {
      const ok = move(g, dx);
      if (ok) emit(g, 'move');
      return ok;
     };
    g.rotate = function (dir) {
      const ok = rotate(g, dir);
      if (ok) emit(g, 'rotate');
      return ok;
     };
    g.softDrop = function () {
      const ok = softDrop(g);
      if (ok) emit(g, 'softdrop');
      return ok;
     };
      // hardDrop emits its own 'harddrop' event inside; the lock/line-clear
      // events come from lockAndNext below.
    g.hardDrop = function () { return hardDrop(g); };
    g.hold = function () {
      const ok = holdPiece(g);
      if (ok) emit(g, 'hold');
      return ok;
     };
    g.dropToFloor = function () { return dropToFloor(g); };
    g.tick = function (dt) { return tick(g, dt); };
    g.spawnNext = function () { return spawnNext(g); };
    g.ghostY = function () { return ghostY(g); };
    g.pause = function () { if (g.state === 'playing') g.state = 'paused'; };
    g.resume = function () { if (g.state === 'paused') g.state = 'playing'; };
    g.restart = function () {
      const fresh = Game.create(g.config.mode
        ? { mode: g.config.mode, difficulty: g.config.difficulty }
        : null);
      // copy the fresh, playable game back into g
      for (const k in fresh) {
        if (typeof fresh[k] !== 'function') g[k] = fresh[k];
      }
      bind(g);
    };
    g.canDrop = function () { return canDrop(g); };
  }

  // Expose helpers for the (DOM-free) test surface.
  Game._internals = { collidesAt: collidesAt, canDrop: canDrop };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Game;
  } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.Game = Game;
  }
})(typeof window !== 'undefined' ? window : globalThis);
