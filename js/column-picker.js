/* Simplex Tutor — column-picker.js
 * Builds the B / N matrices by CLICKING columns of the original (A|I) table,
 * in order — choosing WHICH columns (and their order) is the definition being
 * drilled; copying numbers by hand teaches nothing, so it's skipped.
 */
(function () {
  'use strict';

  var Parse = window.Simplex.parse;

  /**
   * opts: { AFull: number[][], expectedCount, onChange? }
   * Returns { root, getPicked, setPicked, reset, markResult(cells: boolean[]), disable }
   */
  function create(container, opts) {
    var picked = [];
    var disabled = false;
    var nTotal = opts.AFull[0].length;

    var root = document.createElement('div');
    root.className = 'column-picker';

    var info = document.createElement('p');
    info.className = 'picker-info';
    root.appendChild(info);

    var table = document.createElement('table');
    table.className = 'pick-table ltr-math';
    var headCells = [];

    var head = document.createElement('tr');
    for (var v = 1; v <= nTotal; v++) {
      (function (varIdx) {
        var th = document.createElement('th');
        th.className = 'pickable';
        th.innerHTML = 'x<sub>' + varIdx + '</sub><span class="order-badge"></span>';
        th.addEventListener('click', function () {
          if (disabled) return;
          var at = picked.indexOf(varIdx);
          if (at >= 0) {
            picked.splice(at, 1);
          } else if (picked.length < opts.expectedCount) {
            picked.push(varIdx);
          }
          update();
          if (opts.onChange) opts.onChange(picked.slice());
        });
        head.appendChild(th);
        headCells.push(th);
      })(v);
    }
    table.appendChild(head);

    opts.AFull.forEach(function (row) {
      var tr = document.createElement('tr');
      row.forEach(function (val) {
        var td = document.createElement('td');
        td.textContent = Parse.formatNumber(val);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });

    root.appendChild(table);
    container.appendChild(root);

    function update() {
      headCells.forEach(function (th, i) {
        var varIdx = i + 1;
        var at = picked.indexOf(varIdx);
        th.classList.toggle('picked', at >= 0);
        th.classList.remove('pick-ok', 'pick-bad');
        th.querySelector('.order-badge').textContent = at >= 0 ? String(at + 1) : '';
      });
      var names = picked.map(function (v) { return 'x' + v; }).join(', ');
      info.innerHTML = picked.length === 0
        ? 'לחץ על כותרות העמודות לפי הסדר הנכון (' + opts.expectedCount + ' עמודות). הסדר קובע!'
        : 'נבחרו לפי סדר: <span class="ltr-math">' + names + '</span> (' +
          picked.length + '/' + opts.expectedCount + ')';
    }

    update();

    return {
      root: root,
      getPicked: function () { return picked.slice(); },
      setPicked: function (list) {
        picked = list.slice(0, opts.expectedCount);
        update();
      },
      reset: function () { picked = []; update(); },
      /** cells[i] = was pick #i correct? Colors the picked headers. */
      markResult: function (cells) {
        picked.forEach(function (varIdx, i) {
          var th = headCells[varIdx - 1];
          th.classList.add(cells[i] ? 'pick-ok' : 'pick-bad');
        });
      },
      disable: function () { disabled = true; root.classList.add('disabled'); },
    };
  }

  window.Simplex = window.Simplex || {};
  window.Simplex.columnPicker = { create: create };
})();
