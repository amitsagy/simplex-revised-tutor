/* Simplex Tutor — test runner. Zero dependencies: `node test/run-tests.js`.
 * Layers:
 *  1. Unit tests: parse, answer-check, row-reduce, engine tie rules.
 *  2. Fixture replay: chain the engine exactly as the session does and
 *     compare EVERY intermediate value against the course's worked examples.
 *  3. Session walk: drive the full state machine end-to-end with canonical
 *     answers and assert it terminates with the right result.
 */
'use strict';

var path = require('path');
var Parse = require(path.join(__dirname, '../js/parse.js'));
var Check = require(path.join(__dirname, '../js/answer-check.js'));
var RR = require(path.join(__dirname, '../js/row-reduce.js'));
var Engine = require(path.join(__dirname, '../js/engine.js'));
var Session = require(path.join(__dirname, '../js/session.js'));
var Generator = require(path.join(__dirname, '../js/generator.js'));
var Duality = require(path.join(__dirname, '../js/duality.js'));
var Tableau = require(path.join(__dirname, '../js/tableau.js'));
var Exercises = require(path.join(__dirname, '../js/exercises.js'));
var wyndor = require(path.join(__dirname, 'fixtures/wyndor.js'));
var hw1a = require(path.join(__dirname, 'fixtures/hw1a.js'));

var passed = 0;
var failed = 0;
var failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(name + (detail ? ' — ' + detail : ''));
  }
}

function eqNum(a, b) { return Math.abs(a - b) < 1e-9; }
function eqVec(a, b) {
  return a.length === b.length && a.every(function (x, i) { return eqNum(x, b[i]); });
}
function eqMat(a, b) {
  return a.length === b.length && a.every(function (r, i) { return eqVec(r, b[i]); });
}
function eqIntVec(a, b) {
  return a.length === b.length && a.every(function (x, i) { return x === b[i]; });
}
function show(v) { return JSON.stringify(v); }

/* ---------- 1. parse ---------- */

check('parse int', Parse.parseNumber('3') === 3);
check('parse negative decimal', Parse.parseNumber('-2.5') === -2.5);
check('parse leading dot', Parse.parseNumber('.5') === 0.5);
check('parse fraction', eqNum(Parse.parseNumber('1/3'), 1 / 3));
check('parse negative fraction', eqNum(Parse.parseNumber('-4/6'), -2 / 3));
check('parse unicode minus', Parse.parseNumber('−2') === -2);
check('parse spaces around fraction', eqNum(Parse.parseNumber(' 1 / 2 '), 0.5));
check('parse rejects empty', isNaN(Parse.parseNumber('')));
check('parse rejects text', isNaN(Parse.parseNumber('abc')));
check('parse rejects div by zero', isNaN(Parse.parseNumber('1/0')));
check('parse rejects double slash', isNaN(Parse.parseNumber('1/2/3')));
check('format integer', Parse.formatNumber(5) === '5');
check('format negative zero', Parse.formatNumber(-0) === '0');
check('format third', Parse.formatNumber(1 / 3) === '1/3');
check('format neg third', Parse.formatNumber(-1 / 3) === '-1/3');
check('format half', Parse.formatNumber(0.5) === '1/2');

/* ---------- 2. answer-check ---------- */

check('matches exact', Check.matches(2.5, 2.5));
check('matches rounded decimal for 1/3', Check.matches(0.333, 1 / 3) === true);
check('rejects real mistake', Check.matches(0.4, 1 / 3) === false);
check('scalar ok', Check.checkScalar('1/2', 0.5).ok);
check('scalar invalid flagged', Check.checkScalar('x', 0.5).invalid);
var gridRes = Check.checkGrid([['1', '0'], ['0', '2']], [[1, 0], [0, 1]]);
check('grid detects wrong cell', gridRes.ok === false && gridRes.cells[1][1].ok === false && gridRes.cells[0][0].ok === true);
var rvOk = Check.checkRatioVec(['6', ' - ', '9'], [6, null, 9]);
check('ratio vec ok with dash', rvOk.ok);
var rvBad1 = Check.checkRatioVec(['6', '5', '9'], [6, null, 9]);
check('ratio vec rejects number where dash expected', rvBad1.ok === false && rvBad1.cells[1].ok === false);
var rvBad2 = Check.checkRatioVec(['-', '4'], [3, 4]);
check('ratio vec rejects dash where number expected', rvBad2.ok === false && rvBad2.cells[1].ok === true);
check('ratio vec flags gibberish invalid', Check.checkRatioVec(['zz'], [null]).cells[0].invalid === true);

var idxRes = Check.checkIndexList([3, 2, 5], [3, 2, 5]);
check('index list ok', idxRes.ok);
var idxBad = Check.checkIndexList([2, 3, 5], [3, 2, 5]);
check('index list order matters', idxBad.ok === false && idxBad.cells[2] === true);

/* ---------- 3. row-reduce ---------- */

