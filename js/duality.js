/* Simplex Tutor — duality.js
 * Primal↔Dual correspondence engine (targil 9). Pure, no DOM.
 *
 * General problem shape (both primal and dual use it):
 *   { dir: 'max' | 'min',
 *     c: [n],                       // objective coefficients
 *     A: [m][n],                    // constraint matrix
 *     b: [m],                       // right-hand side
 *     ctypes: ['le'|'eq'|'ge'](m),  // per constraint: ≤ / = / ≥
 *     vtypes: ['ge0'|'free'|'le0'](n) } // per variable: ≥0 / free / ≤0
 *
 * The dual has one variable per primal constraint and one constraint per
 * primal variable (targil 9, table on p.3). The mapping is symmetric, so
 * buildDual(buildDual(p)) reproduces p.
 */
(function () {
  'use strict';

  function transpose(A) {
    var rows = A.length, cols = A[0].length, out = [];
    for (var j = 0; j < cols; j++) {
      var r = [];
      for (var i = 0; i < rows; i++) r.push(A[i][j]);
      out.push(r);
    }
    return out;
  }

  /* constraint-type -> dual variable sign, keyed by the objective direction */
  var CTYPE_TO_VTYPE = {
    max: { le: 'ge0', eq: 'free', ge: 'le0' },
    min: { ge: 'ge0', eq: 'free', le: 'le0' },
  };
  /* variable sign -> dual constraint type, keyed by the objective direction */
  var VTYPE_TO_CTYPE = {
    max: { ge0: 'ge', free: 'eq', le0: 'le' },
    min: { ge0: 'le', free: 'eq', le0: 'ge' },
  };

  /** The dual problem, in the same general shape. */
  function buildDual(p) {
    var dir = p.dir;
    var ct2vt = CTYPE_TO_VTYPE[dir];
    var vt2ct = VTYPE_TO_CTYPE[dir];
    return {
      dir: dir === 'max' ? 'min' : 'max',
      c: p.b.slice(),                                          // dual objective = primal RHS
      A: transpose(p.A),                                       // n × m
      b: p.c.slice(),                                          // dual RHS = primal objective
      ctypes: p.vtypes.map(function (t) { return vt2ct[t]; }), // one per dual constraint (primal var)
      vtypes: p.ctypes.map(function (t) { return ct2vt[t]; }), // one per dual variable (primal constraint)
    };
  }

  /** { vars, constraints } of the dual, derived from a primal p. */
  function dualDims(p) {
    return { vars: p.A.length, constraints: p.c.length };
  }

  var api = {
    transpose: transpose,
    buildDual: buildDual,
    dualDims: dualDims,
    CTYPE_TO_VTYPE: CTYPE_TO_VTYPE,
    VTYPE_TO_CTYPE: VTYPE_TO_CTYPE,
  };

  if (typeof window !== 'undefined') {
    window.Simplex = window.Simplex || {};
    window.Simplex.duality = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
