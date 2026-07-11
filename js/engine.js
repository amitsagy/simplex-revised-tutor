/* Simplex Tutor — engine.js
 * Pure Revised-Simplex math (no DOM). For every step of the algorithm this
 * module computes the authoritative correct value, so the session/UI can
 * grade any student input against it.
 *
 * Conventions (matching the course material):
 * - Variables are 1-based: 1..n originals, n+1..n+m slacks.
 * - B and N are ORDERED index lists. Order matters: it fixes which unit
 *   vector the entering column is driven to, and the ratio-test row.
 * - b_initial (problem.b) never changes across iterations.
 */
(function () {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var RowReduce = isNode ? require('./row-reduce.js') : window.Simplex.rowReduce;

  var ENGINE_EPS = 1e-9;

  /** AFull = [A | I_m] (m x (n+m)), cFull = [c..., 0 x m]. */
  function buildFullProblem(problem) {
    var m = problem.m;
    var AFull = problem.A.map(function (row, i) {
      var slack = [];
      for (var k = 0; k < m; k++) slack.push(k === i ? 1 : 0);
      return row.concat(slack);
    });
    var cFull = problem.c.concat(new Array(m).fill(0));
    return { AFull: AFull, cFull: cFull };
  }

  /** Step 1: initial all-slack basis (valid because b >= 0). */
  function setupInitialBasis(problem) {
    var n = problem.n;
    var m = problem.m;
    var B = [];
    var N = [];
    var Binv = [];
    var cB = [];
    for (var i = 0; i < m; i++) {
      B.push(n + 1 + i);
      cB.push(0);
      var row = [];
      for (var j = 0; j < m; j++) row.push(i === j ? 1 : 0);
      Binv.push(row);
    }
    for (var v = 1; v <= n; v++) N.push(v);
    return { B: B, N: N, Binv: Binv, cB: cB, cN: problem.c.slice() };
  }

  /** Column of variable varIndex (1-based) in the ORIGINAL full problem. */
  function getColumn(AFull, varIndex) {
    return AFull.map(function (row) { return row[varIndex - 1]; });
  }

  function matVec(M, v) {
    return M.map(function (row) {
      return row.reduce(function (s, x, j) { return s + x * v[j]; }, 0);
    });
  }

  /** row vector (1 x m) times matrix (m x k) -> 1 x k */
  function vecMat(v, M) {
    var k = M[0].length;
    var out = [];
    for (var j = 0; j < k; j++) {
      var s = 0;
      for (var i = 0; i < M.length; i++) s += v[i] * M[i][j];
      out.push(s);
    }
    return out;
  }

  function dot(a, b) {
    return a.reduce(function (s, x, i) { return s + x * b[i]; }, 0);
  }

  /** General matrix product: (r x k) · (k x c) -> (r x c). */
  function matMul(A, B) {
    var out = [];
    for (var i = 0; i < A.length; i++) {
      var row = [];
      for (var j = 0; j < B[0].length; j++) {
        var s = 0;
        for (var k = 0; k < A[0].length; k++) s += A[i][k] * B[k][j];
        row.push(s);
      }
      out.push(row);
    }
    return out;
  }

  function computeBMatrix(AFull, B) {
    return AFull.map(function (row) {
      return B.map(function (idx) { return row[idx - 1]; });
    });
  }

  function computeNMatrix(AFull, N) {
    return computeBMatrix(AFull, N);
  }

  /* Step 2 */
  function computeXB(Binv, b) { return matVec(Binv, b); }
  function computeZ(cB, xB) { return dot(cB, xB); }

  /* Step 3 */
  function computeY(cB, Binv) { return vecMat(cB, Binv); }

  function computeRN(cN, y, NMatrix) {
    var yN = vecMat(y, NMatrix);
    return cN.map(function (c, j) { return c - yN[j]; });
  }

  function decideOptimal(rN) {
    return rN.every(function (r) { return r <= ENGINE_EPS; });
  }

  /** Canonical entering choice: most positive reduced cost; ties -> smallest var index. */
  function decideEntering(rN, N) {
    var best = -Infinity;
    for (var i = 0; i < rN.length; i++) if (rN[i] > best) best = rN[i];
    if (best <= ENGINE_EPS) return null;
    var q = null;
    var qi = -1;
    for (var j = 0; j < rN.length; j++) {
      if (rN[j] >= best - ENGINE_EPS && (q === null || N[j] < q)) {
        q = N[j];
        qi = j;
      }
    }
    return { q: q, indexInN: qi };
  }

  /** Accepts any mathematically valid entering choice (ties within tol). */
  function isAcceptableEnteringChoice(rN, N, chosenVar, tol) {
    if (tol == null) tol = 1e-6;
    var i = N.indexOf(chosenVar);
    if (i < 0) return false;
    var best = Math.max.apply(null, rN);
    return rN[i] > ENGINE_EPS && rN[i] >= best - tol;
  }

  /* Step 4 */
  function computeNBarQ(Binv, aQ) { return matVec(Binv, aQ); }

  function decideUnbounded(nBarQ) {
    return nBarQ.every(function (v) { return v <= ENGINE_EPS; });
  }

  /** Ratio per row; null where nBarQ_i <= 0 (row not a candidate). */
  function computeRatios(xB, nBarQ) {
    return nBarQ.map(function (v, i) { return v > ENGINE_EPS ? xB[i] / v : null; });
  }

  /** Canonical leaving choice: min ratio; ties -> first (smallest) row. */
  function decideLeaving(xB, nBarQ, B) {
    var ratios = computeRatios(xB, nBarQ);
    var bestRow = -1;
    var best = Infinity;
    for (var i = 0; i < ratios.length; i++) {
      if (ratios[i] !== null && ratios[i] < best - ENGINE_EPS) {
        best = ratios[i];
        bestRow = i;
      }
    }
    if (bestRow < 0) return null;
    return { p: B[bestRow], row: bestRow };
  }

  /** Accepts any row that ties the minimum ratio within tol. */
  function isAcceptableLeavingChoice(xB, nBarQ, B, chosenVar, tol) {
    if (tol == null) tol = 1e-6;
    var row = B.indexOf(chosenVar);
    if (row < 0) return false;
    var ratios = computeRatios(xB, nBarQ);
    if (ratios[row] === null) return false;
    var best = Infinity;
    ratios.forEach(function (r) { if (r !== null && r < best) best = r; });
    return ratios[row] <= best + tol;
  }

  /* Step 5 */

  /** q replaces p AT p's POSITION in B; p replaces q at q's position in N. */
  function computeNextBasis(B, N, p, q) {
    var Bn = B.slice();
    var Nn = N.slice();
    Bn[B.indexOf(p)] = q;
    Nn[N.indexOf(q)] = p;
    return { B: Bn, N: Nn };
  }

  function pickCosts(cFull, indices) {
    return indices.map(function (i) { return cFull[i - 1]; });
  }

  /**
   * Update B^-1 by Gauss-Jordan row operations that drive nBarQ to e_pivotRow,
   * applied to the augmented [Binv | nBarQ] — the exact operation the
   * row-reduction calculator performs manually.
   */
  function computeNextBinv(Binv, nBarQ, pivotRow) {
    var m = Binv.length;
    var aug = Binv.map(function (row, i) { return row.concat([nBarQ[i]]); });
    var red = RowReduce.pivotEliminate(aug, pivotRow, m);
    return red.map(function (row) { return row.slice(0, m); });
  }

  /* Termination */

  function computeFinalOptimalResult(problem, given, xB, rN) {
    var total = problem.n + problem.m;
    var assignments = {};
    for (var v = 1; v <= total; v++) assignments[v] = 0;
    given.B.forEach(function (bi, i) { assignments[bi] = xB[i]; });
    var alternate = rN.some(function (r) { return Math.abs(r) <= 1e-7; });
    // Shadow prices y^T = cB^T · B^-1 — the marginal value of each constraint's
    // resource at the optimum (course summary, item 3).
    var shadowPrices = computeY(given.cB, given.Binv);
    return {
      Z: computeZ(given.cB, xB),
      assignments: assignments,
      B: given.B.slice(),
      N: given.N.slice(),
      hasAlternateOptima: alternate,
      shadowPrices: shadowPrices,
    };
  }

  var api = {
    ENGINE_EPS: ENGINE_EPS,
    buildFullProblem: buildFullProblem,
    setupInitialBasis: setupInitialBasis,
    getColumn: getColumn,
    matVec: matVec,
    vecMat: vecMat,
    dot: dot,
    matMul: matMul,
    computeBMatrix: computeBMatrix,
    computeNMatrix: computeNMatrix,
    computeXB: computeXB,
    computeZ: computeZ,
    computeY: computeY,
    computeRN: computeRN,
    decideOptimal: decideOptimal,
    decideEntering: decideEntering,
    isAcceptableEnteringChoice: isAcceptableEnteringChoice,
    computeNBarQ: computeNBarQ,
    decideUnbounded: decideUnbounded,
    computeRatios: computeRatios,
    decideLeaving: decideLeaving,
    isAcceptableLeavingChoice: isAcceptableLeavingChoice,
    computeNextBasis: computeNextBasis,
    pickCosts: pickCosts,
    computeNextBinv: computeNextBinv,
    computeFinalOptimalResult: computeFinalOptimalResult,
  };

  if (typeof window !== 'undefined') {
    window.Simplex = window.Simplex || {};
    window.Simplex.engine = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