var M = [[1, 2], [3, 4]];
check('scale op', eqMat(RR.applyRowOp(M, { type: 'scale', row: 0, k: 2 }), [[2, 4], [3, 4]]));
check('addMultiple op', eqMat(RR.applyRowOp(M, { type: 'addMultiple', target: 1, source: 0, k: -3 }), [[1, 2], [0, -2]]));
check('swap op', eqMat(RR.applyRowOp(M, { type: 'swap', a: 0, b: 1 }), [[3, 4], [1, 2]]));
check('applyRowOp does not mutate input', eqMat(M, [[1, 2], [3, 4]]));
var piv = RR.pivotEliminate([[1, 0, 0, 0], [0, 1, 0, 2], [0, 0, 1, 2]], 1, 3);
check('pivotEliminate course example', eqMat(piv, [[1, 0, 0, 0], [0, 0.5, 0, 1], [0, -1, 1, 0]]), show(piv));
var rref = RR.toReducedRowEchelon([[2, 4], [1, 3]]);
check('RREF', eqMat(rref, [[1, 0], [0, 1]]), show(rref));

/* step-by-step solvers */
(function () {
  // pivot target: [B⁻¹|n̄q] course example, drive col 3 to e_1
  var M = [[1, 0, 0, 0], [0, 1, 0, 2], [0, 0, 1, 2]];
  var steps = 0;
  var op = RR.nextPivotOp(M, 1, 3);
  while (op && steps++ < 20) {
    M = RR.applyRowOp(M, op);
    op = RR.nextPivotOp(M, 1, 3);
  }
  check('nextPivotOp reaches the pivoted matrix',
    eqMat(M, [[1, 0, 0, 0], [0, 0.5, 0, 1], [0, -1, 1, 0]]), show(M));
  check('nextPivotOp step count sane', steps === 2, String(steps));

  // inverse finding: [B|I] -> [I|B⁻¹] for wyndor iteration-2 B
  var B = [[1, 0, 1], [0, 2, 0], [0, 2, 3]];
  var aug = B.map(function (row, i) {
    return row.concat([i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0]);
  });
  var n2 = 0;
  var op2 = RR.nextRrefOp(aug, 3);
  while (op2 && n2++ < 60) {
    aug = RR.applyRowOp(aug, op2);
    op2 = RR.nextRrefOp(aug, 3);
  }
  var left = aug.map(function (r) { return r.slice(0, 3); });
  var right = aug.map(function (r) { return r.slice(3); });
  check('inverse stepping: left becomes I', RR.isIdentityLeft(left, 3), show(left));
  check('inverse stepping: right is B⁻¹',
    eqMat(right, [[1, 1 / 3, -1 / 3], [0, 0.5, 0], [0, -1 / 3, 1 / 3]]), show(right));

  // swap case
  var sw = RR.nextRrefOp([[0, 1], [1, 0]], 2);
  check('nextRrefOp emits swap when pivot row is zero', sw && sw.type === 'swap', show(sw));
})();

/* ---------- 4. engine tie rules & boundaries ---------- */

var mm = Engine.matMul([[1, 2], [3, 4]], [[5, 6], [7, 8]]);
check('matMul 2x2', eqMat(mm, [[19, 22], [43, 50]]), show(mm));
var mmVec = Engine.matMul([[0, 5, 0]], [[1, 0, 0], [0, 0.5, 0], [0, -1, 1]]);
check('matMul row-vector (y = cB·Binv)', eqMat(mmVec, [[0, 2.5, 0]]), show(mmVec));
var mmCol = Engine.matMul([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[4], [12], [18]]);
check('matMul col-vector (xB = Binv·b)', eqMat(mmCol, [[4], [12], [18]]), show(mmCol));

check('decideOptimal at zero', Engine.decideOptimal([0, -1]) === true);
check('decideOptimal positive', Engine.decideOptimal([1e-6, -1]) === false);
var tie = Engine.decideEntering([5, 5, -1], [2, 1, 3]);
check('entering tie -> smallest var index', tie.q === 1, show(tie));
check('entering accepts tied alternative', Engine.isAcceptableEnteringChoice([5, 5, -1], [2, 1, 3], 2));
check('entering rejects non-max', Engine.isAcceptableEnteringChoice([5, 3, -1], [2, 1, 3], 1) === false);
check('entering rejects negative', Engine.isAcceptableEnteringChoice([-1, -2], [1, 2], 1) === false);
check('unbounded all nonpositive', Engine.decideUnbounded([-2, 0, -1]) === true);
var lv = Engine.decideLeaving([4, 4, 9], [2, 2, 3], [7, 8, 9]);
check('leaving tie -> first row', lv.p === 7 && lv.row === 0, show(lv));
check('leaving accepts tied alternative', Engine.isAcceptableLeavingChoice([4, 4, 9], [2, 2, 3], [7, 8, 9], 8));
check('leaving rejects nonpositive row', Engine.isAcceptableLeavingChoice([4, 4], [2, -1], [7, 8], 8) === false);
var nb = Engine.computeNextBasis([3, 4, 5], [1, 2], 4, 2);
check('next basis keeps positions', eqIntVec(nb.B, [3, 2, 5]) && eqIntVec(nb.N, [1, 4]), show(nb));

/* ---------- 5. fixture replay ---------- */

