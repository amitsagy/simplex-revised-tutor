/* Simplex Tutor — answer-check.js
 * Compares user-typed answers against the engine's authoritative values.
 * Tolerance is deliberately looser than the engine's internal epsilon so that
 * hand-rounded decimals (e.g. 0.333 for 1/3) are accepted.
 */
(function () {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var Parse = isNode ? require('./parse.js') : window.Simplex.parse;

  /* Loose enough to accept 3-decimal hand rounding (0.333 for 1/3, like the
   * course handouts), tight enough to reject real mistakes. */
  var ABS_TOL = 5e-4;
  var REL_TOL = 1e-3;

  function matches(a, b) {
    return Math.abs(a - b) <= ABS_TOL + REL_TOL * Math.max(Math.abs(a), Math.abs(b));
  }

  /** -> { value, invalid, ok } */
  function checkScalar(str, correct) {
    var v = Parse.parseNumber(str);
    var invalid = isNaN(v);
    return { value: v, invalid: invalid, ok: !invalid && matches(v, correct) };
  }

  /** strs, correct: 2d arrays of identical shape. -> { ok, cells[i][j] = {value,invalid,ok} } */
  function checkGrid(strs, correct) {
    var ok = true;
    var cells = correct.map(function (row, i) {
      return row.map(function (c, j) {
        var res = checkScalar(strs[i] ? strs[i][j] : '', c);
        if (!res.ok) ok = false;
        return res;
      });
    });
    return { ok: ok, cells: cells };
  }

  var DASH_RE = /^[-—–xX*]$/;

  /**
   * Ratio-test vector: correct[i] is a number or null (no valid ratio).
   * A null must be answered with a dash-like token; a number is tolerance-checked.
   * -> { ok, cells[i] = {value, invalid, ok} }
   */
  function checkRatioVec(strs, correct) {
    var ok = true;
    var cells = correct.map(function (c, i) {
      var raw = (strs[i] == null ? '' : String(strs[i])).trim();
      var res;
      if (c === null) {
        var isDash = DASH_RE.test(raw);
        res = {
          value: null,
          invalid: raw !== '' && !isDash && isNaN(Parse.parseNumber(raw)),
          ok: isDash,
        };
      } else {
        res = checkScalar(raw, c);
      }
      if (!res.ok) ok = false;
      return res;
    });
    return { ok: ok, cells: cells };
  }

  /** Order-sensitive integer list comparison. -> { ok, cells: boolean[] } */
  function checkIndexList(values, correct) {
    var ok = true;
    var cells = correct.map(function (c, i) {
      var good = values[i] === c;
      if (!good) ok = false;
      return good;
    });
    return { ok: ok, cells: cells };
  }

  var api = {
    matches: matches,
    checkScalar: checkScalar,
    checkGrid: checkGrid,
    checkRatioVec: checkRatioVec,
    checkIndexList: checkIndexList,
    ABS_TOL: ABS_TOL,
    REL_TOL: REL_TOL,
  };

  if (typeof window !== 'undefined') {
    window.Simplex = window.Simplex || {};
    window.Simplex.answerCheck = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
