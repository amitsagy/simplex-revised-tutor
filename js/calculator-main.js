/* Simplex Tutor — calculator-main.js: bootstraps the standalone
 * row-reduction calculator page (calculator.html). Two modes:
 *  - free row-reduction of any matrix;
 *  - inverse finding: enter a square B, work on [B | I] until the left half
 *    is I — then the right half is B⁻¹ (detected and displayed automatically).
 * Both support manual ops, click-to-pivot, auto-step, and solve-to-end.
 */
(function () {
  'use strict';

  var Parse = window.Simplex.parse;
  var RR = window.Simplex.rowReduce;
  var MI = window.Simplex.matrixInput;
  var RRUI = window.Simplex.rowReduceUI;

  var setupBox = document.getElementById('calc-setup');
  var inputBox = document.getElementById('calc-input');
  var panelBox = document.getElementById('calc-panel');

  var modeSel = document.getElementById('calc-mode');
  var rSel = document.getElementById('calc-rows');
  var cSel = document.getElementById('calc-cols');
  var colsLabel = document.getElementById('calc-cols-label');
  for (var i = 1; i <= 6; i++) {
    rSel.appendChild(new Option(String(i), String(i)));
    cSel.appendChild(new Option(String(i), String(i)));
  }
  rSel.value = '3';
  cSel.value = '4';

  modeSel.addEventListener('change', function () {
    colsLabel.hidden = modeSel.value === 'inverse';
    inputBox.innerHTML = '';
    panelBox.innerHTML = '';
  });

  var grid = null;

  document.getElementById('calc-build').addEventListener('click', function () {
    inputBox.innerHTML = '';
    panelBox.innerHTML = '';
    var inverse = modeSel.value === 'inverse';
    var rows = parseInt(rSel.value, 10);
    var cols = inverse ? rows : parseInt(cSel.value, 10);

    if (inverse) {
      var tip = document.createElement('p');
      tip.className = 'calc-tip';
      tip.innerHTML = 'הזן את המטריצה B (ריבועית). נבנה <span class="ltr-math">[B | I]</span> — ' +
        'כשהחצי השמאלי הופך ל-I, החצי הימני הוא <span class="ltr-math">B⁻¹</span>.';
      inputBox.appendChild(tip);
    }

    grid = MI.create(inputBox, { rows: rows, cols: cols });
    var load = document.createElement('button');
    load.type = 'button';
    load.className = 'btn primary';
    load.textContent = inverse ? 'בנה [B | I] והתחל' : 'טען למחשבון';
    load.addEventListener('click', function () {
      var err = document.getElementById('calc-err');
      err.textContent = '';
      var strs = grid.getStrings();
      var matrix = [];
      for (var r = 0; r < strs.length; r++) {
        var row = [];
        for (var c = 0; c < strs[r].length; c++) {
          var v = Parse.parseNumber(strs[r][c]);
          if (isNaN(v)) {
            err.textContent = 'יש תאים ריקים או לא תקינים — מלא מספר (או שבר a/b) בכל תא.';
            return;
          }
          row.push(v);
        }
        matrix.push(row);
      }
      panelBox.innerHTML = '';

      if (!inverse) {
        RRUI.create(panelBox, {
          matrix: matrix,
          mode: 'standalone',
          autoTarget: { kind: 'rref' },
        });
        return;
      }

      /* inverse mode: augment [B | I], target = RREF of the left half */
      var n = matrix.length;
      var aug = matrix.map(function (rw, ri) {
        var idRow = [];
        for (var k = 0; k < n; k++) idRow.push(k === ri ? 1 : 0);
        return rw.concat(idRow);
      });
      var labels = [];
      for (var b = 1; b <= n; b++) labels.push('B');
      for (var e2 = 1; e2 <= n; e2++) labels.push('I');

      var resultBox = document.createElement('div');
      resultBox.className = 'inverse-result';
      panelBox.appendChild(resultBox);

      function checkDone(cur) {
        if (RR.isIdentityLeft(cur.map(function (rw) { return rw.slice(0, n); }), n)) {
          var inv = cur.map(function (rw) { return rw.slice(n); });
          var h = '<div class="mini-label">🎉 החצי השמאלי הפך ל-I — זו ההופכית B⁻¹:</div>' +
            '<table class="mini-matrix ltr-math">';
          inv.forEach(function (rw) {
            h += '<tr>' + rw.map(function (v) {
              return '<td>' + Parse.formatNumber(v) + '</td>';
            }).join('') + '</tr>';
          });
          resultBox.innerHTML = h + '</table>';
        } else {
          resultBox.innerHTML = '';
        }
      }

      RRUI.create(panelBox, {
        matrix: aug,
        colLabels: labels,
        mode: 'standalone',
        autoTarget: { kind: 'rref', cols: n },
        onOp: checkDone,
      });
      checkDone(aug);
    });
    inputBox.appendChild(load);
    var err = document.createElement('p');
    err.id = 'calc-err';
    err.className = 'error-msg';
    inputBox.appendChild(err);
  });

  setupBox.hidden = false;
})();