function replayFixture(fx) {
  var name = fx.name;
  var full = Engine.buildFullProblem(fx.problem);
  var given = Engine.setupInitialBasis(fx.problem);
  for (var k = 0; k < fx.iterations.length; k++) {
    var exp = fx.iterations[k];
    var tag = name + ' iter ' + k + ': ';
    check(tag + 'B', eqIntVec(given.B, exp.B), show(given.B));
    check(tag + 'N', eqIntVec(given.N, exp.N), show(given.N));
    check(tag + 'Binv', eqMat(given.Binv, exp.Binv), show(given.Binv));
    check(tag + 'cB', eqVec(given.cB, exp.cB), show(given.cB));
    check(tag + 'cN', eqVec(given.cN, exp.cN), show(given.cN));

    var xB = Engine.computeXB(given.Binv, fx.problem.b);
    check(tag + 'xB', eqVec(xB, exp.xB), show(xB));
    var Z = Engine.computeZ(given.cB, xB);
    check(tag + 'Z', eqNum(Z, exp.Z), String(Z));
    var y = Engine.computeY(given.cB, given.Binv);
    check(tag + 'y', eqVec(y, exp.y), show(y));
    var NMat = Engine.computeNMatrix(full.AFull, given.N);
    var rN = Engine.computeRN(given.cN, y, NMat);
    check(tag + 'rN', eqVec(rN, exp.rN), show(rN));
    var optimal = Engine.decideOptimal(rN);
    check(tag + 'optimal flag', optimal === exp.optimal);
    if (optimal) {
      var fin = Engine.computeFinalOptimalResult(fx.problem, given, xB, rN);
      check(tag + 'final Z', eqNum(fin.Z, fx.final.Z), String(fin.Z));
      Object.keys(fx.final.assignments).forEach(function (v) {
        check(tag + 'x' + v, eqNum(fin.assignments[v], fx.final.assignments[v]),
          String(fin.assignments[v]));
      });
      check(tag + 'alternate optima flag', fin.hasAlternateOptima === fx.final.hasAlternateOptima);
      if (fx.final.shadowPrices) {
        check(tag + 'shadow prices', eqVec(fin.shadowPrices, fx.final.shadowPrices), show(fin.shadowPrices));
      }
      return;
    }
    var ent = Engine.decideEntering(rN, given.N);
    check(tag + 'entering', ent.q === exp.q, show(ent));
    var aQ = Engine.getColumn(full.AFull, ent.q);
    var nBarQ = Engine.computeNBarQ(given.Binv, aQ);
    check(tag + 'nBarQ', eqVec(nBarQ, exp.nBarQ), show(nBarQ));
    var unbounded = Engine.decideUnbounded(nBarQ);
    check(tag + 'unbounded flag', unbounded === exp.unbounded);
    if (unbounded) {
      check(tag + 'unbounded entering var', ent.q === fx.final.enteringVar);
      return;
    }
    var leave = Engine.decideLeaving(xB, nBarQ, given.B);
    check(tag + 'leaving', leave.p === exp.p && leave.row === exp.pivotRow, show(leave));
    var next = Engine.computeNextBasis(given.B, given.N, leave.p, ent.q);
    check(tag + 'nextB', eqIntVec(next.B, exp.nextB), show(next.B));
    check(tag + 'nextN', eqIntVec(next.N, exp.nextN), show(next.N));
    var nextBinv = Engine.computeNextBinv(given.Binv, nBarQ, leave.row);
    check(tag + 'nextBinv', eqMat(nextBinv, exp.nextBinv), show(nextBinv));
    given = {
      B: next.B,
      N: next.N,
      Binv: nextBinv,
      cB: Engine.pickCosts(full.cFull, next.B),
      cN: Engine.pickCosts(full.cFull, next.N),
    };
  }
  check(name + ': fixture exhausted without termination', false);
}

replayFixture(wyndor);
replayFixture(hw1a);

/* ---------- 6. session walk (integration) ---------- */

function walkSession(fx) {
  var name = fx.name + ' [session]';
  var s = Session.createSession(fx.problem);
  var guard = 0;
  while (s.status === 'in-progress' && guard++ < 500) {
    var st = Session.getCurrent(s);
    check(name + ': step exists', st !== null);
    if (!st) break;
    var why = Session.getWhyForCurrent(s);
    check(name + ': why non-empty at ' + st.key + '/' + s.substage,
      typeof why === 'string' && why.length > 0);
    var res;
    if (st.kind === 'stepRecall') {
      // wrong answer must not advance
      var before = s.stepIndex;
      res = Session.submitStepRecall(s, 'not-a-step');
      check(name + ': wrong recall rejected', res.ok === false && s.stepIndex === before);
      res = Session.submitStepRecall(s, st.correctStep);
      check(name + ': recall ' + st.key, res.ok);
    } else if (st.kind === 'decision') {
      res = Session.submitDecision(s, Session.getCorrectChoice(s));
      check(name + ': decision ' + st.key, res.ok);
    } else if (s.substage === 'recall') {
      res = Session.submitQuantityRecall(s, st.quantityId);
      check(name + ': q-recall ' + st.key, res.ok);
    } else if (s.substage === 'dims') {
      var dims = st.qtype === 'indexList'
        ? { size: st.correct.length }
        : { rows: st.dims[0], cols: st.dims[1] };
      res = Session.submitDims(s, dims);
      check(name + ': dims ' + st.key, res.ok);
    } else if (st.qtype === 'scalar') {
      res = Session.submitScalar(s, Parse.formatNumber(st.correct));
      check(name + ': scalar ' + st.key, res.ok);
    } else if (st.qtype === 'grid') {
      var strs = st.correct.map(function (row) { return row.map(Parse.formatNumber); });
      res = Session.submitGrid(s, strs);
      check(name + ': grid ' + st.key, res.ok);
    } else if (st.qtype === 'indexList') {
      res = Session.submitIndexList(s, st.correct.slice());
      check(name + ': list ' + st.key, res.ok);
    } else if (st.qtype === 'ratios') {
      var rstrs = st.correct.map(function (v) {
        return v === null ? '-' : Parse.formatNumber(v);
      });
      res = Session.submitRatios(s, rstrs);
      check(name + ': ratios ' + st.key, res.ok);
    } else if (st.qtype === 'columnPick') {
      res = Session.submitColumnPick(s, st.correct.slice());
      check(name + ': pick ' + st.key, res.ok);
    } else {
      check(name + ': unknown step type ' + st.qtype, false);
      break;
    }
  }
  check(name + ': terminated', guard < 500);
  check(name + ': status', s.status === fx.final.status, s.status);
  if (fx.final.status === 'optimal') {
    check(name + ': final Z', eqNum(s.finalResult.Z, fx.final.Z), String(s.finalResult && s.finalResult.Z));
    check(name + ': iterations count', s.iterations.length === fx.iterations.length, String(s.iterations.length));
  } else {
    check(name + ': unbounded var', s.finalResult.enteringVar === fx.final.enteringVar);
  }
}

