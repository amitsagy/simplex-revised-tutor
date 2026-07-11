/* Simplex Tutor — row-reduce-ui.js
 * UI for the elementary-row-operations calculator, shared by:
 *  - standalone (calculator.html): free matrix or inverse-finding [B|I].
 *  - embedded (step 5): preloaded with [B⁻¹ | n̄q]; "accept" submits through
 *    the step's normal grading path — the tool never bypasses grading.
 *
 * Three convenience levels so the algebra never blocks the learning:
 *  1. Manual ops (scale / add-multiple / swap) with a log and undo.
 *  2. CLICK A CELL to pivot on it — one click makes it 1 and clears its column.
 *  3. Auto: "צעד אוטומטי" applies the next single op toward the target
 *     (logged, so you SEE the derivation); "פתור עד הסוף" runs them all.
 */
(function () {
  'use strict';

  var RR = window.Simplex.rowReduce;
  var Parse = window.Simplex.parse;
  var Check = window.Simplex.answerCheck;

  /**
   * opts: {
   *   matrix: number[][], colLabels?: string[] (HTML),
   *   mode: 'standalone' | 'embedded',
   *   autoTarget?: {kind:'pivot', row, col} | {kind:'rref', cols?},
   *   correctLeft?: number[][],       // embedded: expected left block (B⁻¹)
   *   onAccept?: fn(strings2d),       // embedded: submit left block
   *   onOp?: fn(currentMatrix)        // fired after every applied/undone op
   * }
   */
  function create(container, opts) {
    var stack = [RR.cloneMatrix(opts.matrix)];
    var log = [];
    var m = opts.matrix.length;

    var root = document.createElement('div');
    root.className = 'rr-panel';
    container.appendChild(root);

    var matrixBox = document.createElement('div');
    var controls = document.createElement('div');
    controls.className = 'rr-controls';
    var autoControls = document.createElement('div');
    autoControls.className = 'rr-controls';
    var msg = document.createElement('p');
    msg.className = 'rr-msg';
    var logBox = document.createElement('ol');
    logBox.className = 'rr-log ltr-math';
    root.appendChild(matrixBox);
    root.appendChild(controls);
    root.appendChild(autoControls);
    root.appendChild(msg);
    root.appendChild(logBox);

    function current() { return stack[stack.length - 1]; }

    function describeOp(op) {
      if (op.type === 'scale') {
        return 'R' + (op.row + 1) + ' ← (' + Parse.formatNumber(op.k) + ')·R' + (op.row + 1);
      }
      if (op.type === 'addMultiple') {
        return 'R' + (op.target + 1) + ' ← R' + (op.target + 1) +
          ' + (' + Parse.formatNumber(op.k) + ')·R' + (op.source + 1);
      }
      return 'R' + (op.a + 1) + ' ↔ R' + (op.b + 1);
    }

    function pushOp(op, prefix) {
      stack.push(RR.applyRowOp(current(), op));
      log.push((prefix || '') + describeOp(op));
      render();
      if (opts.onOp) opts.onOp(current());
    }

    /* --- click a cell to pivot on it --- */
    matrixBox.addEventListener('click', function (e) {
      var td = e.target.closest('td[data-i]');
      if (!td) return;
      var i = parseInt(td.dataset.i, 10);
      var j = parseInt(td.dataset.j, 10);
      var cur = current();
      if (Math.abs(cur[i][j]) < 1e-10) {
        msg.textContent = 'אי אפשר לבצע פיבוט על 0 — בחר תא אחר.';
        return;
      }
      stack.push(RR.pivotEliminate(cur, i, j));
      log.push('פיבוט על R' + (i + 1) + ',C' + (j + 1) + ' (הפיכה ל-1 ואיפוס העמודה)');
      msg.textContent = '';
      render();
      if (opts.onOp) opts.onOp(current());
    });

    function rowSelect() {
      var sel = document.createElement('select');
      for (var i = 0; i < m; i++) {
        var o = document.createElement('option');
        o.value = String(i);
        o.textContent = 'R' + (i + 1);
        sel.appendChild(o);
      }
      return sel;
    }

    function kInput() {
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.dir = 'ltr';
      inp.className = 'k-input';
      inp.placeholder = 'k';
      return inp;
    }

    /* --- manual op controls --- */
    var typeSel = document.createElement('select');
    [['addMultiple', 'Ri ← Ri + k·Rj'], ['scale', 'Ri ← k·Ri'], ['swap', 'Ri ↔ Rj']]
      .forEach(function (t) {
        var o = document.createElement('option');
        o.value = t[0];
        o.textContent = t[1];
        typeSel.appendChild(o);
      });

    var fields = document.createElement('span');
    fields.className = 'rr-fields ltr-math';
    var current_fields = {};

    function renderFields() {
      fields.innerHTML = '';
      current_fields = {};
      var t = typeSel.value;
      function add(label, el2) {
        var wrap = document.createElement('label');
        wrap.className = 'rr-field';
        wrap.appendChild(document.createTextNode(label + ' '));
        wrap.appendChild(el2);
        fields.appendChild(wrap);
      }
      if (t === 'addMultiple') {
        current_fields.target = rowSelect();
        current_fields.k = kInput();
        current_fields.source = rowSelect();
        add('Ri:', current_fields.target);
        add('k:', current_fields.k);
        add('Rj:', current_fields.source);
      } else if (t === 'scale') {
        current_fields.row = rowSelect();
        current_fields.k = kInput();
        add('Ri:', current_fields.row);
        add('k:', current_fields.k);
      } else {
        current_fields.a = rowSelect();
        current_fields.b = rowSelect();
        add('Ri:', current_fields.a);
        add('Rj:', current_fields.b);
      }
    }
    typeSel.addEventListener('change', renderFields);
    renderFields();

    var applyBtn = button('בצע פעולה', function () {
      msg.textContent = '';
      var t = typeSel.value;
      if (t === 'addMultiple') {
        var k1 = Parse.parseNumber(current_fields.k.value);
        var tg = parseInt(current_fields.target.value, 10);
        var sr = parseInt(current_fields.source.value, 10);
        if (isNaN(k1)) { msg.textContent = 'k לא תקין (מספר או שבר a/b)'; return; }
        if (tg === sr) { msg.textContent = 'בחר שתי שורות שונות'; return; }
        pushOp({ type: 'addMultiple', target: tg, source: sr, k: k1 });
      } else if (t === 'scale') {
        var k2 = Parse.parseNumber(current_fields.k.value);
        var rw = parseInt(current_fields.row.value, 10);
        if (isNaN(k2) || k2 === 0) { msg.textContent = 'k חייב להיות מספר שונה מאפס'; return; }
        pushOp({ type: 'scale', row: rw, k: k2 });
      } else {
        var a = parseInt(current_fields.a.value, 10);
        var b = parseInt(current_fields.b.value, 10);
        if (a === b) { msg.textContent = 'בחר שתי שורות שונות'; return; }
        pushOp({ type: 'swap', a: a, b: b });
      }
    });

    var undoBtn = button('בטל פעולה אחרונה', function () {
      if (stack.length > 1) {
        stack.pop();
        log.pop();
        msg.textContent = '';
        render();
        if (opts.onOp) opts.onOp(current());
      }
    });

    controls.appendChild(typeSel);
    controls.appendChild(fields);
    controls.appendChild(applyBtn);
    controls.appendChild(undoBtn);

    /* --- auto solve toward the target --- */

    function nextAutoOp() {
      var cur = current();
      var t = opts.autoTarget;
      if (!t) return null;
      if (t.kind === 'pivot') return RR.nextPivotOp(cur, t.row, t.col);
      return RR.nextRrefOp(cur, t.cols);
    }

    if (opts.autoTarget && !opts.examMode) {
      autoControls.appendChild(button('צעד אוטומטי ▶', function () {
        var op = nextAutoOp();
        if (!op) { msg.textContent = 'סיימנו — אין עוד צעדים לביצוע.'; return; }
        pushOp(op, '🤖 ');
        msg.textContent = '';
      }));
      autoControls.appendChild(button('פתור עד הסוף ⏩', function () {
        var op = nextAutoOp();
        var n = 0;
        while (op && n++ < 300) {
          pushOp(op, '🤖 ');
          op = nextAutoOp();
        }
        msg.textContent = 'הדירוג הושלם — כל הצעדים מתועדים ביומן למטה.';
      }));
    }

    if (opts.mode === 'embedded') {
      if (!opts.examMode) autoControls.appendChild(button('בדוק מול B⁻¹ הנכון', function () {
        var cur = current();
        var mCols = opts.correctLeft[0].length;
        var allOk = true;
        renderMatrixView(cur, function (i, j) {
          if (j >= mCols) return '';
          var ok = Check.matches(cur[i][j], opts.correctLeft[i][j]);
          if (!ok) allOk = false;
          return ok ? 'ok' : 'bad';
        });
        msg.textContent = allOk
          ? 'העמודות השמאליות תואמות את B⁻¹ הנכון — אפשר לאשר!'
          : 'יש תאים שגויים (מסומנים באדום) — המשך בפעולות שורה או בטל.';
      }));
      autoControls.appendChild(button('אשר והשתמש בתשובה זו', function () {
        var cur = current();
        var mCols = opts.correctLeft[0].length;
        var strings = cur.map(function (row) {
          return row.slice(0, mCols).map(Parse.formatNumber);
        });
        opts.onAccept(strings);
      }));
    }

    function button(label, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    }

    function renderMatrixView(mat, statusFn) {
      var h = '<table class="mini-matrix pivotable ltr-math">';
      if (opts.colLabels) {
        h += '<tr>';
        opts.colLabels.forEach(function (l) { h += '<th>' + l + '</th>'; });
        h += '</tr>';
      }
      mat.forEach(function (row, i) {
        h += '<tr>';
        row.forEach(function (v, j) {
          var cls = statusFn ? statusFn(i, j) : '';
          h += '<td class="' + cls + '" data-i="' + i + '" data-j="' + j +
            '" title="לחיצה = פיבוט על התא (הופך ל-1 ומאפס את העמודה)">' +
            Parse.formatNumber(v) + '</td>';
        });
        h += '</tr>';
      });
      h += '</table><div class="pivot-hint">💡 אפשר ללחוץ על תא כדי לבצע עליו פיבוט מלא בלחיצה אחת</div>';
      matrixBox.innerHTML = h;
    }

    function render() {
      renderMatrixView(current(), null);
      logBox.innerHTML = '';
      log.forEach(function (line) {
        var li = document.createElement('li');
        li.textContent = line;
        logBox.appendChild(li);
      });
    }

    render();

    return {
      root: root,
      getCurrent: function () { return RR.cloneMatrix(current()); },
    };
  }

  window.Simplex = window.Simplex || {};
  window.Simplex.rowReduceUI = { create: create };
})();
