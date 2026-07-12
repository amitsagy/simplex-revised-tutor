/* Simplex Tutor — tableau.js
 * Full-tableau engine for the DUAL SIMPLEX method (targil 10) and the
 * sensitivity-analysis helpers. Pure math, no DOM. Row operations reuse
 * row-reduce.js:pivotEliminate so the grader and any helper agree exactly.
 *
 * Tableau shape:
 *   { n, m, ncols, vars:[ids], names:[strings],
 *     zRow:[ncols], zRHS, rows:[m][ncols], rhs:[m], basis:[m ids] }
 * Variable ids: 1..n are the original (dual) variables, n+1..n+m are surplus.
 *
 * Dual-simplex convention (matches the handout): the Z row holds -c for a Min
 * problem and stays ≤ 0 (dual-feasible) throughout; the algorithm drives the
 * RHS to ≥ 0 (primal-feasible). It always picks the LEAVING variable first
 * (most-negative RHS), then the entering one by the ratio test over columns.
 */
(function () {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var RowReduce = isNode ? require('./row-reduce.js') : window.Simplex.rowReduce;

  var EPS = 1e-9;

  /**
   * Canonical initial tableau for a Min problem with all-≥ constraints, x ≥ 0:
   *   Min c·x  s.t.  A x ≥ b,  x ≥ 0.
   * prob: { n, m, c:[n], A:[m][n], b:[m] }.
   * Adds a surplus per row and multiplies each constraint by -1 so the surplus
   * basis has +1 coefficients (RHS becomes -b: primal-infeasible on purpose).
   */
  function initialDualTableau(prob) {
    var n = prob.n, m = prob.m;
    var ncols = n + m;
    var vars = [], names = [];
    for (var v = 1; v <= n; v++) { vars.push(v); names.push('y' + v); }
    for (var e = 1; e <= m; e++) { vars.push(n + e); names.push('e' + e); }
    var rows = [], rhs = [], basis = [];
    for (var i = 0; i < m; i++) {
      var row = new Array(ncols).fill(0);
      for (var j = 0; j < n; j++) row[j] = prob.A[i][j];
      row[n + i] = -1;                        // surplus
      rows.push(row.map(function (x) { return -x; }));  // ×(-1) -> canonical
      rhs.push(-prob.b[i]);
      basis.push(n + 1 + i);                  // surplus var id
    }
    var zRow = prob.c.map(function (c) { return -c; }).concat(new Array(m).fill(0));
    return { n: n, m: m, ncols: ncols, vars: vars, names: names,
      zRow: zRow, zRHS: 0, rows: rows, rhs: rhs, basis: basis };
  }

  function isFeasible(t) {
    return t.rhs.every(function (r) { return r >= -EPS; });
  }

  /** Leaving variable: the basic var with the most-negative RHS (ties -> first
   *  row). Returns { row, varId } or null if already feasible. */
  function dsLeaving(t) {
    var minVal = Infinity, row = -1;
    for (var i = 0; i < t.rhs.length; i++) {
      if (t.rhs[i] < minVal - EPS) { minVal = t.rhs[i]; row = i; }
    }
    if (row < 0 || minVal >= -EPS) return null;
    return { row: row, varId: t.basis[row] };
  }

  /** Ratio |zRow_k / a_row,k| for columns with a_row,k < 0; null elsewhere. */
  function dsRatios(t, row) {
    return t.zRow.map(function (z, k) {
      var a = t.rows[row][k];
      return a < -EPS ? Math.abs(z / a) : null;
    });
  }

  /** Entering variable: smallest defined ratio (ties -> smallest column index).
   *  Returns { col, varId } or null (no negative entry -> primal infeasible). */
  function dsEntering(t, ratios) {
    var best = Infinity, col = -1;
    for (var k = 0; k < ratios.length; k++) {
      if (ratios[k] !== null && ratios[k] < best - EPS) { best = ratios[k]; col = k; }
    }
    if (col < 0) return null;
    return { col: col, varId: t.vars[col] };
  }

  /** Pivot on (row, col): full Gauss-Jordan on [Z; rows | rhs]. Immutable. */
  function dsPivot(t, row, col) {
    var full = [t.zRow.concat([t.zRHS])];
    for (var i = 0; i < t.m; i++) full.push(t.rows[i].concat([t.rhs[i]]));
    var red = RowReduce.pivotEliminate(full, row + 1, col);
    var nt = {
      n: t.n, m: t.m, ncols: t.ncols, vars: t.vars.slice(), names: t.names.slice(),
      zRow: red[0].slice(0, t.ncols), zRHS: red[0][t.ncols],
      rows: [], rhs: [], basis: t.basis.slice(),
    };
    for (var r = 1; r <= t.m; r++) {
      nt.rows.push(red[r].slice(0, t.ncols));
      nt.rhs.push(red[r][t.ncols]);
    }
    nt.basis[row] = t.vars[col];
    return nt;
  }

  /** { assignments:{id:value}, y:[originals 1..n], Z } for a feasible tableau. */
  function solution(t) {
    var assign = {};
    t.vars.forEach(function (id) { assign[id] = 0; });
    t.basis.forEach(function (id, i) { assign[id] = t.rhs[i]; });
    var y = [];
    for (var v = 1; v <= t.n; v++) y.push(assign[v]);
    return { assignments: assign, y: y, Z: t.zRHS };
  }

  function pushVals(acc) {
    for (var i = 1; i < arguments.length; i++) {
      var v = arguments[i];
      if (Array.isArray(v[0])) v.forEach(function (r) { acc.push.apply(acc, r); });
      else acc.push.apply(acc, v);
    }
  }

  /** Run the whole dual simplex. -> { status, iterations, tableau, allValues }. */
  function solveDual(t0, maxIters) {
    if (maxIters == null) maxIters = 12;
    var t = t0, vals = [];
    for (var k = 0; k <= maxIters; k++) {
      pushVals(vals, t.zRow, [t.zRHS], t.rhs);
      t.rows.forEach(function (r) { pushVals(vals, r); });
      var lv = dsLeaving(t);
      if (!lv) return { status: 'optimal', iterations: k, tableau: t, allValues: vals };
      var ratios = dsRatios(t, lv.row);
      var en = dsEntering(t, ratios);
      if (!en) return { status: 'infeasible', iterations: k, tableau: t, allValues: vals };
      t = dsPivot(t, lv.row, en.col);
    }
    return { status: 'toolong', iterations: maxIters, tableau: t, allValues: vals };
  }

  /* ---- sensitivity-analysis helpers (targil 10; used by phase 3) ---- */

  var Engine = isNode ? require('./engine.js') : null;
  function engine() { return Engine || window.Simplex.engine; }

  /** New basic solution after an RHS change: xB = B⁻¹ · bNew. */
  function newXB(Binv, bNew) { return engine().matVec(Binv, bNew); }

  /** Reduced cost of a brand-new variable: r_w = c_w − cB·B⁻¹·a_w. */
  function rForNewVar(cW, cB, Binv, aW) {
    var y = engine().vecMat(cB, Binv);          // cB · B⁻¹
    return cW - engine().dot(y, aW);
  }

  /** The new variable's column in the current tableau: B⁻¹ · a_w. */
  function newColumn(Binv, aW) { return engine().matVec(Binv, aW); }

  var api = {
    EPS: EPS,
    initialDualTableau: initialDualTableau,
    isFeasible: isFeasible,
    dsLeaving: dsLeaving,
    dsRatios: dsRatios,
    dsEntering: dsEntering,
    dsPivot: dsPivot,
    solution: solution,
    solveDual: solveDual,
    newXB: newXB,
    rForNewVar: rForNewVar,
    newColumn: newColumn,
  };

  if (typeof window !== 'undefined') {
    window.Simplex = window.Simplex || {};
    window.Simplex.tableau = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
