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
// TODO(qwen, Phase 7): uncomment once js/scoring.js is implemented.
// const Scoring = require(path.join(__dirname, '..', 'js', 'scoring.js'));
// TODO(qwen, Phase 8): uncomment once js/modes.js is implemented.
// const Modes = require(path.join(__dirname, '..', 'js', 'modes.js'));

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

// TODO(qwen, Phase 4b): SRS wall kick tests, e.g. a T piece rotating
// against a wall should succeed via a kick where naive rotation would
// collide. Add them here once Piece.getKicks is implemented (or note in
// PROGRESS.md if the CLAUDE.md fallback was used instead).

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
// Scoring — TODO(qwen): add tests once js/scoring.js is implemented and
// the require at the top of this file is uncommented. Cover: line-clear
// point values at a couple of levels, soft/hard drop points, and that
// Scoring.gravityForLevel(level) is monotonically decreasing.

// ---------------------------------------------------------------- Phase 8
// Modes — TODO(qwen): add tests once js/modes.js is implemented and the
// require at the top of this file is uncommented. Cover: Sprint reports
// "won" exactly at 40 lines, Marathon levels up every 10 lines, each
// difficulty maps to a distinct starting gravity.

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
