/* Simplex Tutor — mult-scratch.js
 * Dedicated matrix-multiplication work area: two operand grids (prefilled
 * with the step's data, or cleared for self-entry — user's choice), a product
 * the student fills and checks (or lets the platform compute), and — for rN —
 * an extra subtraction stage (cN − yᵀN) so the confusing minus is SEEN.
 * The scratch pad never bypasses grading: "use as answer" feeds the result
 * back through the step's normal check.
 */
(function () {
  'use strict';

  var Engine = window.Simplex.engine;
  var Parse = window.Simplex.parse;
  var Check = window.Simplex.answerCheck;
  var MI = window.Simplex.matrixInput;

  function fmtGrid(values) {
    return values.map(function (row) { return row.map(Parse.formatNumber); });
  }

  function blankGrid(values) {
    return values.map(function (row) { return row.map(function () { return ''; }); });
  }

  function parseGrid(mi) {
    var strs = mi.getStrings();
    var out = [];
    for (var i = 0; i < strs.length; i++) {
      var row = [];
      for (var j = 0; j < strs[i].length; j++) {
        var v = Parse.parseNumber(strs[i][j]);
        if (isNaN(v)) return null;
        row.push(v);
      }
      out.push(row);
    }
    return out;
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function btn(label, cls, onClick) {
    var b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  /**
   * opts: {
   *   A: {label, values}, B: {label, values},   // operands (numbers define shape + prefill)
   *   D: {label, values} | null,                // rN only: result = D − A·B
   *   resultLabel,
   *   onUseResult(strings2d)                    // copy final result into the step's answer
   * }
   */
  function create(container, opts) {
    var root = el('div', 'scratch');
    container.appendChild(root);

    var hasD = !!opts.D;
    root.appendChild(el('p', 'calc-tip', hasD
      ? 'אזור חישוב: קודם הכפל <b>' + opts.A.label + ' · ' + opts.B.label +
        '</b>, ואז חַסֵּר את התוצאה מ-<b>' + opts.D.label + '</b>. בכל שלב — חשב בעצמך ובדוק, או תן לפלטפורמה לחשב.'
      : 'אזור חישוב: הכפל <b>' + opts.A.label + ' · ' + opts.B.label +
        '</b>. חשב בעצמך ובדוק, או תן לפלטפורמה לחשב.'));

    /* --- operands --- */
    var opsRow = el('div', 'scratch-row ltr-math');
    root.appendChild(opsRow);

    function operandBox(spec) {
      var box = el('div', 'scratch-operand');
      box.appendChild(el('div', 'mini-label', spec.label));
      var grid = MI.create(box, {
        rows: spec.values.length,
        cols: spec.values[0].length,
        values: fmtGrid(spec.values),
      });
      opsRow.appendChild(box);
      return grid;
    }

    var gridA = operandBox(opts.A);
    opsRow.appendChild(el('span', 'scratch-op-sign', '×'));
    var gridB = operandBox(opts.B);

    var loadRow = el('div', 'scratch-controls');
    loadRow.appendChild(btn('טען את נתוני השלב', 'btn', function () {
      gridA.setStrings(fmtGrid(opts.A.values));
      gridB.setStrings(fmtGrid(opts.B.values));
      if (gridD) gridD.setStrings(fmtGrid(opts.D.values));
      msg.textContent = '';
    }));
    loadRow.appendChild(btn('נקה (הזנה עצמית)', 'btn', function () {
      gridA.setStrings(blankGrid(opts.A.values));
      gridB.setStrings(blankGrid(opts.B.values));
      if (gridD) gridD.setStrings(blankGrid(opts.D.values));
      msg.textContent = '';
    }));
    root.appendChild(loadRow);

    /* --- product stage --- */
    var prodRows = opts.A.values.length;
    var prodCols = opts.B.values[0].length;
    var prodLabel = hasD ? opts.A.label + '·' + opts.B.label : opts.resultLabel;

    root.appendChild(el('div', 'scratch-stage-title',
      'שלב א: המכפלה <span class="ltr-math">' + prodLabel + '</span>'));
    var prodRow = el('div', 'scratch-row ltr-math');
    root.appendChild(prodRow);
    prodRow.appendChild(el('span', 'scratch-op-sign', '='));
    var prodBox = el('div', 'scratch-operand');
    var gridP = MI.create(prodBox, { rows: prodRows, cols: prodCols });
    prodRow.appendChild(prodBox);

    var prodBtns = el('div', 'scratch-controls');
    root.appendChild(prodBtns);

    function computedProduct() {
      var A = parseGrid(gridA);
      var B = parseGrid(gridB);
      if (!A || !B) {
        msg.textContent = 'יש תאים חסרים/לא תקינים במטריצות המקור — מלא אותן או לחץ "טען את נתוני השלב".';
        return null;
      }
      return Engine.matMul(A, B);
    }

    function markGrid(mi, res) {
      res.cells.forEach(function (row, i) {
        row.forEach(function (cell, j) {
          mi.setCellStatus(i, j, cell.ok ? 'ok' : (cell.invalid ? 'invalid' : 'bad'));
        });
      });
    }

    prodBtns.appendChild(btn('בדוק את הכפל שלי', 'btn', function () {
      var correct = computedProduct();
      if (!correct) return;
      var res = Check.checkGrid(gridP.getStrings(), correct);
      markGrid(gridP, res);
      msg.textContent = res.ok ? 'הכפל נכון!' : 'יש תאים שגויים במכפלה (שורה של A כפול עמודה של B, איבר-איבר).';
    }));
    prodBtns.appendChild(btn('חשב עבורי', 'btn', function () {
      var correct = computedProduct();
      if (!correct) return;
      gridP.setStrings(fmtGrid(correct));
      gridP.clearStatuses();
      msg.textContent = 'המכפלה חושבה מהערכים שבמטריצות המקור.';
    }));

    /* --- subtraction stage (rN) --- */
    var gridD = null;
    var gridR = null;
    if (hasD) {
      root.appendChild(el('div', 'scratch-stage-title',
        'שלב ב: החיסור <span class="ltr-math">' + opts.resultLabel + ' = ' +
        opts.D.label + ' − ' + prodLabel + '</span>'));
      var diffRow = el('div', 'scratch-row ltr-math');
      root.appendChild(diffRow);

      var dBox = el('div', 'scratch-operand');
      dBox.appendChild(el('div', 'mini-label', opts.D.label));
      gridD = MI.create(dBox, {
        rows: opts.D.values.length,
        cols: opts.D.values[0].length,
        values: fmtGrid(opts.D.values),
      });
      diffRow.appendChild(dBox);
      diffRow.appendChild(el('span', 'scratch-op-sign', '−'));
      diffRow.appendChild(el('span', 'scratch-note', '(המכפלה משלב א)'));
      diffRow.appendChild(el('span', 'scratch-op-sign', '='));
      var rBox = el('div', 'scratch-operand');
      rBox.appendChild(el('div', 'mini-label', opts.resultLabel));
      gridR = MI.create(rBox, { rows: opts.D.values.length, cols: opts.D.values[0].length });
      diffRow.appendChild(rBox);

      var diffBtns = el('div', 'scratch-controls');
      root.appendChild(diffBtns);

      function computedDiff() {
        var product = computedProduct();
        var D = parseGrid(gridD);
        if (!product || !D) return null;
        return D.map(function (row, i) {
          return row.map(function (v, j) { return v - product[i][j]; });
        });
      }

      diffBtns.appendChild(btn('בדוק את החיסור שלי', 'btn', function () {
        var correct = computedDiff();
        if (!correct) return;
        var res = Check.checkGrid(gridR.getStrings(), correct);
        markGrid(gridR, res);
        msg.textContent = res.ok ? 'החיסור נכון!' : 'יש תאים שגויים — לכל עמודה: ' +
          opts.D.label + ' פחות איבר המכפלה המתאים.';
      }));
      diffBtns.appendChild(btn('חשב עבורי', 'btn', function () {
        var correct = computedDiff();
        if (!correct) return;
        gridR.setStrings(fmtGrid(correct));
        gridR.clearStatuses();
        msg.textContent = 'החיסור חושב מהערכים שהוזנו.';
      }));
    }

    var msg = el('p', 'rr-msg');
    root.appendChild(msg);

    root.appendChild(btn('השתמש בתוצאה כתשובה ←', 'btn primary', function () {
      var finalGrid = hasD ? gridR : gridP;
      var strs = finalGrid.getStrings();
      var hasEmpty = strs.some(function (row) {
        return row.some(function (v) { return String(v).trim() === ''; });
      });
      if (hasEmpty) {
        msg.textContent = 'התוצאה עדיין ריקה — מלא אותה או לחץ "חשב עבורי".';
        return;
      }
      opts.onUseResult(strs);
    }));

    return { root: root };
  }

  window.Simplex = window.Simplex || {};
  window.Simplex.multScratch = { create: create };
})();