walkSession(wyndor);
walkSession(hw1a);

/* Wrong-input paths through the session */
(function () {
  var s = Session.createSession(wyndor.problem);
  Session.submitStepRecall(s, 'step1');
  var bad = Session.submitIndexList(s, [4, 3, 5]); // wrong order on purpose... substage is 'recall' though
  check('session: list submit at wrong substage is just wrong', bad.ok === false);
  Session.submitQuantityRecall(s, 'Blist');
  var badDims = Session.submitDims(s, { size: 99 });
  check('session: wrong dims rejected', badDims.ok === false);
  Session.submitDims(s, { size: 3 });
  var badList = Session.submitIndexList(s, [4, 3, 5]);
  check('session: wrong order rejected cell-wise', badList.ok === false && badList.cells[2] === true);
  var reveal = Session.revealCurrent(s);
  check('session: reveal returns values', reveal.type === 'values' && eqIntVec(reveal.value, [3, 4, 5]));
  check('session: help recorded', Session.helpSummary(s).length === 1 && Session.helpSummary(s)[0].level === 3);
  Session.recordAuto(s);
  var autos = Session.autoSummary(s);
  check('session: auto tracked separately from help',
    autos.length === 1 && autos[0].where === 'הקמה' &&
    Session.helpSummary(s).length === 1);
})();

/* ---------- generator ---------- */

check('isNice integer', Generator.isNice(5) && Generator.isNice(-3));
check('isNice third', Generator.isNice(1 / 3) && Generator.isNice(-2 / 3));
check('isNice rejects big', Generator.isNice(150) === false);
check('isNice rejects ugly denom', Generator.isNice(1 / 7) === false);

// simulate must agree with the hand-checked fixtures
var simW = Generator.simulate(wyndor.problem, 6);
check('simulate wyndor: optimal in 3', simW.status === 'optimal' && simW.iterations === 3, JSON.stringify(simW.status) + '/' + simW.iterations);
var simH = Generator.simulate(hw1a.problem, 6);
check('simulate hw1a: unbounded in 3', simH.status === 'unbounded' && simH.iterations === 3, JSON.stringify(simH.status) + '/' + simH.iterations);

// deterministic batch: every generated problem passes its own gates
(function () {
  var optCount = 0, unbCount = 0, bad = 0;
  for (var seed = 1; seed <= 20; seed++) {
    var p = Generator.generateProblem({ seed: seed * 7919 });
    if (!p) { bad++; continue; }
    var sim = Generator.simulate(p, 5);
    var okIters = sim.iterations >= 2 && sim.iterations <= 4;
    var okNice = Generator.allNice(sim.allValues);
    if (!okIters || !okNice || sim.status === 'toolong') bad++;
    if (sim.status === 'optimal') optCount++;
    if (sim.status === 'unbounded') unbCount++;
  }
  check('generator: 20 seeds all valid', bad === 0, 'bad=' + bad);
  check('generator: produced optimal problems', optCount >= 10, 'opt=' + optCount);
  check('generator: produced at least one unbounded', unbCount >= 1, 'unb=' + unbCount);
})();

// wantUnbounded flag honored
var pu = Generator.generateProblem({ seed: 12345, wantUnbounded: true });
check('generator: wantUnbounded returns unbounded', pu && Generator.simulate(pu, 5).status === 'unbounded', pu ? 'ok' : 'null');

// reverse-problem drill: n=m=2, optimal, final basis {1,2}
(function () {
  var found = 0;
  for (var seed = 1; seed <= 8; seed++) {
    var rp = Generator.generateReverseProblem({ seed: seed * 104729 });
    if (!rp) continue;
    found++;
    check('reverse: is 2x2', rp.n === 2 && rp.m === 2);
    var sim = Generator.simulate(rp, 4);
    check('reverse: optimal', sim.status === 'optimal');
    var fb = sim.given.B.slice().sort(function (a, b) { return a - b; });
    check('reverse: final basis is {1,2}', fb[0] === 1 && fb[1] === 2, JSON.stringify(fb));
    check('reverse: B⁻¹ nice', Generator.allNice(sim.given.Binv));
  }
  check('reverse: generator found problems', found >= 5, 'found=' + found);
})();

