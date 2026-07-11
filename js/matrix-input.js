/* Simplex Tutor — matrix-input.js
 * Reusable vector/matrix <input> grid. Each cell is dir="ltr" individually so
 * numbers read correctly inside the RTL page. Cell-level status coloring.
 */
(function () {
  'use strict';

  var STATUSES = ['ok', 'bad', 'revealed', 'invalid'];

  /**
   * opts: { rows, cols, colLabels?: string[] (HTML), rowLabels?: string[] (HTML),
   *         values?: string[][], onEnter?: fn }
   */
  function create(container, opts) {
    var root = document.createElement('div');
    root.className = 'matrix-widget';
    var table = document.createElement('table');
    table.className = 'matrix-grid ltr-math';
    var inputs = [];

    if (opts.colLabels) {
      var head = document.createElement('tr');
      if (opts.rowLabels) head.appendChild(document.createElement('th'));
      opts.colLabels.forEach(function (lab) {
        var th = document.createElement('th');
        th.innerHTML = lab;
        head.appendChild(th);
      });
      table.appendChild(head);
    }

    for (var i = 0; i < opts.rows; i++) {
      var tr = document.createElement('tr');
      if (opts.rowLabels) {
        var th = document.createElement('th');
        th.innerHTML = opts.rowLabels[i] || '';
        tr.appendChild(th);
      }
      var rowInputs = [];
      for (var j = 0; j < opts.cols; j++) {
        var td = document.createElement('td');
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.dir = 'ltr';
        inp.className = 'cell';
        inp.autocomplete = 'off';
        inp.spellcheck = false;
        if (opts.values && opts.values[i] && opts.values[i][j] != null) {
          inp.value = opts.values[i][j];
        }
        if (opts.onEnter) {
          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') opts.onEnter();
          });
        }
        td.appendChild(inp);
        tr.appendChild(td);
        rowInputs.push(inp);
      }
      inputs.push(rowInputs);
      table.appendChild(tr);
    }

    root.appendChild(table);
    container.appendChild(root);

    function eachCell(fn) {
      inputs.forEach(function (row, i) {
        row.forEach(function (inp, j) { fn(inp, i, j); });
      });
    }

    return {
      root: root,
      getStrings: function () {
        return inputs.map(function (row) {
          return row.map(function (inp) { return inp.value; });
        });
      },
      setStrings: function (vals) {
        eachCell(function (inp, i, j) {
          if (vals[i] && vals[i][j] != null) inp.value = vals[i][j];
        });
      },
      setCellStatus: function (i, j, status) {
        var inp = inputs[i][j];
        STATUSES.forEach(function (s) { inp.classList.remove(s); });
        if (status) inp.classList.add(status);
      },
      clearStatuses: function () {
        eachCell(function (inp) {
          STATUSES.forEach(function (s) { inp.classList.remove(s); });
        });
      },
      disable: function () {
        eachCell(function (inp) { inp.disabled = true; });
      },
      focusFirst: function () {
        if (inputs[0] && inputs[0][0]) inputs[0][0].focus();
      },
    };
  }

  window.Simplex = window.Simplex || {};
  window.Simplex.matrixInput = { create: create };
})();
