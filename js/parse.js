/* Simplex Tutor — parse.js
 * Text -> number parsing (decimal or "a/b" fraction) and display formatting.
 * Runs both as a classic browser script (window.Simplex.parse) and in Node
 * (module.exports) so the test harness exercises the exact same code.
 */
(function () {
  'use strict';

  var NUM_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

  /** Parse "3", "-2.5", ".5", "1/3", "-4/6" (also unicode minus). NaN on anything else. */
  function parseNumber(str) {
    if (typeof str !== 'string') return NaN;
    var s = str.trim().replace(/−/g, '-');
    if (s === '') return NaN;
    var parts = s.split('/');
    if (parts.length === 2) {
      var num = parts[0].trim();
      var den = parts[1].trim();
      if (!NUM_RE.test(num) || !NUM_RE.test(den)) return NaN;
      var d = parseFloat(den);
      if (d === 0) return NaN;
      return parseFloat(num) / d;
    }
    if (parts.length > 2) return NaN;
    if (!NUM_RE.test(s)) return NaN;
    return parseFloat(s);
  }

  /** Display: integers as-is; simple fractions (den<=12) as "a/b"; else 4 decimals. */
  function formatNumber(x) {
    if (typeof x !== 'number' || !isFinite(x)) return String(x);
    var r = Math.round(x);
    if (Math.abs(x - r) < 1e-9) return String(r === 0 ? 0 : r);
    for (var den = 2; den <= 12; den++) {
      var n = x * den;
      var rn = Math.round(n);
      if (Math.abs(n - rn) < 1e-9) return rn + '/' + den;
    }
    return String(Math.round(x * 10000) / 10000);
  }

  var api = { parseNumber: parseNumber, formatNumber: formatNumber };

  if (typeof window !== 'undefined') {
    window.Simplex = window.Simplex || {};
    window.Simplex.parse = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