/* Serialization round-trip: a session saved mid-exercise (plain JSON) must
 * resume and complete — this is what powers refresh-persistence and the
 * back/forward timeline. */
(function () {
  function submitAny(sx) {
    var st = Session.getCurrent(sx);
    if (st.kind === 'stepRecall') return Session.submitStepRecall(sx, st.correctStep);
    if (st.kind === 'decision') return Session.submitDecision(sx, Session.getCorrectChoice(sx));
    if (sx.substage === 'recall') return Session.submitQuantityRecall(sx, st.quantityId);
    if (sx.substage === 'dims') {
      return Session.submitDims(sx, st.qtype === 'indexList'
        ? { size: st.correct.length }
        : { rows: st.dims[0], cols: st.dims[1] });
    }
    if (st.qtype === 'scalar') return Session.submitScalar(sx, Parse.formatNumber(st.correct));
    if (st.qtype === 'grid') {
      return Session.submitGrid(sx, st.correct.map(function (r) { return r.map(Parse.formatNumber); }));
    }
    if (st.qtype === 'indexList') return Session.submitIndexList(sx, st.correct.slice());
    if (st.qtype === 'ratios') {
      return Session.submitRatios(sx, st.correct.map(function (v) {
        return v === null ? '-' : Parse.formatNumber(v);
      }));
    }
    return Session.submitColumnPick(sx, st.correct.slice());
  }

  var s = Session.createSession(wyndor.problem);
  for (var i = 0; i < 15; i++) submitAny(s);
  check('round-trip: mid-exercise state is in-progress', s.status === 'in-progress');
  var revived = JSON.parse(JSON.stringify(s));
  check('round-trip: snapshot equals origin', JSON.stringify(revived) === JSON.stringify(s));
  var guard = 0;
  while (revived.status === 'in-progress' && guard++ < 500) {
    var ok = submitAny(revived);
    if (!ok || !ok.ok) { check('round-trip: submission accepted', false, JSON.stringify(Session.getCurrent(revived))); break; }
  }
  check('round-trip: revived session completes', revived.status === 'optimal' && guard < 500);
  check('round-trip: revived Z* correct', revived.finalResult && eqNum(revived.finalResult.Z, 36));
})();

/* Exam mode: wrong submissions grow errorLog (not helpLog); scoring works;
 * new fields survive a JSON round-trip. */
(function () {
  var s = Session.createSession(wyndor.problem, { examMode: true });
  check('exam: session flagged', s.examMode === true && s.errorLog.length === 0);
  // first step is stepRecall; submit a wrong step -> error, no advance
  var idxBefore = s.stepIndex;
  var r = Session.submitStepRecall(s, 'step5');
  check('exam: wrong step rejected', r.ok === false && s.stepIndex === idxBefore);
  check('exam: error logged', s.errorLog.length === 1 && s.helpLog.length === 0);
  // correct it
  Session.submitStepRecall(s, 'step1');
  check('exam: correct advances', s.stepIndex === idxBefore + 1);
  // score reflects the one error
  var ex = Session.examSummary(s);
  check('exam: score = 100 - 3*errors', ex.score === 97 && ex.totalErrors === 1, JSON.stringify(ex));
  check('exam: byStep has an entry', ex.byStep.length === 1 && ex.byStep[0].count === 1);
  // round-trip preserves errorLog + examMode + elapsedMs
  var revived = JSON.parse(JSON.stringify(s));
  check('exam: round-trip preserves fields',
    revived.examMode === true && revived.errorLog.length === 1 && 'elapsedMs' in revived);
})();

/* Reverse drill: drive the full state machine with canonical answers and
 * check the reconstructed identities. */
(function () {
  var rp = Generator.generateReverseProblem({ seed: 104729 });
  check('reverse-walk: problem generated', !!rp);
  if (!rp) return;
  var s = Session.createReverseSession(rp);
  check('reverse-walk: mode reverse', s.mode === 'reverse');
  var guard = 0;
  while (s.status === 'in-progress' && guard++ < 100) {
    var st = Session.getCurrent(s);
    var res;
    if (st.kind === 'quiz') {
      // wrong choice first, then right
      var wrongId = st.options.filter(function (o) { return o.id !== st.correct; })[0].id;
      var bad = Session.submitQuiz(s, wrongId);
      check('reverse-walk: wrong quiz rejected', bad.ok === false);
      res = Session.submitQuiz(s, st.correct);
      check('reverse-walk: quiz ' + st.key, res.ok);
    } else if (s.substage === 'dims') {
      res = Session.submitDims(s, st.qtype === 'indexList'
        ? { size: st.correct.length } : { rows: st.dims[0], cols: st.dims[1] });
      check('reverse-walk: dims ' + st.key, res.ok);
    } else if (st.qtype === 'scalar') {
      res = Session.submitScalar(s, Parse.formatNumber(st.correct));
      check('reverse-walk: scalar ' + st.key, res.ok);
    } else if (st.qtype === 'grid') {
      res = Session.submitGrid(s, st.correct.map(function (r) { return r.map(Parse.formatNumber); }));
      check('reverse-walk: grid ' + st.key, res.ok);
    } else {
      check('reverse-walk: unexpected step ' + st.key, false);
      break;
    }
  }
  check('reverse-walk: completed', s.status === 'reverse-done' && guard < 100, s.status);
  // errors recorded (one per quiz wrong answer, 5 quizzes... actually there are 3 quizzes)
  check('reverse-walk: errors tracked', s.errorLog.length >= 1);
  var r = s.reverse;
  check('reverse-walk: A === B matrix', JSON.stringify(r.A) === JSON.stringify(r.Bmatrix));
  var yB = Engine.matMul([r.y], r.Bmatrix)[0];
  check('reverse-walk: c === yᵀB', eqVec(yB, r.c), show(yB) + ' vs ' + show(r.c));
  var bbi = Engine.matMul(r.Bmatrix, r.Binv);
  check('reverse-walk: B·B⁻¹ = I', eqMat(bbi, [[1, 0], [0, 1]]), show(bbi));
  var yb = r.y[0] * r.b[0] + r.y[1] * r.b[1];
  check('reverse-walk: Z = yᵀb', eqNum(yb, r.Z));
})();

