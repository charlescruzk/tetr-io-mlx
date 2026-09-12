// tests/run.js — plain Node test runner, zero dependencies.
//
// Run: node tests/run.js
//
// Extend this file as you implement each phase — see the TODO markers
// below and PLAN.md's per-phase DoD. A phase without a matching test here
// is not verified, per CLAUDE.md.

'use strict';

const path = require('path');

const Board = require(path.join(__dirname, '..', 'js', 'board.js'));
const Piece = require(path.join(__dirname, '..', 'js', 'piece.js'));
const Randomizer = require(path.join(__dirname, '..', 'js', 'randomizer.js'));
// Phase 4a: core game loop. game.js is a DOM-free UMD module, so it
// require()'s here exactly like the other logic modules.
const Game = require(path.join(__dirname, '..', 'js', 'game.js'));
// Phase 7: scoring + gravity curve.
const Scoring = require(path.join(__dirname, '..', 'js', 'scoring.js'));
// Phase 8: game modes.
const Modes = require(path.join(__dirname, '..', 'js', 'modes.js'));
// Phase 19: music sequencer data + timing.
const Music = require(path.join(__dirname, '..', 'js', 'music.js'));
// Phase 20: animated background simulation (pure, canvas-free).
const BackgroundSim = require(path.join(__dirname, '..', 'js', 'backgroundsim.js'));
// Phase 21: render-side animation timelines and popup pool (pure).
const FxTimeline = require(path.join(__dirname, '..', 'js', 'fxtimeline.js'));

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    fail++;
    console.log(`FAIL  - ${name}`);
    console.log(`        ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn, msg) {
  let threw = false;
  try {
    fn();
   } catch (e) {
    threw = true;
    }
  if (!threw) throw new Error(msg || 'expected the function to throw');
}

// ---------------------------------------------------------------- Phase 1
// Board

test('Board.create returns a board of the right dimensions', () => {
  const board = Board.create();
  assert(Array.isArray(board), 'board should be an array of rows');
  assertEqual(board.length, Board.HEIGHT + Board.BUFFER, 'board height mismatch');
  assert(board.every((row) => row.length === Board.WIDTH), 'every row should be WIDTH wide');
  assert(board.every((row) => row.every((cell) => cell === null)), 'a fresh board should be all-empty');
});

test('Board.collides detects a wall collision', () => {
  const board = Board.create();
  const offBoard = [[-1, 0], [0, 0], [1, 0], [2, 0]];
  assert(Board.collides(board, offBoard, 0, 0), 'expected collision off the left wall');
});

test('Board.collides does not flag a valid in-bounds position', () => {
  const board = Board.create();
  const cells = [[0, 0], [1, 0], [2, 0], [3, 0]];
  assert(!Board.collides(board, cells, 0, 0), 'expected no collision on an empty board');
});

test('Board.findFullRows + clearRows removes a full row and shifts down', () => {
  const board = Board.create();
  const fullRowIndex = Board.HEIGHT + Board.BUFFER - 1; // bottom row
  for (let x = 0; x < Board.WIDTH; x++) board[fullRowIndex][x] = 'I';

  const full = Board.findFullRows(board);
  assertEqual(full.length, 1, 'expected exactly one full row');
  assertEqual(full[0], fullRowIndex, 'wrong row flagged as full');

  Board.clearRows(board, full);
  assert(board[fullRowIndex].every((c) => c === null), 'bottom row should be empty after clear+shift');
  assertEqual(board.length, Board.HEIGHT + Board.BUFFER, 'board should stay the same total height after a clear');
});

test('Board.findFullRows ignores a row that is full except one cell', () => {
  const board = Board.create();
  const rowIndex = Board.HEIGHT + Board.BUFFER - 1;
  for (let x = 0; x < Board.WIDTH - 1; x++) board[rowIndex][x] = 'I';
  const full = Board.findFullRows(board);
  assertEqual(full.length, 0, 'a row missing one cell should not be flagged full');
});

test('Board.collides flags a piece resting exactly on the floor', () => {
  const board = Board.create();
  const floor = Board.HEIGHT + Board.BUFFER - 1; // last valid row
  const inBoard = [[0, floor], [1, floor], [2, floor], [3, floor]];
  assert(!Board.collides(board, inBoard, 0, 0), 'a piece on the floor row should fit');
  const belowFloor = [[0, floor + 1], [1, floor + 1], [2, floor + 1], [3, floor + 1]];
  assert(Board.collides(board, belowFloor, 0, 0), 'one row below the floor should collide');
});

test('Board.lock writes the piece type into the occupied cells', () => {
  const board = Board.create();
  const cells = [[0, 0], [1, 0], [2, 0], [3, 0]];
  Board.lock(board, cells, 0, 0, 'I');
  for (let x = 0; x < 4; x++) assertEqual(board[0][x], 'I');
  assert(board[0][4] === null, 'cells outside the piece stay empty');
  assert(board[1][0] === null, 'untouched rows stay empty');
});

test('Board.clearRows collapses multiple full rows at once', () => {
  const board = Board.create();
  const bottom = Board.HEIGHT + Board.BUFFER - 1;
  for (let x = 0; x < Board.WIDTH; x++) {
    board[bottom][x] = 'I';
    board[bottom - 1][x] = 'O';
   }
  const full = Board.findFullRows(board);
  assertEqual(full.length, 2, 'expected two full rows');
  Board.clearRows(board, full);
  assertEqual(board.length, Board.HEIGHT + Board.BUFFER, 'height unchanged after clear');
  // the two bottom rows are now empty, and nothing else moved into a full state
  assert(board[bottom].every((c) => c === null), 'new bottom row empty');
  assert(board[bottom - 1].every((c) => c === null), 'row above new bottom empty');
});

test('Board.collides treats the spawn buffer as open space', () => {
  const board = Board.create();
  // a cell placed in the buffer above row 0 must not collide on an empty board
  const above = [[0, -1], [1, -1], [2, -1], [3, -1]];
  assert(!Board.collides(board, above, 0, 0), 'buffer cells should not collide');
});

test('Board.reset clears every cell', () => {
  const board = Board.create();
  Board.lock(board, [[0, 0], [1, 0], [2, 0], [3, 0]], 0, 0, 'I');
  Board.reset(board);
  assert(board.every((row) => row.every((c) => c === null)), 'board should be all-null after reset');
});

// ---------------------------------------------------------------- Phase 2
// Piece

test('every piece has 4 rotation states of exactly 4 cells each', () => {
  for (const type of Piece.TYPES) {
    for (let r = 0; r < 4; r++) {
      const cells = Piece.getCells(type, r, 0, 0);
      assertEqual(cells.length, 4, `${type} rotation ${r} should have 4 cells`);
    }
  }
});

test('O piece rotation states are all identical (no visible rotation)', () => {
  const base = JSON.stringify(Piece.getCells('O', 0, 0, 0).slice().sort());
  for (let r = 1; r < 4; r++) {
    const cur = JSON.stringify(Piece.getCells('O', r, 0, 0).slice().sort());
    assertEqual(cur, base, `O piece rotation ${r} should match rotation 0`);
  }
});

test('getCells applies the (x, y) offset to every cell', () => {
  const cells = Piece.getCells('T', 0, 3, 5);
   // T spawn is (1,0),(0,1),(1,1),(2,1) -> offset by (3,5)
  const sorted = cells.slice().map((c) => c.slice().sort()).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const expected = [[3, 6], [4, 5], [4, 6], [5, 6]].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assertEqual(JSON.stringify(sorted), JSON.stringify(expected), 'T spawn offset by (3,5) mismatch');
});

test('each piece has a distinct shape (no two types share the same spawn)', () => {
  const sig = Piece.TYPES.map((t) => JSON.stringify(Piece.getCells(t, 0, 0, 0).slice().sort()));
  assertEqual(new Set(sig).size, 7, 'all 7 pieces should have distinct spawn shapes');
});

// ---------------------------------------------------------------- Phase 4b
// SRS wall kicks (js/piece.js getKicks + game.js rotate()). The reference
// test below is the regression guard for the copy-paste bug that had the
// wrong 2->3 / 3->2 / 3->0 JLSTZ entries; the functional tests drive the
// real kick search through game.js.rotate().

test('Piece.getKicks returns the canonical SRS tables (JLSTZ and I)', () => {
  // Typed independently of the source tables so a copy-paste error in the
  // source is caught here, not masked by matching the same wrong values.
  const REF_JLSTZ = {
    '0->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1->0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1->2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2->3': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3->2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3->0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '0->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, 2]],
    };
  const REF_I = {
    '0->1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1->0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1->2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2->1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2->3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3->2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3->0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0->3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    };
  const pairs = ['0->1', '1->0', '1->2', '2->1', '2->3', '3->2', '3->0', '0->3'];
  for (const t of ['J', 'L', 'S', 'T', 'Z']) {
    for (const key of pairs) {
      const [f, to] = key.split('->').map(Number);
      assertEqual(
        JSON.stringify(Piece.getKicks(t, f, to)),
        JSON.stringify(REF_JLSTZ[key]),
        `JLSTZ ${t} ${key} should match the canonical table`
        );
    }
  }
  for (const key of pairs) {
    const [f, to] = key.split('->').map(Number);
    assertEqual(
      JSON.stringify(Piece.getKicks('I', f, to)),
      JSON.stringify(REF_I[key]),
      `I ${key} should match the canonical table`
      );
  }
});

test('Piece.getKicks returns an empty list for the O piece', () => {
  assertEqual(Piece.getKicks('O', 0, 1).length, 0, 'the O piece never rotates, so it has no kicks');
});

test('SRS kick: a vertical I at the right wall kicks left when rotating (naive fails)', () => {
  const g = Game.create();
   // Vertical I (state R) in the rightmost column: the naive 180 rotation
   // would place a cell off the right wall, but the 1->2 kick (-1,0) lands it.
  g.current = { type: 'I', rotation: 1, x: 7, y: 0 };
  g.lockResets = 0;
  assert(Game._internals.collidesAt(g, 2, 7, 0), 'the naive horizontal rotation should collide with the right wall');
  const ok = g.rotate(1);
  assert(ok, 'rotation should succeed via a wall kick');
  assertEqual(g.current.rotation, 2, 'rotation advanced to 180');
  assertEqual(g.current.x, 6, 'the 1->2 kick (-1,0) moves the piece one column left');
  assertEqual(g.current.y, 0, 'a horizontal kick leaves y unchanged');
});

test('SRS kick: a JLSTZ piece kicks up off the floor where naive rotation falls through', () => {
  const g = Game.create();
  const floor = Board.HEIGHT + Board.BUFFER - 1; // last valid row, y=23
   // T resting one row above the floor; the naive CCW (0->3) sends the nub
   // below the floor, but the 0->3 kick (1,1 -> +x, -y on this board) lifts it.
  g.current = { type: 'T', rotation: 0, x: 3, y: floor - 1 };
  g.lockResets = 0;
  assert(Game._internals.collidesAt(g, 3, 3, floor - 1), 'the naive CCW rotation should collide with the floor');
  const ok = g.rotate(-1);
  assert(ok, 'rotation should succeed via a wall kick');
  assertEqual(g.current.rotation, 3, 'rotation advanced to L (state 3)');
  assert(!Game._internals.collidesAt(g, 3, g.current.x, g.current.y), 'the kicked position must not collide');
});

test('rotation fails and the piece is unchanged when every kick collides', () => {
  const g = Game.create();
     // Fill the whole field, then carve out exactly the current piece's
     // footprint: it fits its current orientation, but every rotated position
     // overlaps a filled cell, so no kick can land. This proves the "fails
     // cleanly" contract without hand-tracing which corner traps all 5 kicks.
  for (let y = 0; y < g.board.length; y++) {
    for (let x = 0; x < Board.WIDTH; x++) g.board[y][x] = 'X';
     }
  g.current = { type: 'T', rotation: 0, x: 3, y: 20 };
  g.lockResets = 0;
  for (const [cx, cy] of Piece.getCells('T', 0, 3, 20)) g.board[cy][cx] = null;
  assert(!Game._internals.collidesAt(g, 0, 3, 20), 'the piece fits its current orientation');
  const ok = g.rotate(1);
  assert(!ok, 'rotation should fail when every kick collides');
  assertEqual(g.current.rotation, 0, 'rotation state is unchanged after a failed rotation');
  assertEqual(g.current.x, 3, 'x is unchanged after a failed rotation');
  assertEqual(g.current.y, 20, 'y is unchanged after a failed rotation');
});

test('the O piece never rotates even when rotation is requested', () => {
  const g = Game.create();
  g.current = { type: 'O', rotation: 0, x: 3, y: 0 };
  assert(!g.rotate(1), 'the O piece should report no rotation');
  assertEqual(g.current.rotation, 0, 'O rotation state stays 0');
});

// ---------------------------------------------------------------- Phase 3
// Randomizer

test('7-bag: an aligned group of 7 draws contains each piece exactly once', () => {
  const bag = Randomizer.createBag();
  const drawn = [];
  for (let i = 0; i < 7; i++) drawn.push(bag.next());
  const unique = new Set(drawn);
  assertEqual(unique.size, 7, `expected 7 unique pieces, got ${JSON.stringify(drawn)}`);
});

test('Randomizer.peek does not consume', () => {
  const bag = Randomizer.createBag();
  const peeked = bag.peek(3);
  assertEqual(peeked.length, 3, 'peek(3) should return 3 pieces');
  const first = bag.next();
  assertEqual(first, peeked[0], 'first draw after peek should match the first peeked piece');
});

test('14 consecutive draws form two complete permutations', () => {
  const bag = Randomizer.createBag();
  const drawn = [];
  for (let i = 0; i < 14; i++) drawn.push(bag.next());
  for (let b = 0; b < 2; b++) {
    const chunk = drawn.slice(b * 7, b * 7 + 7);
    assertEqual(new Set(chunk).size, 7, `bag ${b} should hold all 7 pieces`);
   }
});

test('peek across a bag boundary returns enough pieces', () => {
  const bag = Randomizer.createBag();
  for (let i = 0; i < 5; i++) bag.next(); // 2 left in the first bag
  const peeked = bag.peek(3); // must reach into the freshly refilled bag
  assertEqual(peeked.length, 3, 'peek(3) should return 3 even across a boundary');
  for (const p of peeked) assert(Randomizer.TYPES.includes(p), `peeked ${p} is not a valid type`);
});

// ---------------------------------------------------------------- Phase 4a
// Core game loop (game.js) — DOM-free. Covers movement, gravity/lock-delay,
// the lock-reset cap, hold, hard-drop-lands, and top-out.

test('a fresh game spawns an active piece and queues upcoming pieces', () => {
  const g = Game.create();
  assert(g.current !== null, 'a fresh game should have an active piece');
  assertEqual(g.nextQueue.length, Game.NEXT_QUEUE, 'queue should be prefilled to NEXT_QUEUE');
  assertEqual(g.state, 'playing');
});

test('move shifts the active piece and reports a failed move at the wall', () => {
  const g = Game.create();
  const startX = g.current.x;
  // walk left until a move is rejected (left wall); it must eventually fail.
  let moved = 0;
  for (let i = 0; i < 20; i++) {
    if (g.move(-1)) moved++;
    else break;
   }
  assert(moved > 0, 'the piece should have moved left at least once');
  assert(g.current.x < startX, 'piece should have shifted left');
});

test('naive rotation succeeds for a non-O piece in open space', () => {
  const g = Game.create();
   // If the very first piece happens to be an O (no rotation), skip the
   // rotation assertion; the point of this test is that rotate() is wired.
  if (g.current.type !== 'O') {
    const before = g.current.rotation;
    const ok = g.rotate(1);
    assert(ok, 'rotate should succeed in open space');
    assertEqual(g.current.rotation, (before + 1) % 4, 'rotation state advanced');
   }
});

test('lock-delay resets on grounded moves but cap at MAX_LOCK_RESETS', () => {
  const g = Game.create();
   // Ground the piece without locking it.
  g.dropToFloor();
  assert(g.onGround, 'piece should be grounded after dropToFloor');
   // Alternate left/right so every move keeps it grounded; each grounded
   // move should reset the lock timer — but the counter caps.
  for (let i = 0; i < 200; i++) g.move(i % 2 === 0 ? -1 : 1);
  assertEqual(g.lockResets, Game.MAX_LOCK_RESETS, 'lockResets must cap at the max');
});

test('a grounded piece locks after the lock-delay timer runs out', () => {
  const g = Game.create();
  g.dropToFloor();
   // One tick that overruns the lock delay must lock the current piece and
   // spawn a new one.
  g.tick(Game.LOCK_DELAY_MS + 1);
  assertEqual(g.lastEvents.type, 'lock', 'a lock event should be reported');
   // a brand-new piece is now active
  assert(g.current !== null, 'a new piece should be active after the lock');
});

test('hardDrop slides to the floor, scores, and locks + spawns next', () => {
  const g = Game.create();
  const cells = g.hardDrop();
  assert(cells > 0, 'the piece should drop some cells');
   // the dropped piece is now in the board: at least one occupied cell.
  let occupied = 0;
  for (let y = 0; y < g.board.length; y++) {
    for (let x = 0; x < Board.WIDTH; x++) {
      if (g.board[y][x] !== null) occupied++;
     }
   }
  assertEqual(occupied, 4, 'a single locked tetromino occupies 4 cells');
   // hard drop awards 2 points per cell dropped
  assertEqual(g.score, cells * 2, 'hard drop should score 2 pts/cell');
});

test('hold swaps the active piece into hold once, then is blocked until lock', () => {
  const g = Game.create();
  const first = g.current.type;
  assert(g.hold(), 'first hold should succeed');
  assert(!g.hold(), 'a second hold before the next lock should be blocked');
  assertEqual(g.holdType, first, 'hold slot should store the first piece');
   // after a lock (hard drop), holding is allowed again
  g.hardDrop();
  assert(g.holdUsed === false, 'holdUsed should reset after a lock');
});

test('a top-out (spawn collision) sets state=over / result=lost', () => {
  const g = Game.create();
   // Fill the top two buffer rows so that ANY piece collides on spawn.
   // (The I piece occupies row 1 at spawn; O/T/S/Z/J/L touch row 0, so two
   // full rows guarantees a collision regardless of which piece is next.)
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < Board.WIDTH; x++) g.board[y][x] = 'X';
   }
  const ok = g.spawnNext();
  assertEqual(ok, false, 'the spawn should fail on a blocked top');
  assertEqual(g.state, 'over', 'state should be over after a top-out');
  assertEqual(g.result, 'lost', 'result should be lost after a top-out');
});

// ---------------------------------------------------------------- Phase 7
// Scoring — point table + gravity curve (js/scoring.js).

test('line-clear points at level 1 match the SPEC table', () => {
  assertEqual(Scoring.linesScore(1, 1), 100, 'single should be 100 at level 1');
  assertEqual(Scoring.linesScore(2, 1), 300, 'double should be 300 at level 1');
  assertEqual(Scoring.linesScore(3, 1), 500, 'triple should be 500 at level 1');
  assertEqual(Scoring.linesScore(4, 1), 800, 'tetris should be 800 at level 1');
});

test('line-clear points scale by level', () => {
  // 5x the base value at level 5.
  assertEqual(Scoring.linesScore(1, 5), 500, 'single at level 5 = 100*5');
  assertEqual(Scoring.linesScore(2, 5), 1500, 'double at level 5 = 300*5');
  assertEqual(Scoring.linesScore(3, 5), 2500, 'triple at level 5 = 500*5');
  assertEqual(Scoring.linesScore(4, 5), 4000, 'tetris at level 5 = 800*5');
});

test('line-clear points clamp the level to a minimum of 1', () => {
  assertEqual(Scoring.linesScore(2, 0), 300, 'level 0 behaves like level 1');
  assertEqual(Scoring.linesScore(2, -3), 300, 'a negative level behaves like level 1');
});

test('zero or unknown line counts score nothing', () => {
  assertEqual(Scoring.linesScore(0, 3), 0, 'no lines cleared = 0 points');
  assertEqual(Scoring.linesScore(5, 3), 0, 'more than 4 lines has no base value');
});

test('soft drop is 1 pt/cell and hard drop is 2 pts/cell', () => {
  assertEqual(Scoring.softDropScore(1), 1, 'one soft-drop cell = 1 point');
  assertEqual(Scoring.softDropScore(12), 12, 'soft drop is 1 pt/cell');
  assertEqual(Scoring.hardDropScore(1), 2, 'one hard-drop cell = 2 points');
  assertEqual(Scoring.hardDropScore(12), 24, 'hard drop is 2 pts/cell');
});

test('gravityForLevel is 1000ms at level 1 and decreases as level rises', () => {
  assertEqual(Scoring.gravityForLevel(1), 1000, 'level 1 gravity = 1000ms');
  assert(Scoring.gravityForLevel(5) < Scoring.gravityForLevel(1),
    'level 5 must be faster than level 1');
  assert(Scoring.gravityForLevel(9) < Scoring.gravityForLevel(5),
    'level 9 must be faster than level 5');
});

test('gravityForLevel is monotonically non-increasing and floors at 50ms', () => {
  // Non-increasing across a wide range (the 50ms floor makes it flat near the top).
  let prev = Scoring.gravityForLevel(0);
  for (let lv = 1; lv <= 30; lv++) {
    const cur = Scoring.gravityForLevel(lv);
    assert(cur <= prev, `gravity at level ${lv} (${cur}) must not exceed level ${lv - 1} (${prev})`);
    prev = cur;
  }
  // Strictly decreasing in the region above the floor.
  assert(Scoring.gravityForLevel(5) > Scoring.gravityForLevel(15),
    'gravity should still be speeding up between levels 5 and 15');
  // The floor is 50ms — high levels are clamped, not sub-50.
  assertEqual(Scoring.gravityForLevel(50), 50, 'gravity floors at 50ms for very high levels');
});

// ---------------------------------------------------------------- Phase 8
// Modes — mode configs + difficulty presets (js/modes.js).

test('Sprint reports "won" exactly at 40 lines, not before or after', () => {
  const sprint = Modes.getConfig('sprint', 'normal');
  assert(sprint.targetLines === 40, 'Sprint targets 40 lines');
  assert(!sprint.checkWin({ linesCleared: 39 }), '39 lines should not win');
  assert(sprint.checkWin({ linesCleared: 40 }), '40 lines should win');
  assert(sprint.checkWin({ linesCleared: 45 }), 'stays won past 40');
  assert(sprint.checkResult({ linesCleared: 40 }) === 'won', 'checkResult is won at 40');
});

test('Marathon levels up every 10 lines; Classic/Sprint hold their start level', () => {
  const marathon = Modes.getConfig('marathon', 'normal'); // startLevel 5
  assert(marathon.rampsWithLevel, 'Marathon ramps with level');
  assertEqual(marathon.levelForLines(0), 5, 'level 5 at 0 lines');
  assertEqual(marathon.levelForLines(9), 5, 'still level 5 at 9 lines');
  assertEqual(marathon.levelForLines(10), 6, 'level 6 at 10 lines');
  assertEqual(marathon.levelForLines(37), 8, 'level 8 at 37 lines');
  assertEqual(marathon.levelForLines(40), 9, 'level 9 at 40 lines');
  const classic = Modes.getConfig('classic', 'normal');
  assert(!classic.rampsWithLevel, 'Classic does not ramp');
  assertEqual(classic.levelForLines(40), 5, 'Classic holds its start level');
  const sprint = Modes.getConfig('sprint', 'normal');
  assertEqual(sprint.levelForLines(40), 5, 'Sprint holds its start level');
});

test('each difficulty maps to a distinct starting gravity', () => {
  const easy = Modes.getConfig('classic', 'easy'); // startLevel 1
  const normal = Modes.getConfig('classic', 'normal'); // startLevel 5
  const hard = Modes.getConfig('classic', 'hard'); // startLevel 9
  assert(easy.startLevel === 1, 'Easy starts at level 1');
  assert(normal.startLevel === 5, 'Normal starts at level 5');
  assert(hard.startLevel === 9, 'Hard starts at level 9');
  const gravities = [easy.startGravity, normal.startGravity, hard.startGravity];
  assert(new Set(gravities).size === 3, 'all three starting gravities must be distinct');
  // faster gravity = smaller ms, so higher level is strictly faster.
  assert(easy.startGravity > normal.startGravity, 'Easy must be slower than Normal');
  assert(normal.startGravity > hard.startGravity, 'Normal must be slower than Hard');
});

test('Sprint gravity does not ramp but Marathon does', () => {
  assert(!Modes.getConfig('sprint', 'normal').rampsWithLevel, 'Sprint gravity is fixed');
  assert(Modes.getConfig('marathon', 'normal').rampsWithLevel, 'Marathon gravity ramps');
});

test('classic and marathon are endless (no win target)', () => {
  assert(Modes.getConfig('classic', 'normal').checkWin({ linesCleared: 999 }) === false,
     'Classic has no win target');
  assert(Modes.getConfig('marathon', 'normal').checkWin({ linesCleared: 999 }) === false,
     'Marathon has no win target');
});

test('getConfig throws on an unknown mode or difficulty', () => {
  assertThrows(() => Modes.getConfig('freestyle', 'normal'), 'unknown mode');
  assertThrows(() => Modes.getConfig('classic', 'medium'), 'unknown difficulty');
});

// ---------------------------------------------------------------- Phase 19
// Music sequencer (js/music.js) — pure data + timing. The audio layer in
// js/audio.js consumes this; the tests prove the patterns, scheduling, and
// duck envelope are sane.

test('music: every voice has the same bar count as SONG.bars', () => {
  const song = Music.SONG;
  for (const voice of song.voices) {
    assertEqual(voice.pattern.length, song.bars,
      `${voice.name} should have ${song.bars} bars`);
  }
});

test('music: every note has a valid midi number and lies inside its bar', () => {
  const song = Music.SONG;
  for (const voice of song.voices) {
    for (let bar = 0; bar < voice.pattern.length; bar++) {
      for (const note of voice.pattern[bar]) {
        assert(note.midi >= 0 && note.midi <= 127,
          `${voice.name} bar ${bar}: midi ${note.midi} out of range`);
        assert(note.beat >= 0 && note.beat < song.beatsPerBar,
          `${voice.name} bar ${bar}: beat ${note.beat} outside [0,${song.beatsPerBar})`);
        assert(note.durBeats > 0,
          `${voice.name} bar ${bar}: durBeats must be positive`);
      }
    }
  }
});

test('music: tempoForLevel is non-decreasing and capped', () => {
  const base = Music.SONG.baseBpm;
  let prev = Music.tempoForLevel(1, base);
  assertEqual(prev, base, 'tempo at level 1 equals the base BPM');
  for (let lv = 2; lv <= 30; lv++) {
    const cur = Music.tempoForLevel(lv, base);
    assert(cur >= prev, `tempo should not decrease from level ${lv - 1} to ${lv}`);
    assert(cur <= 176, `tempo at level ${lv} (${cur}) exceeds the cap`);
    prev = cur;
  }
  assertEqual(Music.tempoForLevel(100, base), 176, 'very high level hits the cap');
});

test('music: duck envelope starts at unity, dips, and returns to unity', () => {
  assertEqual(Music.duckGain(0), 1, 'duck gain starts at unity');
  assertEqual(Music.duckGain(200), 1, 'duck gain returns to unity after the envelope');
  const dip = Music.duckGain(20);
  assert(dip < 1 && dip > 0.5, 'duck gain dips in the middle but not to zero');
  assert(Music.duckGain(5) >= Music.duckGain(20),
    'attack should be higher (closer to unity) than the dip');
  assert(Music.duckGain(100) > Music.duckGain(20),
    'release should recover from the dip');
});

test('music: scheduler covers one full loop with every pattern note exactly once', () => {
  const song = Music.SONG;
  const bpm = song.baseBpm;
  const beatDur = Music.beatDuration(bpm);
  const totalBeats = Music.totalBeats(song);
  const totalSeconds = totalBeats * beatDur;

  // One big lookahead window over the whole loop.
  const res = Music.schedule(song, 0, 0, totalSeconds, bpm);
  let expected = 0;
  for (const voice of song.voices) {
    for (const bar of voice.pattern) expected += bar.length;
  }
  assertEqual(res.notes.length, expected,
    'scheduler should emit every note in the 16-bar loop exactly once');

  // Every returned note must lie in the requested absolute window and carry
  // valid derived fields.
  for (const n of res.notes) {
    assert(n.t >= 0 && n.t < totalSeconds,
      `note at ${n.t} outside [0,${totalSeconds})`);
    assert(n.dur > 0, 'scheduled note has a positive duration');
    assert(n.freq > 0, 'scheduled note has a positive frequency');
    assert(n.vel > 0 && n.vel <= 1, 'velocity in range');
  }
});

test('music: scheduler loops seamlessly without duplicating notes across windows', () => {
  const song = Music.SONG;
  const bpm = song.baseBpm;
  const beatDur = Music.beatDuration(bpm);
  const totalBeats = Music.totalBeats(song);
  const totalSeconds = totalBeats * beatDur;

  // First loop: [0, totalSeconds).
  const first = Music.schedule(song, 0, 0, totalSeconds, bpm);
  // Second loop: [totalSeconds, 2*totalSeconds).
  const second = Music.schedule(song, totalBeats, totalSeconds, 2 * totalSeconds, bpm);
  assertEqual(second.notes.length, first.notes.length,
    'second loop should schedule the same number of notes as the first');

  const firstKeys = new Set(first.notes.map((n) => `${n.voice}|${n.midi}|${Math.round(n.t * 1000)}`));
  for (const n of second.notes) {
    const key = `${n.voice}|${n.midi}|${Math.round(n.t * 1000)}`;
    assert(!firstKeys.has(key), `second-loop note ${key} duplicates a first-loop note`);
  }

  // The loop boundary is seamless: the first note of the second window starts
  // exactly at (or very near) totalSeconds with no overlap into the first.
  const firstSecond = second.notes[0];
  assert(firstSecond.t >= totalSeconds && firstSecond.t < totalSeconds + beatDur,
    'second loop should start right at the boundary, with no gap');
  for (const n of second.notes) {
    assert(n.t >= totalSeconds && n.t < 2 * totalSeconds,
      'second-loop notes must lie inside [totalSeconds, 2*totalSeconds)');
  }
});

test('music: scheduler does not fall behind during jittered 60s playback', () => {
  const song = Music.SONG;
  const bpm = song.baseBpm;
  let cursor = 0;
  let now = 0;
  let lastUntil = 0;
  let totalScheduledWindow = 0;
  let steps = 0;
  // Jittered frame times: 50-150ms between scheduler calls.
  while (now < 60) {
    const lookahead = 0.08 + Math.random() * 0.12; // 80-200ms ahead
    const until = now + lookahead;
    const res = Music.schedule(song, cursor, now, until, bpm);
    assert(res.cursor >= cursor - 0.0001, 'cursor should not move backwards');
    cursor = res.cursor;
    assert(res.notes.every((n) => n.t >= now && n.t < until),
      'all scheduled notes must lie inside the requested lookahead window');
    totalScheduledWindow += (until - now);
    lastUntil = until;
    now += lookahead * 0.7; // frame dt is a bit less than lookahead
    steps++;
  }
  assert(steps > 100, 'simulation ran for many scheduler ticks');
  assert(totalScheduledWindow >= 60 - 0.5,
    'scheduled windows should cover most of the elapsed time');
  assert(lastUntil >= now, 'last scheduled window should extend past the current time');
});

test('music: stinger patterns are non-empty and fit inside one bar', () => {
  for (const name of ['tetris', 'levelup', 'gameover']) {
    const st = Music.STINGERS[name];
    assert(st && st.notes && st.notes.length > 0, `${name} stinger should have notes`);
    for (const note of st.notes) {
      assert(note.beat >= 0 && note.beat < 4, `${name} stinger note inside one bar`);
      assert(note.midi >= 0 && note.midi <= 127, `${name} stinger midi valid`);
    }
  }
});

// ---------------------------------------------------------------- Phase 20
// Animated background simulation (js/backgroundsim.js) — pure motion math,
// no canvas. Tests cover creation, wrap-around, reduced motion, palette
// reactions, and bounded derived colors.

test('background: create returns the expected shape count and valid types', () => {
  const state = BackgroundSim.create();
  assertEqual(state.shapes.length, BackgroundSim.DEFAULT_SHAPE_COUNT,
    'default state should have DEFAULT_SHAPE_COUNT shapes');
  for (const s of state.shapes) {
    assert(BackgroundSim.PIECE_TYPES.includes(s.type), `shape type ${s.type} should be a valid piece`);
    assert(s.x >= 0 && s.x < 1, 'shape x should be initialized in [0,1)');
    assert(s.y >= 0 && s.y < 1, 'shape y should be initialized in [0,1)');
    assert(s.size > 0, 'shape size should be positive');
  }
});

test('background: step wraps positions around the unit torus', () => {
  const state = BackgroundSim.create({ count: 1 });
  const s = state.shapes[0];
  s.x = 0.99;
  s.y = 0.01;
  s.vx = 0.05;
  s.vy = -0.03;
  BackgroundSim.step(state, 1000, {});
  assert(s.x >= 0 && s.x < 1, 'x should wrap into [0,1)');
  assert(s.y >= 0 && s.y < 1, 'y should wrap into [0,1)');
  assert(s.x < 0.99, 'x wrapped forward');
  assert(s.y > 0.01, 'y wrapped backward');
});

test('background: reduced motion freezes positions', () => {
  const state = BackgroundSim.create({ count: 3 });
  const before = state.shapes.map((s) => ({ x: s.x, y: s.y, rot: s.rot }));
  BackgroundSim.step(state, 500, { reducedMotion: true });
  for (let i = 0; i < state.shapes.length; i++) {
    assertEqual(state.shapes[i].x, before[i].x, 'reduced motion should keep x unchanged');
    assertEqual(state.shapes[i].y, before[i].y, 'reduced motion should keep y unchanged');
    assertEqual(state.shapes[i].rot, before[i].rot, 'reduced motion should keep rotation unchanged');
  }
});

test('background: event pulse is injected and decays toward zero', () => {
  const state = BackgroundSim.create({ count: 1 });
  BackgroundSim.step(state, 0, { eventPulse: 0.6 });
  assert(state.eventPulse >= 0.5, 'eventPulse should accept the injected pulse');
  const peak = state.eventPulse;
  BackgroundSim.step(state, 1000, {});
  assert(state.eventPulse < peak, 'eventPulse should decay after one second');
  BackgroundSim.step(state, 10000, {});
  assertEqual(state.eventPulse, 0, 'eventPulse should fully decay given enough time');
});

test('background: palette reacts to tetris, line clear, and level up', () => {
  const dark = BackgroundSim.create();
  BackgroundSim.step(dark, 16, {});
  assertEqual(dark.palette, 'dark', 'quiet state stays dark');

  const clear = BackgroundSim.create();
  BackgroundSim.step(clear, 16, { lineClear: true });
  assertEqual(clear.palette, 'clear', 'line clear switches to clear palette');

  const tetris = BackgroundSim.create();
  BackgroundSim.step(tetris, 16, { tetris: true });
  assertEqual(tetris.palette, 'tetris', 'tetris switches to tetris palette');

  const levelUp = BackgroundSim.create();
  BackgroundSim.step(levelUp, 16, { levelUp: true });
  assertEqual(levelUp.palette, 'clear', 'level up uses the clear palette');
});

test('background: derive returns bounded values and valid HSLA strings', () => {
  const state = BackgroundSim.create({ count: 1 });
  BackgroundSim.step(state, 0, { eventPulse: 0.8 });
  const d = BackgroundSim.derive(state, state.shapes[0]);
  assert(d.x >= 0 && d.x < 1, 'derived x in [0,1)');
  assert(d.y >= 0 && d.y < 1, 'derived y in [0,1)');
  assert(d.size > 0, 'derived size positive');
  assert(d.alpha >= 0 && d.alpha <= 0.9, 'derived alpha stays bounded');
  assert(/^hsla\(\d+(\.\d+)?, \d+%, \d+%, [\d.]+\)$/.test(d.color),
    `derived color should be a valid HSLA string: ${d.color}`);
  assert(/^hsla\(\d+(\.\d+)?, \d+%, \d+%, [\d.]+\)$/.test(d.glow),
    `derived glow should be a valid HSLA string: ${d.glow}`);
});

// ---------------------------------------------------------------- Phase 21
// Render-side animation timelines (js/fxtimeline.js) and model-signal tests.
// The heavy canvas work stays browser-only; the timing math and popup pool
// are proven here.

test('fxtimeline: line-clear starts with flash and ends fully dissolved/slid', () => {
  const d = FxTimeline.DURATIONS.lineClear;
  const start = FxTimeline.lineClearProgress(0);
  assertEqual(start.flash, 1, 'flash starts at full');
  assertEqual(start.dissolve, 0, 'nothing dissolved at start');
  assertEqual(start.slide, 0, 'no slide at start');

  const end = FxTimeline.lineClearProgress(d);
  assertEqual(end.flash, 0, 'flash gone by end');
  assertEqual(end.dissolve, 1, 'fully dissolved by end');
  assertEqual(end.slide, 1, 'fully slid by end');
  assert(!end.active, 'not active at end');

  const mid = FxTimeline.lineClearProgress(d * 0.5);
  assert(mid.active, 'active at midpoint');
  assert(mid.flash < start.flash, 'flash fades by midpoint');
  assert(mid.dissolve > 0 && mid.dissolve < 1, 'partially dissolved at midpoint');
  assert(mid.slide > 0 && mid.slide <= 1, 'partially slid at midpoint');
});

test('fxtimeline: line-clear slide offset is non-decreasing', () => {
  const d = FxTimeline.DURATIONS.lineClear;
  let prev = -1;
  for (let t = 0; t <= d; t += 10) {
    const cur = FxTimeline.lineClearProgress(t).slide;
    assert(cur >= prev - 0.001, `slide regressed at t=${t}: ${cur} < ${prev}`);
    prev = cur;
  }
});

test('fxtimeline: lock flash and popup progress are bounded', () => {
  const dLock = FxTimeline.DURATIONS.lockFlash;
  assertEqual(FxTimeline.lockFlashProgress(0), 0, 'lock flash off at t=0');
  assertEqual(FxTimeline.lockFlashProgress(dLock), 0, 'lock flash off after duration');
  assert(FxTimeline.lockFlashProgress(dLock / 2) > 0, 'lock flash on during duration');

  const dPop = FxTimeline.DURATIONS.popup;
  const start = FxTimeline.popupProgress(0);
  assert(!start.active, 'popup not active at t=0');
  const end = FxTimeline.popupProgress(dPop);
  assert(!end.active, 'popup not active after duration');
  const mid = FxTimeline.popupProgress(dPop / 2);
  assert(mid.active, 'popup active during duration');
  assert(mid.yOffsetPx <= 0 && mid.yOffsetPx >= -40, 'popup rises up to 40px');
  assert(mid.alpha > 0 && mid.alpha <= 1, 'popup alpha bounded');
});

test('fxtimeline: hard-drop trail fades and reduces copies', () => {
  const d = FxTimeline.DURATIONS.hardDropTrail;
  assert(!FxTimeline.hardDropTrailProgress(0).active, 'trail off at t=0');
  const end = FxTimeline.hardDropTrailProgress(d);
  assert(!end.active && end.copies === 0, 'trail off after duration');
  const early = FxTimeline.hardDropTrailProgress(d * 0.2);
  assert(early.active && early.copies >= 1, 'trail active early');
  const late = FxTimeline.hardDropTrailProgress(d * 0.8);
  assert(late.copies <= early.copies, 'fewer copies as trail fades');
});

test('fxtimeline: danger tint alpha is bounded and ramps with stack height', () => {
  assertEqual(FxTimeline.dangerTintAlpha(0), 0, 'empty stack = no tint');
  assertEqual(FxTimeline.dangerTintAlpha(12), 0, 'below danger threshold = no tint');
  const low = FxTimeline.dangerTintAlpha(14);
  const high = FxTimeline.dangerTintAlpha(19);
  assert(high > low, 'tint grows toward the top');
  assert(FxTimeline.dangerTintAlpha(99) <= 0.30, 'tint capped');
});

test('fxtimeline: popup pool is bounded and overwrites oldest', () => {
  const state = FxTimeline.Popups.create();
  assertEqual(state.max, FxTimeline.POPUP_MAX, 'pool size matches POPUP_MAX');
  for (let i = 0; i < FxTimeline.POPUP_MAX + 10; i++) {
    FxTimeline.Popups.spawn(state, 'x' + i, 0, 0, i);
  }
  assert(FxTimeline.Popups.count(state, FxTimeline.POPUP_MAX + 20) <= FxTimeline.POPUP_MAX,
    'live popup count stays bounded');
  // The oldest slots were overwritten, so the earliest texts are gone.
  const texts = new Set(state.slots.filter((s) => s.live).map((s) => s.text));
  assert(!texts.has('x0'), 'oldest popup was overwritten');
  assert(texts.has('x' + (FxTimeline.POPUP_MAX + 9)), 'newest popup survived');
});

test('game: lock event carries the locked cells and piece type', () => {
  const g = Game.create();
  // A soft-drop-to-floor lock is the easiest deterministic lock.
  g.dropToFloor();
  g.tick(Game.LOCK_DELAY_MS + 1);
  assertEqual(g.lastEvents.type, 'lock', 'a lock event fires');
  assert(g.lastEvents.piece, 'lock event carries the piece type');
  assert(Array.isArray(g.lastEvents.cells) && g.lastEvents.cells.length === 4,
    'lock event carries the 4 locked cells');
});

test('game: hardDropLanding includes the drop start y', () => {
  const g = Game.create();
  const startY = g.current.y;
  g.hardDrop();
  assert(g.hardDropLanding != null, 'hard drop landing recorded');
  assertEqual(g.hardDropLanding.fromY, startY,
    'landing records the y before the drop');
  assert(g.hardDropLanding.y > g.hardDropLanding.fromY,
    'drop moved the piece downward');
});

test('game: model does not add new presentation-only fields', () => {
  // The renderer reads existing signals (lastEvents, hardDropAt,
  // hardDropLanding, level, score, state). This test guards against adding
  // presentation-only fields like flash/glow/sprite directly to the game object.
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8');
  const noComment = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const forbidden = ['flash', 'glow', 'sprite', 'vignette', 'pulse', 'shake'];
  for (const f of forbidden) {
    assert(!noComment.includes(f), `game.js contains presentation-only keyword "${f}"`);
  }
  assert(!noComment.includes('T.Render') && !noComment.includes('T.Particles'),
    'game.js must not import renderer/particle modules');
});

// ---------------------------------------------------------------- Phase 15
// Model signals for the render-side particle system (js/particles.js):
// the lineClear event now carries the cleared rows + their cell letters,
// and hardDrop records where the piece landed. Both are pure model data.

test('a line-clear event carries the cleared rows and their cell letters', () => {
  const g = Game.create();
  const last = Board.HEIGHT + Board.BUFFER - 1;
  // fill the bottom row except column 0, then drop a vertical I into it
  for (let x = 1; x < Board.WIDTH; x++) g.board[last][x] = 'I';
  g.current = { type: 'I', rotation: 1, x: -2, y: 0 };
  g.lockResets = 0;
  g.hardDrop();
  assertEqual(g.lastEvents.type, 'lineClear', 'the drop should clear one line');
  assertEqual(g.lastEvents.lines, 1, 'exactly one line cleared');
  assert(Array.isArray(g.lastEvents.rows) && g.lastEvents.rows.length === 1,
    'rows should list exactly the cleared row');
  assertEqual(g.lastEvents.rows[0], last, 'the cleared row should be the bottom row');
  assert(g.lastEvents.rowCells[0].every((c) => c !== null),
    'every cleared cell should carry its piece letter for particle colors');
  });

test('a Tetris event carries all four cleared rows', () => {
  const g = Game.create();
  const bottom = Board.HEIGHT + Board.BUFFER - 1;
  for (let row = bottom - 3; row <= bottom; row++) {
    for (let x = 1; x < Board.WIDTH; x++) g.board[row][x] = 'Z';
    }
  g.current = { type: 'I', rotation: 1, x: -2, y: 0 };
  g.lockResets = 0;
  g.hardDrop();
  assertEqual(g.lastEvents.type, 'lineClear', 'four rows should clear');
  assertEqual(g.lastEvents.lines, 4, 'the event should report a Tetris');
  assertEqual(g.lastEvents.rows.length, 4, 'all four row indices should be listed');
  assertEqual(g.lastEvents.rowCells.length, 4, 'each cleared row should have its cells');
  });

test('hardDrop records a landing snapshot matching the locked cells', () => {
  const g = Game.create();
  assert(g.hardDrop() > 0, 'the piece should drop');
  const landing = g.hardDropLanding;
  assert(landing && landing.type, 'hardDropLanding should be recorded');
  const cells = Piece.getCells(landing.type, landing.rotation, landing.x, landing.y);
  assertEqual(cells.length, 4, 'the landing piece has 4 cells');
  for (const [cx, cy] of cells) {
    assertEqual(g.board[cy][cx], landing.type,
      'every landing cell should be locked into the board');
    }
  });

// ---------------------------------------------------------------- Phase 13
// UI wiring smoke test (js/ui.js + js/main.js) with minimal DOM stubs.
//
// These modules are browser-only (no dual export), but their *wiring* is
// testable in Node with stubs: this section is the regression guard for the
// Phase 13 bug where _on('btn-play', ...) called .addEventListener on a raw
// string, threw on the first binding, and left every menu button dead.
// It is NOT a substitute for a human click-test in a real browser (canvas,
// CSS, and real event semantics still need eyes) — see PROGRESS.md.

function makeClassList(initial) {
  const set = new Set(initial || []);
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: (c, force) => {
      const want = force === undefined ? !set.has(c) : !!force;
      if (want) set.add(c); else set.delete(c);
      return want;
      },
    };
  }

function makeEl(id) {
  const el = {
    id: id,
    dataset: {},
    listeners: {},
    children: [],
    className: '',
    textContent: '',
    innerHTML: '',
    classList: makeClassList(id === 'screen-home' ? [] : ['hidden']),
    blur: () => {},
    appendChild: (child) => { el.children.push(child); return child; },
    addEventListener: (type, fn) => {
      (el.listeners[type] = el.listeners[type] || []).push(fn);
      },
    setAttribute: () => {},
    };
  return el;
  }

// Ids _bind() binds by string (btn-* and toggle-*) plus every screen/el
// _cache() looks up. Screens start hidden except home, matching index.html.
const UI_IDS = [
  'screen-home', 'screen-mode-select', 'screen-game',
  'screen-pause', 'screen-settings', 'screen-gameover',
  'difficulty-seg', 'gameover-title', 'gameover-stats',
  'toggle-music', 'toggle-sfx',
  'val-score', 'val-lines', 'val-level', 'val-time',
  'stat-score', 'stat-lines', 'stat-level', 'stat-time',
  'btn-play', 'btn-settings-home', 'btn-back-home', 'btn-resume',
  'btn-restart-pause', 'btn-settings-pause', 'btn-quit-pause',
  'btn-settings-back', 'btn-retry', 'btn-menu',
  ];

function installDomStubs() {
  const byId = {};
  for (const id of UI_IDS) byId[id] = makeEl(id);

  // difficulty segmented control: three buttons like index.html's markup.
  byId['difficulty-seg'].children = ['easy', 'normal', 'hard'].map((d) => {
    const b = makeEl('diff-' + d);
    b.dataset.difficulty = d;
    return b;
    });

  const modeCards = ['classic', 'marathon', 'sprint'].map((m) => {
    const c = makeEl('mode-' + m);
    c.dataset.mode = m;
    return c;
    });

  // Phase 14: the touch-control markup (one button per action, like
  // index.html). touch.js discovers them via a per-element querySelectorAll.
  byId['touch-controls'] = makeEl('touch-controls');
  const touchButtons = ['left', 'right', 'soft', 'cw', 'ccw', 'hard', 'hold']
    .map((a) => {
      const b = makeEl('tbtn-' + a);
      b.dataset.action = a;
      byId['touch-controls'].children.push(b);
      return b;
      });
  byId['touch-controls'].querySelectorAll =
    (sel) => (sel === '[data-action]' ? touchButtons : []);
  byId['btn-pause-touch'] = makeEl('btn-pause-touch');

  const doc = {
    readyState: 'complete',
    body: makeEl('body'),
    activeElement: makeEl('active'),
    getElementById: (id) => byId[id] || null,
    querySelectorAll: (sel) => (sel === '.mode-card' ? modeCards : []),
    createElement: (tag) => makeEl(tag + '-new'),
    addEventListener: () => {},
    };
  const win = { addEventListener: () => {} };
  // rAF is a LIST, like a real browser: one frame fires every callback that
  // was registered when the frame started. A single-slot stub breaks once
  // two loops coexist (main.js's frame + touch.js's self-scheduling loop
  // both register, and whichever registered last won the slot — Phase 16's
  // 16c test tripped exactly on that).
  let rafFns = [];
  const raf = (fn) => { rafFns.push(fn); return 0; };

  global.document = doc;
  global.window = win;
  global.requestAnimationFrame = raf;

  return {
    byId: byId,
    body: doc.body,
    modeCards: modeCards,
    click: (el, extra) => {
      for (const fn of (el.listeners.click || [])) fn(Object.assign({
        currentTarget: el,
        }, extra || {}));
      },
    // One browser frame: invoke every rAF callback registered at frame
    // start; callbacks scheduled DURING the pass (each loop re-registers
    // itself) wait for the next frame, exactly like real rAF semantics.
    runFrame: (ts) => {
      const fns = rafFns;
      rafFns = [];
      for (const fn of fns) fn(ts);
      },
    // Fire a synthetic touchstart/touchend on a button (touch.js registers
    // its listeners there; real touch semantics stay a human check).
    touchStart: (el) => {
      for (const fn of (el.listeners.touchstart || [])) {
        fn({ preventDefault: () => {} });
        }
      },
    touchEnd: (el) => {
      for (const fn of (el.listeners.touchend || [])) {
        fn({ preventDefault: () => {} });
        }
      },
    };
  }

// Browser-only modules that the UI layer guards on but this smoke test
// replaces with no-op stubs (their real behavior is Phase 6/10's concern).
global.Tetris = global.Tetris || {};
global.Tetris.Input = { setEnabled: () => {}, bind: () => {} };
global.Tetris.Render = {
  frame: () => {},
  CELL: 30,
  COLORS: { I: '#33e0ff', O: '#ffd93d', T: '#b57cff', S: '#3ddc84',
            Z: '#ff5a5a', J: '#4d7bff', L: '#ff9f43' },
  };
// game.js exports via module.exports in Node and only attaches
// Tetris.Game in the browser — bridge it so the UI layer can start games.
global.Tetris.Game = Game;

const dom = installDomStubs();
// The ui.js/main.js UMD wrappers attach to `window` when one exists, so the
// stub window must share the same Tetris namespace the logic modules
// (required at the top of this file, before `window` existed) registered on
// globalThis — otherwise the UI would see a namespace with no Input/Game.
global.window.Tetris = global.Tetris;
require(path.join(__dirname, '..', 'js', 'ui.js'));
// Phase 14: touch.js before main.js so boot()'s Touch.init() finds it.
require(path.join(__dirname, '..', 'js', 'touch.js'));
// ui.js attaches window.Tetris.UI rather than module.exports, so grab the
// object off the namespace.
const UI = global.Tetris.UI;
// main.js runs boot() at require time (readyState stub is 'complete'),
// which is the point: it must survive UI.init() + schedule the rAF loop.
require(path.join(__dirname, '..', 'js', 'main.js'));

test('boot() wires every string-bound button (Phase 13 regression guard)', () => {
  for (const id of ['btn-play', 'btn-settings-home', 'btn-back-home', 'btn-resume',
    'btn-restart-pause', 'btn-settings-pause', 'btn-quit-pause',
    'btn-settings-back', 'btn-retry', 'btn-menu',
    'toggle-music', 'toggle-sfx']) {
    assert((dom.byId[id].listeners.click || []).length >= 1,
      `${id} should have a click listener bound`);
    }
  for (const b of dom.byId['difficulty-seg'].children) {
    assert((b.listeners.click || []).length >= 1, 'difficulty buttons should be bound');
    }
  for (const c of dom.modeCards) {
    assert((c.listeners.click || []).length >= 1, 'mode cards should be bound');
    }
  });

test('clicking Play navigates to mode select', () => {
  dom.click(dom.byId['btn-play']);
  assertEqual(UI._page, 'mode-select', 'Play should land on the mode-select screen');
  });

test('clicking a mode card starts a live game', () => {
  dom.click(dom.byId['btn-play']); // back to mode select
  dom.click(dom.modeCards[0]); // classic
  assertEqual(UI._page, 'game', 'a mode card should start the game screen');
  assert(UI.game && UI.game.state === 'playing', 'a game object should be live');
  assertEqual(UI.game.config.mode, 'classic', 'the clicked mode should be used');
  });

test('one rAF frame runs cleanly with a live game', () => {
  const g = UI.game;
  assert(g !== null, 'a game should be live from the previous test');
  // no uncaught throw in the frame loop for the first ~2 seconds of play
  dom.runFrame(0);
  dom.runFrame(500);
  dom.runFrame(1600);
  });

// ---------------------------------------------------------------- Phase 14
// Touch layer (js/touch.js) — the dispatch/repeat logic runs in Node with
// the same DOM stubs. Real touch-event semantics stay a human check.

const Touch = global.Tetris.Touch;
const tbtn = (action) => dom.byId['touch-controls'].children
  .find((b) => b.dataset.action === action);

test('touch: buttons are bound and enabled once a game is live', () => {
  for (const a of ['left', 'right', 'soft', 'cw', 'ccw', 'hard', 'hold']) {
    assert((tbtn(a).listeners.touchstart || []).length >= 1,
      `${a} touch button should have a touchstart listener`);
    assert((tbtn(a).listeners.touchend || []).length >= 1,
      `${a} touch button should have a touchend listener`);
    }
  assert(Touch._enabled === true, 'touch layer should be enabled in-game');
  assert(Touch._g === UI.game, 'touch layer should point at the live game');
  });

test('touch: a rotate press rotates the piece (same action surface)', () => {
  const g = UI.game;
  if (g.current.type !== 'O') {
    const before = g.current.rotation;
    dom.touchStart(tbtn('cw'));
    assertEqual(g.current.rotation, (before + 1) % 4, 'cw press should rotate');
    }
  dom.touchEnd(tbtn('cw'));
  });

test('touch: soft drop repeats on the DAS/ARR schedule and stops on release', () => {
  const g = UI.game;
  const scoreBefore = g.score;
  dom.touchStart(tbtn('soft')); // immediate first fire
  const afterFirst = g.score;
  assert(afterFirst > scoreBefore, 'soft-drop press should score immediately');
  // Before DAS elapses: no repeat yet.
  Touch._loop(performance.now() + Touch.DAS - 1);
  assertEqual(g.score, afterFirst, 'no repeat before DAS elapses');
  // Past DAS: the repeat fires.
  Touch._loop(performance.now() + Touch.DAS + 1);
  assert(g.score > afterFirst, 'a repeat should fire after DAS');
  // Release: no further repeats.
  dom.touchEnd(tbtn('soft'));
  const afterRelease = g.score;
  Touch._loop(performance.now() + Touch.DAS * 3);
  assertEqual(g.score, afterRelease, 'no repeat after release');
  });

test('touch: presses are no-ops when the layer is disabled', () => {
  const g = UI.game;
  Touch.setEnabled(false);
  const rotation = g.current.rotation;
  dom.touchStart(tbtn('cw'));
  dom.touchEnd(tbtn('cw'));
  assertEqual(g.current.rotation, rotation, 'a disabled press must do nothing');
  UI._syncInput(); // restore enabled state for any later tests
  });

// ---------------------------------------------------------------- Phase 15
// Particle pool (js/particles.js) — pool bounds + expiry are DOM-free math,
// so they smoke-test in Node with a stub drawing context. The *look* of the
// particles stays a human visual check (PROGRESS.md).

require(path.join(__dirname, '..', 'js', 'particles.js'));
const Particles = global.Tetris.Particles;
global.Tetris.Piece = Piece; // particles.js reads Piece for the drop puff

test('particles: the pool is bounded at MAX, oldest culled first', () => {
  const now = 1000;
  const last = Board.HEIGHT + Board.BUFFER - 1;
  const fullRow = new Array(Board.WIDTH).fill('I');
  // ~2 particles × 10 cells × 1 row = ~20 per spawn; 20 spawns ≈ 400 > MAX.
  for (let i = 0; i < 20; i++) {
    Particles.spawnLineClear([last], [fullRow], false, now + i);
    }
  const n = Particles.count(now + 100);
  assert(n <= Particles.MAX, `pool must stay bounded (${n} > MAX ${Particles.MAX})`);
  assertEqual(n, Particles.MAX, 'the ring should have culled the oldest to stay at MAX');
  });

// A no-op 2D context with every method draw() may reach for (Phase 24 uses
// paths for sparks/rings and transforms for spinning chunks).
function stubCtx() {
  const noop = () => {};
  return { fillRect: noop, strokeRect: noop, beginPath: noop, moveTo: noop,
           lineTo: noop, arc: noop, stroke: noop, save: noop, restore: noop,
           translate: noop, rotate: noop, drawImage: noop,
           globalAlpha: 1, globalCompositeOperation: 'source-over' };
}

test('particles: they expire after their life and draw() reclaims the slots', () => {
  const last = Board.HEIGHT + Board.BUFFER - 1;
  Particles.spawnLineClear([last], [new Array(Board.WIDTH).fill('T')], true, 1000);
  assert(Particles.count(1100) > 0, 'particles should be alive right after spawning');
  assertEqual(Particles.count(1000 + 2100), 0,
    'all particles must expire within their max life (~1.5s)');
  const ctx = stubCtx();
  Particles.draw(ctx, 1000 + 2100); // must not throw; reclaims slots
  assertEqual(Particles.count(1000 + 2100), 0, 'nothing resurrects after expiry');
  assertEqual(Particles.waveCount(1000 + 2100), 0, 'shockwaves expire too');
  assertEqual(ctx.globalCompositeOperation, 'source-over',
    'draw() must restore the composite op it found (it draws additively)');
  assertEqual(ctx.globalAlpha, 1, 'draw() must restore globalAlpha');
  });

// ---------------------------------------------------------------- Phase 24
// Exaggerated particle FX: the spawners must actually produce a lot more
// than the Phase 15 counts (that was the owner's complaint — "hardly
// noticeable"), the one-shot shockwave list must stay bounded, and reduced
// motion must scale everything back down and drop the shockwaves.
// `clock()` only moves forward: a draw() at a later time flushes everything
// (including delayed-birth confetti), which a time-travelling flush wouldn't.

let pClock = 1e9;
function clock() { return (pClock += 1e7); }

test('particles: a single line clear is a real explosion, a Tetris is bigger', () => {
  Particles._reduced = false;
  const last = Board.HEIGHT + Board.BUFFER - 1;
  const row = new Array(Board.WIDTH).fill('I');
  Particles.draw(stubCtx(), clock()); // flush everything from earlier tests
  let now = clock();
  Particles.spawnLineClear([last], [row], false, now);
  const single = Particles.count(now + 1);
  assert(single >= 80, `single clear should spawn >= 80 particles (got ${single})`);
  assertEqual(Particles.waveCount(now + 1), 1, 'one row sweep per cleared row');
  Particles.draw(stubCtx(), clock());
  now = clock();
  const rows = [last - 3, last - 2, last - 1, last];
  Particles.spawnLineClear(rows, rows.map(() => row), true, now);
  const tetris = Particles.count(now + 1);
  assert(tetris > single * 3, `a Tetris should dwarf a single (${tetris} vs ${single})`);
  assert(Particles.waveCount(now + 200) >= 5, 'a Tetris adds rings on top of the 4 sweeps');
  Particles.draw(stubCtx(), now + 100); // must not throw with rings + sparks live
  });

test('particles: hard drop, lock and level-up all spawn and stay bounded', () => {
  Particles._reduced = false;
  Particles.draw(stubCtx(), clock());
  let now = clock();
  const landing = { type: 'T', rotation: 0, x: 3, y: Board.BUFFER + Board.HEIGHT - 2 };
  Particles.spawnHardDrop(landing, now);
  const drop = Particles.count(now + 1);
  assert(drop >= 40, `hard drop should spawn >= 40 particles (got ${drop})`);
  assert(Particles.waveCount(now + 1) >= 2, 'hard drop fires a sweep and a ring');
  Particles.draw(stubCtx(), clock());
  now = clock();
  const cells = Piece.getCells(landing.type, landing.rotation, landing.x, landing.y);
  Particles.spawnLock(cells, 'T', now);
  assert(Particles.count(now + 1) >= 16, 'lock sparkle: >= 4 per cell');
  Particles.draw(stubCtx(), clock());
  now = clock();
  Particles.spawnLevelUp(150, 300, now);
  assert(Particles.count(now + 300) >= 100, 'level-up: burst + confetti');
  assertEqual(Particles.waveCount(now + 300), 3, 'level-up: three staggered rings');
  // Waves are bounded independently of the particle ring buffer.
  for (let i = 0; i < 40; i++) Particles.spawnLevelUp(150, 300, now + i);
  assert(Particles.waveCount(now + 300) <= 24, 'shockwave list is capped at 24');
  assert(Particles.count(now + 300) <= Particles.MAX, 'pool still bounded');
  });

test('particles: reduced motion scales spawns down and drops the shockwaves', () => {
  Particles.draw(stubCtx(), clock());
  const last = Board.HEIGHT + Board.BUFFER - 1;
  const row = new Array(Board.WIDTH).fill('S');
  Particles._reduced = false;
  let now = clock();
  Particles.spawnLineClear([last], [row], true, now);
  const full = Particles.count(now + 1);
  Particles.draw(stubCtx(), clock());
  Particles._reduced = true;
  now = clock();
  Particles.spawnLineClear([last], [row], true, now);
  const reduced = Particles.count(now + 1);
  assert(reduced > 0 && reduced < full / 2,
    `reduced motion should spawn far fewer (${reduced} vs ${full})`);
  assertEqual(Particles.waveCount(now + 1), 0, 'no shockwaves under reduced motion');
  Particles._reduced = null;
  });

// ---------------------------------------------------------------- Phase 16
// 16c: a keyboard pause that lands BETWEEN frames (Esc/P sets state to
// 'paused' between two rAF callbacks) must still open the Pause overlay.
// The old code read g.state fresh at the top of every frame, so both sides
// of the transition looked like 'paused' and the openPause branch never
// fired — the user saw a frozen board with no menu.

test('16c: a between-frames keyboard pause opens the Pause overlay', () => {
  // A fresh game so the Phase 14 touch tests' held buttons can't interfere.
  dom.click(dom.byId['btn-play']);
  dom.click(dom.modeCards[0]);
  const g = UI.game;
  const pauseEl = dom.byId['screen-pause'];

  dom.runFrame(3000); // one full frame with the game playing
  assert(pauseEl.classList.contains('hidden'),
    'the overlay starts hidden while playing');

  g.pause(); // Esc/P lands between frames — no frame runs in between
  assertEqual(g.state, 'paused', 'the game is paused between frames');
  assert(pauseEl.classList.contains('hidden'),
    'no frame has run yet, so the overlay is still hidden');
  dom.runFrame(3100); // the NEXT frame must notice playing→paused and open it
  assert(!pauseEl.classList.contains('hidden'),
    'the frame after a between-frames pause must open the Pause overlay');

  // And the reverse transition still closes it (Esc/P again → resume).
  g.resume();
  dom.runFrame(3200);
  assert(pauseEl.classList.contains('hidden'),
    'the frame after a between-frames resume must close the overlay');
  assertEqual(g.state, 'playing', 'the game is playing again after resume');
  });

test('a failed boot() renders a visible on-page error (hardening check)', () => {
  const realInit = UI.init;
  const realErr = console.error;
  console.error = () => {};
  UI.init = () => { throw new Error('synthetic init failure'); };
  try {
    delete require.cache[path.join(__dirname, '..', 'js', 'main.js')];
    require(path.join(__dirname, '..', 'js', 'main.js'));
    } finally {
    UI.init = realInit;
    console.error = realErr;
    }
  assert(dom.body.innerHTML.indexOf('Something went wrong') !== -1,
    'a failed init must paint a visible error state, not a dead page');
  assert(dom.body.innerHTML.indexOf('synthetic init failure') !== -1,
    'the error state should include the failure message');
  });

// ---------------------------------------------------------------- Phase 18
// index.html structure guards. The touch bar was twice shipped as a sibling
// of .game-layout (a stray </div>), which the DOM-stub tests above cannot
// see because they never parse the real markup. A depth walk over the real
// file catches it.

test('index.html: #touch-controls is nested inside .game-layout', () => {
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const start = html.indexOf('class="game-layout"');
  const touch = html.indexOf('id="touch-controls"');
  assert(start !== -1 && touch !== -1, 'expected both .game-layout and #touch-controls in index.html');
  assert(touch > start, '#touch-controls should come after .game-layout opens');
  // Walk div tags between the two; depth must still be > 0 when we reach the touch bar.
  const between = html.slice(start, touch);
  const opens = (between.match(/<div\b/g) || []).length;   // includes the .game-layout div itself
  const closes = (between.match(/<\/div>/g) || []).length;
  assert(opens - closes >= 1,
    `#touch-controls is outside .game-layout (div depth ${opens - closes} at the touch bar) — a stray </div> closed the grid early`);
});

test('index.html: every touch action the CSS/touch layer expects is present exactly once', () => {
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const a of ['left', 'right', 'soft', 'cw', 'ccw', 'hard', 'hold']) {
    const n = (html.match(new RegExp('data-action="' + a + '"', 'g')) || []).length;
    assertEqual(n, 1, `expected exactly one data-action="${a}" button, found ${n}`);
  }
  assert(html.indexOf('class="touch-cluster touch-left"') !== -1 && html.indexOf('class="touch-cluster touch-right"') !== -1,
    'touch buttons must live in the two thumb clusters the landscape CSS pins to the corners');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
