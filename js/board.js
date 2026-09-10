// js/board.js — pure game-logic, no DOM. See PLAN.md Phase 1.
//
// Dual-export: loadable via <script> in the browser (attaches to
// window.Tetris.Board) and via require() in Node for tests/run.js. Keep
// this pattern — don't switch to ES modules or add a build step.
(function (root) {
  'use strict';

  const Board = {
    WIDTH: 10,
    HEIGHT: 20,
    BUFFER: 4, // hidden rows above row 0, for piece spawn

    // TODO(qwen, Phase 1): implement each of these.
    //
    // create()
    //   -> new empty board: an array of (HEIGHT + BUFFER) rows, each an
    //      array of WIDTH cells, every cell initialized to null (empty).
    //      Non-null cell value = a piece-type string (used for color).
    create() {
      throw new Error('Board.create not implemented — see PLAN.md Phase 1');
    },

    // collides(board, cells, offsetX, offsetY)
    //   cells: array of [x, y] pairs relative to the piece's own origin,
    //   as returned by Piece.getCells. offsetX/offsetY place the piece on
    //   the board. Returns true if any cell would be off the board
    //   (left/right/bottom) or overlap a locked cell. Cells above the top
    //   of the board (negative row, within BUFFER) do NOT collide.
    collides(board, cells, offsetX, offsetY) {
      throw new Error('Board.collides not implemented — see PLAN.md Phase 1');
    },

    // lock(board, cells, offsetX, offsetY, pieceType)
    //   Mutates board in place, writing pieceType into every cell the
    //   piece occupies at its final position.
    lock(board, cells, offsetX, offsetY, pieceType) {
      throw new Error('Board.lock not implemented — see PLAN.md Phase 1');
    },

    // findFullRows(board) -> array of row indices that are completely
    // filled (no null cells), top to bottom or bottom to top, your choice
    // as long as clearRows accepts the same order it returns.
    findFullRows(board) {
      throw new Error('Board.findFullRows not implemented — see PLAN.md Phase 1');
    },

    // clearRows(board, rowIndices)
    //   Mutates board in place: removes those rows, shifts every row above
    //   each cleared row down by one, and inserts new empty rows at the
    //   top so the board stays (HEIGHT + BUFFER) rows tall.
    clearRows(board, rowIndices) {
      throw new Error('Board.clearRows not implemented — see PLAN.md Phase 1');
    },

    // reset(board) — mutates board back to all-empty in place.
    reset(board) {
      throw new Error('Board.reset not implemented — see PLAN.md Phase 1');
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Board;
  } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.Board = Board;
  }
})(typeof window !== 'undefined' ? window : globalThis);