/* ---------- duality (targil 9) ---------- */

function eqProblem(a, b) {
  return a.dir === b.dir && eqVec(a.c, b.c) && eqMat(a.A, b.A) && eqVec(a.b, b.b) &&
    eqIntVecStr(a.ctypes, b.ctypes) && eqIntVecStr(a.vtypes, b.vtypes);
}
function eqIntVecStr(a, b) {
  return a.length === b.length && a.every(function (x, i) { return x === b[i]; });
}

(function () {
  // targil 9 exercise 1: standard Max with ≤ / x≥0 -> Min with ≥ / y≥0
  var ex1 = Exercises.byId['t9-ex1'].data;
  var d1 = Duality.buildDual(ex1);
  check('duality ex1 dir', d1.dir === 'min');
  check('duality ex1 obj = primal b', eqVec(d1.c, [24, 8, 48, 32]), show(d1.c));
  check('duality ex1 A = Aᵀ', eqMat(d1.A, [[4, 3, 0, 2], [0, 1, 1, 0], [1, 4, 4, 0]]), show(d1.A));
  check('duality ex1 rhs = primal c', eqVec(d1.b, [12, 3, 1]), show(d1.b));
  check('duality ex1 ctypes', eqIntVecStr(d1.ctypes, ['ge', 'ge', 'ge']), show(d1.ctypes));
  check('duality ex1 vtypes', eqIntVecStr(d1.vtypes, ['ge0', 'ge0', 'ge0', 'ge0']), show(d1.vtypes));

  // targil 9 exercise 2: non-standard (=, ≥, free variable)
  var ex2 = Exercises.byId['t9-ex2'].data;
  var d2 = Duality.buildDual(ex2);
  check('duality ex2 full', eqProblem(d2, {
    dir: 'min', c: [1, 2, 1], A: [[1, 5, 1], [-1, 2, 1]], b: [1, 3],
    ctypes: ['eq', 'ge'], vtypes: ['ge0', 'free', 'le0'],
  }), show(d2));

  // homework 9 q1: Min primal with free var and = constraint -> Max dual
  var hq1 = Exercises.byId['hw9-q1'].data;
  var dh = Duality.buildDual(hq1);
  check('duality hw9-q1 full', eqProblem(dh, {
    dir: 'max', c: [3, 5, 12], A: [[1, 1, 3], [0, 2, 0]], b: [1, -1],
    ctypes: ['eq', 'le'], vtypes: ['ge0', 'le0', 'free'],
  }), show(dh));

  // symmetry: dual(dual(p)) === p for every stored duality problem
  Exercises.list.filter(function (e) { return e.mode === 'duality'; }).forEach(function (e) {
    var back = Duality.buildDual(Duality.buildDual(e.data));
    check('duality symmetry ' + e.id, eqProblem(back, e.data), show(back));
  });
})();

// generator: duality problems are structurally valid
(function () {
  var bad = 0;
  for (var seed = 1; seed <= 20; seed++) {
    var p = Generator.generateDualityProblem({ seed: seed * 5011 });
    var m = p.A.length, n = p.c.length;
    var okShape = p.b.length === m && p.ctypes.length === m &&
      p.vtypes.length === n && p.A.every(function (r) { return r.length === n; });
    var okTypes = p.ctypes.every(function (t) { return ['le', 'eq', 'ge'].indexOf(t) >= 0; }) &&
      p.vtypes.every(function (t) { return ['ge0', 'free', 'le0'].indexOf(t) >= 0; });
    var d = Duality.buildDual(p);
    var okSym = eqProblem(Duality.buildDual(d), p);
    if (!okShape || !okTypes || !okSym) bad++;
  }
  check('duality generator: 20 seeds valid + symmetric', bad === 0, 'bad=' + bad);
})();

