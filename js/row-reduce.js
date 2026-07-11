/* Simplex Tutor — row-reduce.js
 * Pure elementary-row-operation linear algebra. Shared by BOTH the simplex
 * engine (computeNextBinv) and the row-reduction calculator UI, so the helper
 * tool and the grader can never disagree.
 */
(function () {
  'use strict';

  function cloneMatrix(M) {
    return M.map(function (row) { return row.slice(); });
  }

  /**
   * op: {type:'scale', row, k} | {type:'addMultiple', target, source, k} | {type:'swap', a, b}
   * Rows are 0-based. Returns a new matrix (input untouched).
   */
  function applyRowOp(M, op) {
    var R = cloneMatrix(M);
    if (op.type === 'scale') {
      R[op.row] = R[op.row].map(function (v) { return v * op.k; });
    } else if (op.type === 'addMultiple') {
      R[op.target] = R[op.target].map(function (v, j) { return v + op.k * R[op.source][j]; });
    } else if (op.type === 'swap') {
      var t = R[op.a];
      R[op.a] = R[op.b];
      R[op.b] = t;
    } else {
      throw new Error('unknown row op: ' + op.type);
    }
    return R;
  }

  /** Gauss-Jordan pivot: drive column pivotCol to the unit vector e_pivotRow. */
  function pivotEliminate(M, pivotRow, pivotCol) {
    var R = cloneMatrix(M);
    var p = R[pivotRow][pivotCol];
    if (Math.abs(p) < 1e-12) throw new Error('pivot value is zero');
    R[pivotRow] = R[pivotRow].map(function (v) { return v / p; });
    for (var i = 0; i < R.length; i++) {
      if (i === pivotRow) continue;
      var f = R[i][pivotCol];
      if (f !== 0) {
        R[i] = R[i].map(function (v, j) { return v - f * R[pivotRow][j]; });
      }
    }
    return R;
  }

  var STEP_EPS = 1e-10;

  /**
   * The next SINGLE elementary op that drives column `col` toward the unit
   * vector with 1 at `row` (scale first, then one elimination at a time).
   * Returns null when the column is done — used for step-by-step auto-solve.
   */
  function nextPivotOp(M, row, col) {
    if (Math.abs(M[row][col]) < STEP_EPS) return null;
    if (Math.abs(M[row][col] - 1) > STEP_EPS) {
      return { type: 'scale', row: row, k: 1 / M[row][col] };
    }
    for (var i = 0; i < M.length; i++) {
      if (i !== row && Math.abs(M[i][col]) > STEP_EPS) {
        return { type: 'addMultiple', target: i, source: row, k: -M[i][col] };
      }
    }
    return null;
  }

  /**
   * The next single elementary op toward RREF of the first `cols` columns
   * (all columns when omitted). Stateless — recomputed from the matrix each
   * call. Used for inverse-finding on [B|I]: limit `cols` to B's width.
   */
  function nextRrefOp(M, cols) {
    var rows = M.length;
    var limit = cols == null ? M[0].length : cols;
    var r = 0;
    for (var lead = 0; lead < limit && r < rows; lead++) {
      var i = r;
      while (i < rows && Math.abs(M[i][lead]) < STEP_EPS) i++;
      if (i === rows) continue;               // no pivot in this column
      if (i !== r) return { type: 'swap', a: r, b: i };
      var op = nextPivotOp(M, r, lead);
      if (op) return op;
      r++;                                     // column already in unit form
    }
    return null;
  }

  /** Are the first n columns exactly the identity (within tolerance)? */
  function isIdentityLeft(M, n) {
    if (M.length !== n) return false;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if (Math.abs(M[i][j] - (i === j ? 1 : 0)) > 1e-9) return false;
      }
    }
    return true;
  }

  /** Full reduced row echelon form (for the standalone calculator's auto-solve). */
  function toReducedRowEchelon(M) {
    var R = cloneMatrix(M);
    var rows = R.length;
    var cols = R[0].length;
    var lead = 0;
    for (var r = 0; r < rows && lead < cols; r++, lead++) {
      var i = r;
      while (i < rows && Math.abs(R[i][lead]) < 1e-12) i++;
      if (i === rows) {
        r--; // stay on this row, try next column
        continue;
      }
      if (i !== r) {
        var t = R[i];
        R[i] = R[r];
        R[r] = t;
      }
      R = pivotEliminate(R, r, lead);
    }
    return R;
  }

  var api = {
    cloneMatrix: cloneMatrix,
    applyRowOp: applyRowOp,
    pivotEliminate: pivotEliminate,
    nextPivotOp: nextPivotOp,
    nextRrefOp: nextRrefOp,
    isIdentityLeft: isIdentityLeft,
    toReducedRowEchelon: toReducedRowEchelon,
  };

  if (typeof window !== 'undefined') {
    window.Simplex = window.Simplex || {};
    window.Simplex.rowReduce = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
