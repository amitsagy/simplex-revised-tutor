/* Simplex Tutor — generator.js
 * Random exercise generation with quality gates. Reuses the pure engine to
 * SIMULATE the whole run (same chain as test/run-tests.js), then keeps only
 * problems that terminate cleanly in a few iterations with "nice" numbers so
 * the student drills the procedure, not ugly arithmetic.
 *
 * The RNG is seedable (LCG) so tests are deterministic.
 */
(function () {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var Engine = isNode ? require('./engine.js') : window.Simplex.engine;

  /* --- seedable RNG --- */
  function makeRng(seed) {
    var s = (seed == null ? (Date.now() >>> 0) : seed) >>> 0;
    if (s === 0) s = 0x9e3779b9;
    return function () {
      // 32-bit LCG (Numerical Recipes constants)
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function randInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

  var NICE_DEN_MAX = 6;
  var NICE_ABS_MAX = 99;

  /** A number that a student can handle by hand: small, low-denominator. */
  function isNice(x) {
    if (!isFinite(x)) return false;
    if (Math.abs(x) > NICE_ABS_MAX) return false;
    for (var d = 1; d <= NICE_DEN_MAX; d++) {
      if (Math.abs(x * d - Math.round(x * d)) < 1e-9) return true;
    }
    return false;
  }
  function allNice(arr) {
    return arr.every(function (x) {
      return Array.isArray(x) ? allNice(x) : isNice(x);
    });
  }

  /**
   * Run the full Revised-Simplex chain on a problem (mirrors the engine calls
   * the session makes) and report how it went. Bounded by maxIters.
   * -> { status:'optimal'|'unbounded'|'toolong', iterations, allValues:[…] }
   */
  function simulate(problem, maxIters) {
    if (maxIters == null) maxIters = 8;
    var full = Engine.buildFullProblem(problem);
    var given = Engine.setupInitialBasis(problem);
    var vals = [];
    for (var k = 0; k < maxIters; k++) {
      var xB = Engine.computeXB(given.Binv, problem.b);
      var Z = Engine.computeZ(given.cB, xB);
      var y = Engine.computeY(given.cB, given.Binv);
      var NMat = Engine.computeNMatrix(full.AFull, given.N);
      var rN = Engine.computeRN(given.cN, y, NMat);
      pushVals(vals, given.Binv, xB, [Z], y, rN);

      if (Engine.decideOptimal(rN)) {
        return { status: 'optimal', iterations: k + 1, allValues: vals, given: given, xB: xB, y: y, rN: rN };
      }
      var ent = Engine.decideEntering(rN, given.N);
      var aQ = Engine.getColumn(full.AFull, ent.q);
      var nBarQ = Engine.computeNBarQ(given.Binv, aQ);
      pushVals(vals, nBarQ);
      if (Engine.decideUnbounded(nBarQ)) {
        return { status: 'unbounded', iterations: k + 1, allValues: vals, enteringVar: ent.q };
      }
      var lv = Engine.decideLeaving(xB, nBarQ, given.B);
      var nb = Engine.computeNextBasis(given.B, given.N, lv.p, ent.q);
      var nextBinv = Engine.computeNextBinv(given.Binv, nBarQ, lv.row);
      pushVals(vals, nextBinv);
      given = {
        B: nb.B, N: nb.N, Binv: nextBinv,
        cB: Engine.pickCosts(full.cFull, nb.B),
        cN: Engine.pickCosts(full.cFull, nb.N),
      };
    }
    return { status: 'toolong', iterations: maxIters, allValues: vals };
  }

  function pushVals(acc) {
    for (var i = 1; i < arguments.length; i++) {
      var v = arguments[i];
      if (Array.isArray(v[0])) v.forEach(function (r) { acc.push.apply(acc, r); });
      else acc.push.apply(acc, v);
    }
  }

  /* --- random problem sampling (Max, Ax<=b, b>=0) --- */

  /* Allow some negative A entries — this is what makes unbounded problems
   * possible (cf. homework Q1a: x1−3x2+x3). b>=0 keeps the all-slack basis
   * feasible regardless of A's signs. */
  function randomCandidate(rng, allowNeg) {
    var n = randInt(rng, 2, 3);
    var m = randInt(rng, 2, 3);
    var lo = allowNeg ? -3 : 0;
    var A = [];
    for (var i = 0; i < m; i++) {
      var row = [];
      for (var j = 0; j < n; j++) row.push(randInt(rng, lo, 4));
      if (row.every(function (x) { return x === 0; })) row[randInt(rng, 0, n - 1)] = randInt(rng, 1, 4);
      A.push(row);
    }
    // no all-zero column (that variable would be free/degenerate-trivial)
    for (var c = 0; c < n; c++) {
      if (A.every(function (r) { return r[c] === 0; })) A[randInt(rng, 0, m - 1)][c] = randInt(rng, 1, 4);
    }
    var cVec = [];
    for (var k = 0; k < n; k++) cVec.push(randInt(rng, 1, 9));
    var b = [];
    for (var r = 0; r < m; r++) b.push(randInt(rng, 2, 20));
    return { n: n, m: m, c: cVec, A: A, b: b };
  }

  /**
   * opts: { seed?, wantUnbounded?, minIters=2, maxIters=4, tries=500 }
   * Returns a problem whose full simulation passes all quality gates, or null.
   */
  function generateProblem(opts) {
    opts = opts || {};
    var rng = makeRng(opts.seed);
    var minIters = opts.minIters || 2;
    var maxIters = opts.maxIters || 4;
    var tries = opts.tries || 800;
    // Decide the target type up front so the optimal/unbounded mix is reliable
    // (unbounded that also passes the nice+iteration gates is rare by chance).
    var targetUnbounded = opts.wantUnbounded;
    if (targetUnbounded == null) targetUnbounded = rng() < 0.25;
    // unbounded needs negative A entries (cf. hw Q1a); optimal stays cleaner
    // without them, so only allow negatives when we're aiming for unbounded.
    for (var t = 0; t < tries; t++) {
      var p = randomCandidate(rng, targetUnbounded);
      // occasionally make one objective coeff negative to vary difficulty
      if (!targetUnbounded && rng() < 0.25) p.c[randInt(rng, 0, p.n - 1)] = -randInt(rng, 1, 9);
      var sim = simulate(p, maxIters + 1);
      if (sim.status === 'toolong') continue;
      if (sim.iterations < minIters || sim.iterations > maxIters) continue;
      if (!allNice(sim.allValues)) continue;
      if (targetUnbounded && sim.status !== 'unbounded') continue;
      if (!targetUnbounded && sim.status !== 'optimal') continue;
      // require at least 2 pivots for optimal (otherwise trivial)
      if (sim.status === 'optimal' && sim.iterations < 2) continue;
      p._sim = { status: sim.status, iterations: sim.iterations };
      return p;
    }
    // fall back to the other type rather than returning null on a hard seed
    if (opts.wantUnbounded == null && !opts._retry) {
      return generateProblem(Object.assign({}, opts, { wantUnbounded: !targetUnbounded, _retry: true, seed: (opts.seed || 1) + 1 }));
    }
    return null;
  }

  /**
   * Reverse-engineering drill (homework Q3 style): n=m=2, optimal, final basis
   * is exactly {x1,x2} (all originals) so A is fully recoverable from B, with
   * nice tableau values.
   */
  function generateReverseProblem(opts) {
    opts = opts || {};
    var rng = makeRng(opts.seed);
    var tries = opts.tries || 800;
    for (var t = 0; t < tries; t++) {
      var p = randomCandidate(rng);
      p.n = 2; p.m = 2;
      p.A = p.A.slice(0, 2).map(function (r) { return r.slice(0, 2); });
      p.c = p.c.slice(0, 2);
      p.b = p.b.slice(0, 2);
      // ensure A columns non-degenerate
      if (p.A[0][0] * p.A[1][1] - p.A[0][1] * p.A[1][0] === 0) continue;
      var sim = simulate(p, 4);
      if (sim.status !== 'optimal') continue;
      if (sim.iterations < 2 || sim.iterations > 3) continue;
      // require the ORDERED basis [1,2] so B = A and cB = c directly
      // (no column reordering for the student to untangle)
      if (!(sim.given.B[0] === 1 && sim.given.B[1] === 2)) continue;
      if (!allNice(sim.allValues)) continue;
      // B⁻¹ itself must be nice to read off the tableau
      if (!allNice(sim.given.Binv)) continue;
      p._sim = { status: 'optimal', iterations: sim.iterations };
      return p;
    }
    return null;
  }

  var api = {
    makeRng: makeRng,
    isNice: isNice,
    allNice: allNice,
    simulate: simulate,
    generateProblem: generateProblem,
    generateReverseProblem: generateReverseProblem,
  };

  if (typeof window !== 'undefined') {
    window.Simplex = window.Simplex || {};
    window.Simplex.generator = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