// full duality session walk with canonical answers
(function () {
  var primal = Exercises.byId['hw9-q1'].data;
  var s = Session.createDualitySession(primal);
  check('duality-walk: mode', s.mode === 'duality' && s.phase === 'duality');
  var guard = 0;
  while (s.status === 'in-progress' && guard++ < 100) {
    var st = Session.getCurrent(s);
    var res;
    if (st.kind === 'quiz') {
      var wrong = st.options.filter(function (o) { return o.id !== st.correct; })[0];
      check('duality-walk: wrong quiz rejected ' + st.key, Session.submitQuiz(s, wrong.id).ok === false);
      res = Session.submitQuiz(s, st.correct);
      check('duality-walk: quiz ' + st.key, res.ok);
    } else if (s.substage === 'dims') {
      res = Session.submitDims(s, { rows: st.dims[0], cols: st.dims[1] });
      check('duality-walk: dims ' + st.key, res.ok);
    } else if (st.qtype === 'grid') {
      res = Session.submitGrid(s, st.correct.map(function (r) { return r.map(Parse.formatNumber); }));
      check('duality-walk: grid ' + st.key, res.ok);
    } else {
      check('duality-walk: unexpected step ' + st.key + '/' + s.substage, false);
      break;
    }
  }
  check('duality-walk: completed', s.status === 'duality-done' && guard < 100, s.status);
  check('duality-walk: errors tracked', s.errorLog.length >= 1);
  // round-trip mid-walk
  var s2 = Session.createDualitySession(primal);
  Session.submitQuiz(s2, Session.getCurrent(s2).correct); // dual-dir
  var revived = JSON.parse(JSON.stringify(s2));
  check('duality-walk: round-trip equal', JSON.stringify(revived) === JSON.stringify(s2));
})();

/* ---------- dual simplex + tableau (targil 10) ---------- */

(function () {
  var prob = Exercises.byId['t10-ex1'].data;   // dual of the glass problem
  var t = Tableau.initialDualTableau(prob);
  check('dsim initial zRow', eqVec(t.zRow, [-4, -12, -18, 0, 0]), show(t.zRow));
  check('dsim initial rhs (−b, infeasible)', eqVec(t.rhs, [-3, -5]), show(t.rhs));
  check('dsim initial basis = surplus', eqIntVec(t.basis, [4, 5]), show(t.basis));

  var lv = Tableau.dsLeaving(t);
  check('dsim leaving 1 = e2 (most neg RHS)', lv.varId === 5 && lv.row === 1, show(lv));
  var ratios = Tableau.dsRatios(t, lv.row);
  check('dsim ratios 1', ratios[1] === 6 && ratios[2] === 9 && ratios[0] === null, show(ratios));
  var en = Tableau.dsEntering(t, ratios);
  check('dsim entering 1 = y2 (min ratio)', en.varId === 2, show(en));
  var t2 = Tableau.dsPivot(t, lv.row, en.col);
  check('dsim iter1 zRow', eqVec(t2.zRow, [-4, 0, -6, 0, -6]), show(t2.zRow));
  check('dsim iter1 zRHS = 30', eqNum(t2.zRHS, 30), String(t2.zRHS));

  var res = Tableau.solveDual(t, 8);
  check('dsim optimal in 2 pivots', res.status === 'optimal' && res.iterations === 2,
    res.status + '/' + res.iterations);
  var sol = Tableau.solution(res.tableau);
  check('dsim Z* = 36', eqNum(sol.Z, 36), String(sol.Z));
  check('dsim solution y = (0, 3/2, 1)', eqVec(sol.y, [0, 1.5, 1]), show(sol.y));
  check('dsim all tableau values nice', Generator.allNice(res.allValues));
})();

// generator: dual-simplex problems solve cleanly in 2–4 pivots
(function () {
  var bad = 0, found = 0;
  for (var seed = 1; seed <= 20; seed++) {
    var mp = Generator.generateDualSimplexProblem({ seed: seed * 3301 });
    if (!mp) { bad++; continue; }
    found++;
    var sim = Tableau.solveDual(Tableau.initialDualTableau(mp), 6);
    if (sim.status !== 'optimal' || sim.iterations < 2 || sim.iterations > 4 ||
        !Generator.allNice(sim.allValues)) bad++;
  }
  check('dsim generator: 20 seeds valid', bad === 0, 'bad=' + bad);
  check('dsim generator: found problems', found >= 15, 'found=' + found);
})();

// full dual-simplex session walk with canonical answers
(function () {
  var prob = Exercises.byId['t10-ex1'].data;
  var s = Session.createDualSimplexSession(prob);
  check('dsim-walk: mode', s.mode === 'dualsimplex' && s.phase === 'dsim');
  var guard = 0;
  while (s.status === 'in-progress' && guard++ < 100) {
    var st = Session.getCurrent(s);
    var res;
    if (st.kind === 'quiz') {
      res = Session.submitQuiz(s, st.correct);
      check('dsim-walk: quiz ' + st.key, res.ok);
    } else if (st.qtype === 'ratios') {
      res = Session.submitRatios(s, st.correct.map(function (v) { return v === null ? '-' : Parse.formatNumber(v); }));
      check('dsim-walk: ratios ' + st.key, res.ok);
    } else if (st.qtype === 'grid') {
      res = Session.submitGrid(s, st.correct.map(function (r) { return r.map(Parse.formatNumber); }));
      check('dsim-walk: grid ' + st.key, res.ok);
    } else {
      check('dsim-walk: unexpected step ' + st.key + '/' + s.substage, false);
      break;
    }
  }
  check('dsim-walk: completed', s.status === 'dsim-done' && guard < 100, s.status);
  check('dsim-walk: final Z = 36', eqNum(s.finalResult.solution.Z, 36), String(s.finalResult.solution.Z));
  check('dsim-walk: two iterations', s.dsHistory.length === 2, String(s.dsHistory.length));
  // round-trip mid-walk (plain JSON — the tableau is data-only)
  var s2 = Session.createDualSimplexSession(prob);
  Session.submitQuiz(s2, Session.getCurrent(s2).correct);
  var revived = JSON.parse(JSON.stringify(s2));
  check('dsim-walk: round-trip equal', JSON.stringify(revived) === JSON.stringify(s2));
  var g2 = 0;
  while (revived.status === 'in-progress' && g2++ < 100) {
    var stx = Session.getCurrent(revived);
    if (stx.kind === 'quiz') Session.submitQuiz(revived, stx.correct);
    else if (stx.qtype === 'ratios') Session.submitRatios(revived, stx.correct.map(function (v) { return v === null ? '-' : Parse.formatNumber(v); }));
    else Session.submitGrid(revived, stx.correct.map(function (r) { return r.map(Parse.formatNumber); }));
  }
  check('dsim-walk: revived completes', revived.status === 'dsim-done');
})();

