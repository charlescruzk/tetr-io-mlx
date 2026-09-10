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

     // create() -> new empty board: an array of (HEIGHT + BUFFER) rows, each
     // an array of WIDTH cells, every cell initialized to null (empty). A
     // non-null cell value is a piece-type string, used for color.
    create() {
      const rows = [];
      for (let y = 0; y < Board.HEIGHT + Board.BUFFER; y++) {
        rows.push(new Array(Board.WIDTH).fill(null));
       }
      return rows;
     },

     // collides(board, cells, offsetX, offsetY)
     //   cells: array of [x, y] pairs relative to the piece's own origin,
     //   as returned by Piece.getCells. offsetX/offsetY place the piece on
     //   the board. Returns true if any cell would be off the board
     //    (left/right/bottom) or overlap a locked cell. Cells above the top
     //   of the board (negative row, within BUFFER) do NOT collide.
    collides(board, cells, offsetX, offsetY) {
      const totalRows = Board.HEIGHT + Board.BUFFER;
      for (let i = 0; i < cells.length; i++) {
        const x = cells[i][0] + offsetX;
        const y = cells[i][1] + offsetY;
         // left / right walls — checked at every height, a wall is a wall
        if (x < 0 || x >= Board.WIDTH) return true;
         // below the floor
        if (y >= totalRows) return true;
         // above the visible playfield (within the spawn buffer): never collides
        if (y < 0) continue;
         // overlap a locked cell
        if (board[y][x] !== null) return true;
       }
      return false;
     },

     // lock(board, cells, offsetX, offsetY, pieceType)
     //   Mutates board in place, writing pieceType into every cell the piece
     //   occupies at its final position. Cells that fall in the buffer above
     //   row 0 are skipped (a top-out, handled by the game loop before a lock
     //   is ever attempted).
    lock(board, cells, offsetX, offsetY, pieceType) {
      for (let i = 0; i < cells.length; i++) {
        const x = cells[i][0] + offsetX;
        const y = cells[i][1] + offsetY;
        if (y < 0) continue;
        board[y][x] = pieceType;
       }
     },

     // findFullRows(board) -> array of row indices that are completely filled
     // (no null cells), returned top to bottom.
    findFullRows(board) {
      const full = [];
      for (let y = 0; y < board.length; y++) {
        const row = board[y];
        let isFull = true;
        for (let x = 0; x < Board.WIDTH; x++) {
          if (row[x] === null) {
            isFull = false;
            break;
           }
         }
        if (isFull) full.push(y);
       }
      return full;
     },

     // clearRows(board, rowIndices)
     //   Mutates board in place: removes those rows, shifts every row above
     //   each cleared row down by one, and inserts new empty rows at the top
     //   so the board stays (HEIGHT + BUFFER) rows tall.
    clearRows(board, rowIndices) {
      const clearSet = new Set(rowIndices);
      const total = board.length;
      const kept = [];
      for (let y = 0; y < total; y++) {
        if (!clearSet.has(y)) kept.push(board[y]);
       }
      const removed = total - kept.length;
       // Fresh empty rows on top, surviving rows below, in original order.
      for (let y = 0; y < total; y++) {
        board[y] = y < removed
           ? new Array(Board.WIDTH).fill(null)
           : kept[y - removed];
       }
     },

     // reset(board) — mutates board back to all-empty in place.
    reset(board) {
      for (let y = 0; y < board.length; y++) {
        const row = board[y];
        for (let x = 0; x < row.length; x++) row[x] = null;
       }
     },
   };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Board;
   } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.Board = Board;
   }
})(typeof window !== 'undefined' ? window : globalThis);