/* ---------- sensitivity analysis (targil 10) ---------- */

// engine matrix inverse (used to reconstruct B⁻¹ from a stored basis)
(function () {
  var inv = Engine.invert([[3, -1, 0], [-2, 4, 0], [-4, 3, 1]]);
  check('engine invert (hw10-q3 B)', eqMat(inv, [[2 / 5, 1 / 10, 0], [1 / 5, 3 / 10, 0], [1, -1 / 2, 1]]), show(inv));
  var i2 = Engine.invert([[2, 0], [0, 2]]);
  check('engine invert diagonal', eqMat(i2, [[0.5, 0], [0, 0.5]]), show(i2));
})();

function walkSensitivity(ex) {
  var s = Session.createSensitivitySession(ex.data);
  var guard = 0;
  while (s.status === 'in-progress' && guard++ < 60) {
    var st = Session.getCurrent(s);
    if (st.kind === 'quiz') Session.submitQuiz(s, st.correct);
    else if (st.qtype === 'grid') Session.submitGrid(s, st.correct.map(function (r) { return r.map(Parse.formatNumber); }));
    else if (st.qtype === 'scalar') Session.submitScalar(s, Parse.formatNumber(st.correct));
    else { check('sens-walk unexpected ' + st.key, false); break; }
  }
  check('sens ' + ex.id + ': done', s.status === 'sensitivity-done' && guard < 60, s.status);
  return s;
}

(function () {
  // optStateFromBasis reproduces the handout's optimal state
  var opt = Session.optStateFromBasis(Exercises.byId['t10-ex3'].data.problem, [3, 2, 1]);
  check('sens opt: xB (glass)', eqVec(opt.xB, [2, 6, 2]), show(opt.xB));
  check('sens opt: y (glass shadow prices)', eqVec(opt.y, [0, 1.5, 1]), show(opt.y));

  // db-max (targil 2): b1 may decrease by at most 2
  var s2 = walkSensitivity(Exercises.byId['t10-ex2']);
  check('sens ex2: max decrease 2', s2.finalResult.sens.conclusion.indexOf('הוא 2') >= 0, s2.finalResult.sens.conclusion);

  // dc-basic (targil 3): rN=(-7/6,-4/3), Z=38, stays optimal
  var s3 = walkSensitivity(Exercises.byId['t10-ex3']);
  check('sens ex3: Z=38 & optimal', s3.finalResult.sens.conclusion.indexOf('Z_new = 38') >= 0 &&
    s3.finalResult.sens.conclusion.indexOf('נשאר אופטימלי') >= 0, s3.finalResult.sens.conclusion);

  // new-var (targil 4): r=1, x3 leaves, Z=37
  var s4 = walkSensitivity(Exercises.byId['t10-ex4']);
  check('sens ex4: enters, x3 leaves, Z=37',
    s4.finalResult.sens.conclusion.indexOf('יוצא x3') >= 0 &&
    s4.finalResult.sens.conclusion.indexOf('Z = 37') >= 0, s4.finalResult.sens.conclusion);
  check('sens ex4: Znew field', eqNum(s4.finalResult.sens.Znew, 37), String(s4.finalResult.sens.Znew));

  // hw10-q3: read solution / shadow / dc-nonbasic-max / db
  walkSensitivity(Exercises.byId['hw10-q3a']);
  walkSensitivity(Exercises.byId['hw10-q3b']);
  var s3c = walkSensitivity(Exercises.byId['hw10-q3c']);
  check('sens q3c: c3 up by 12/5', s3c.finalResult.sens.conclusion.indexOf('12/5') >= 0, s3c.finalResult.sens.conclusion);
  var s3d = walkSensitivity(Exercises.byId['hw10-q3d']);
  check('sens q3d: xB_new feasible (19/5,22/5,12)',
    s3d.finalResult.sens.conclusion.indexOf('19/5') >= 0 &&
    s3d.finalResult.sens.conclusion.indexOf('נשאר ישים') >= 0, s3d.finalResult.sens.conclusion);

  // round-trip a sensitivity session mid-walk
  var sr = Session.createSensitivitySession(Exercises.byId['t10-ex3'].data);
  Session.submitGrid(sr, Session.getCurrent(sr).correct.map(function (r) { return r.map(Parse.formatNumber); }));
  var revived = JSON.parse(JSON.stringify(sr));
  check('sens: round-trip equal', JSON.stringify(revived) === JSON.stringify(sr));
})();

/* ---------- summary ---------- */

console.log('');
if (failed === 0) {
  console.log('ALL TESTS PASSED (' + passed + ')');
} else {
  console.log('FAILURES: ' + failed + ' / ' + (passed + failed));
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exitCode = 1;
}
