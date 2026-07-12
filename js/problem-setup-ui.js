/* Simplex Tutor — problem-setup-ui.js
 * "New exercise" form: n, m, then coefficient grids for c, A, b.
 * MVP scope: Max, <= constraints only, b >= 0 (rejected inline otherwise).
 */
(function () {
  'use strict';

  var Parse = window.Simplex.parse;
  var MI = window.Simplex.matrixInput;
  var Generator = window.Simplex.generator;
  var Exercises = window.Simplex.exercises;

  var TYPE_CHIP = {
    forward: '🔁 סימפלקס', reverse: '🔍 שחזור', 'reverse-data': '🔍 שחזור',
    duality: '🔄 דואליות', dualsimplex: '⚙️ ס׳ דואלי', sensitivity: '🎛️ רגישות',
    guided: '🧭 מודרך', reading: '📖 הוכחה',
  };

  var EXAMPLES = [
    {
      name: 'דוגמת הכיתה (תרגיל 1 בתרגול)',
      problem: { n: 2, m: 3, c: [3, 5], A: [[1, 0], [0, 2], [3, 2]], b: [4, 12, 18] },
    },
    {
      name: 'תרגיל בית 1א׳ (לא חסום)',
      problem: { n: 3, m: 2, c: [10, -16, 1], A: [[1, -3, 1], [1, -1, -1]], b: [2, 4] },
    },
  ];

  function init(container, onStart, onStartReverse, onStartExercise) {
    container.innerHTML = '';

    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<h2>תרגיל חדש</h2>' +
      '<p>הזן בעיית מקסימום בצורה: <span class="ltr-math">Max Z = cᵀx , Ax ≤ b , x ≥ 0</span> (כל רכיבי b אי-שליליים).</p>';
    container.appendChild(card);

    var sizeRow = document.createElement('div');
    sizeRow.className = 'size-row';
    sizeRow.innerHTML =
      '<label>מספר משתנים (n): <select id="setup-n"></select></label> ' +
      '<label>מספר אילוצים (m): <select id="setup-m"></select></label> ';
    card.appendChild(sizeRow);

    var nSel = sizeRow.querySelector('#setup-n');
    var mSel = sizeRow.querySelector('#setup-m');
    for (var i = 1; i <= 5; i++) {
      nSel.appendChild(new Option(String(i), String(i)));
      mSel.appendChild(new Option(String(i), String(i)));
    }
    nSel.value = '2';
    mSel.value = '3';

    var buildBtn = document.createElement('button');
    buildBtn.type = 'button';
    buildBtn.className = 'btn primary';
    buildBtn.textContent = 'בנה טבלאות מקדמים';
    sizeRow.appendChild(buildBtn);

    var examRow = document.createElement('p');
    examRow.className = 'exam-toggle-row';
    var examChk = document.createElement('input');
    examChk.type = 'checkbox';
    examChk.id = 'exam-toggle';
    var examLbl = document.createElement('label');
    examLbl.htmlFor = 'exam-toggle';
    examLbl.innerHTML = ' 📝 <b>מצב מבחן</b> — בלי רמזים ובלי "חשב עבורי", עם שעון וציון בסוף';
    examRow.appendChild(examChk);
    examRow.appendChild(examLbl);
    card.appendChild(examRow);

    var randomRow = document.createElement('p');
    var randomBtn = document.createElement('button');
    randomBtn.type = 'button';
    randomBtn.className = 'btn primary';
    randomBtn.textContent = '🎲 תרגיל אקראי';
    randomBtn.addEventListener('click', function () {
      var p = Generator.generateProblem({});
      if (!p) { // extremely unlikely; retry with a fresh seed
        p = Generator.generateProblem({ seed: Date.now() >>> 0 });
      }
      if (!p) { window.alert('לא הצלחתי לייצר תרגיל — נסה שוב.'); return; }
      nSel.value = String(p.n);
      mSel.value = String(p.m);
      buildGrids(p);
    });
    randomRow.appendChild(randomBtn);
    randomRow.appendChild(document.createTextNode(' — בעיה חדשה עם מספרים נוחים, נפתרת ב-2–4 איטרציות.'));
    card.appendChild(randomRow);

    if (onStartReverse) {
      var reverseRow = document.createElement('p');
      var reverseBtn = document.createElement('button');
      reverseBtn.type = 'button';
      reverseBtn.className = 'btn';
      reverseBtn.textContent = '🔍 תרגול שחזור (סגנון שאלה 3)';
      reverseBtn.addEventListener('click', function () {
        var p = Generator.generateReverseProblem({});
        if (!p) p = Generator.generateReverseProblem({ seed: Date.now() >>> 0 });
        if (!p) { window.alert('לא הצלחתי לייצר תרגיל שחזור — נסה שוב.'); return; }
        onStartReverse(p);
      });
      reverseRow.appendChild(reverseBtn);
      reverseRow.appendChild(document.createTextNode(' — נתונה טבלה אופטימלית, ומשחזרים את הבעיה המקורית אחורה.'));
      card.appendChild(reverseRow);
    }

    /* random duality / dual-simplex, and the saved-exercise library */
    if (onStartExercise) {
      var moreRow = document.createElement('p');
      moreRow.className = 'more-random-row';
      var dualBtn = document.createElement('button');
      dualBtn.type = 'button';
      dualBtn.className = 'btn';
      dualBtn.textContent = '🔄 דואליות אקראית';
      dualBtn.addEventListener('click', function () {
        onStartExercise({ mode: 'duality', data: Generator.generateDualityProblem({ seed: Date.now() >>> 0 }) },
          { examMode: examChk.checked });
      });
      var dsBtn = document.createElement('button');
      dsBtn.type = 'button';
      dsBtn.className = 'btn';
      dsBtn.textContent = '⚙️ סימפלקס דואלי אקראי';
      dsBtn.addEventListener('click', function () {
        var mp = Generator.generateDualSimplexProblem({ seed: Date.now() >>> 0 });
        if (!mp) { window.alert('לא הצלחתי לייצר תרגיל — נסה שוב.'); return; }
        onStartExercise({ mode: 'dualsimplex', data: mp }, { examMode: examChk.checked });
      });
      moreRow.appendChild(dualBtn);
      moreRow.appendChild(document.createTextNode(' '));
      moreRow.appendChild(dsBtn);
      card.appendChild(moreRow);

      buildLibrary(card, onStartExercise, function () { return examChk.checked; });
    }

    var exampleRow = document.createElement('p');
    exampleRow.appendChild(document.createTextNode('או טען דוגמה מחומרי הקורס: '));
    EXAMPLES.forEach(function (ex) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = ex.name;
      b.addEventListener('click', function () {
        nSel.value = String(ex.problem.n);
        mSel.value = String(ex.problem.m);
        buildGrids(ex.problem);
      });
      exampleRow.appendChild(b);
    });
    card.appendChild(exampleRow);

    var gridsBox = document.createElement('div');
    card.appendChild(gridsBox);

    buildBtn.addEventListener('click', function () { buildGrids(null); });

    function varLabels(n) {
      var out = [];
      for (var v = 1; v <= n; v++) out.push('x<sub>' + v + '</sub>');
      return out;
    }

    function toStrings(nums) {
      return nums.map(function (row) { return row.map(Parse.formatNumber); });
    }

    function buildGrids(prefill) {
      var n = parseInt(nSel.value, 10);
      var m = parseInt(mSel.value, 10);
      gridsBox.innerHTML = '';

      var cBox = section(gridsBox, 'מקדמי פונקציית המטרה c:');
      var cGrid = MI.create(cBox, {
        rows: 1, cols: n, colLabels: varLabels(n),
        values: prefill ? toStrings([prefill.c]) : null,
      });

      var aBox = section(gridsBox, 'מקדמי האילוצים A:');
      var aGrid = MI.create(aBox, {
        rows: m, cols: n, colLabels: varLabels(n),
        values: prefill ? toStrings(prefill.A) : null,
      });

      var bBox = section(gridsBox, 'אגף ימין b (חייב להיות ≥ 0):');
      var bGrid = MI.create(bBox, {
        rows: m, cols: 1,
        values: prefill ? toStrings(prefill.b.map(function (v) { return [v]; })) : null,
      });

      var err = document.createElement('p');
      err.className = 'error-msg';
      gridsBox.appendChild(err);

      var startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'btn primary big';
      startBtn.textContent = 'התחל תרגול ←';
      startBtn.addEventListener('click', function () {
        err.textContent = '';
        var c = parseRow(cGrid.getStrings()[0]);
        var A = aGrid.getStrings().map(parseRow);
        var b = parseRow(bGrid.getStrings().map(function (r) { return r[0]; }));
        if (c === null || A.some(function (r) { return r === null; }) || b === null) {
          err.textContent = 'יש תאים ריקים או לא תקינים — מלא מספר (או שבר a/b) בכל תא.';
          return;
        }
        if (b.some(function (v) { return v < 0; })) {
          err.textContent = 'כל רכיבי b חייבים להיות אי-שליליים (זה מה שמבטיח שבסיס הסרק ההתחלתי ישים).';
          return;
        }
        onStart({ n: n, m: m, c: c, A: A, b: b }, { examMode: examChk.checked });
      });
      gridsBox.appendChild(startBtn);
    }

    function parseRow(strs) {
      var out = [];
      for (var i = 0; i < strs.length; i++) {
        var v = Parse.parseNumber(strs[i]);
        if (isNaN(v)) return null;
        out.push(v);
      }
      return out;
    }

    function section(parent, title) {
      var box = document.createElement('div');
      box.className = 'setup-section';
      var h = document.createElement('h3');
      h.textContent = title;
      box.appendChild(h);
      parent.appendChild(box);
      return box;
    }
  }

  /** The saved-exercise library: a collapsible, grouped picker. */
  function buildLibrary(card, onStartExercise, getExam) {
    if (!Exercises || !Exercises.list.length) return;
    var row = document.createElement('p');
    var libBtn = document.createElement('button');
    libBtn.type = 'button';
    libBtn.className = 'btn primary';
    libBtn.textContent = '📚 בחר תרגיל מהתרגולים';
    row.appendChild(libBtn);
    row.appendChild(document.createTextNode(' — כל התרגילים מתרגולים 8–10, שמורים לפי מצב התרגול המתאים.'));
    card.appendChild(row);

    var panel = document.createElement('div');
    panel.className = 'library-panel';
    panel.hidden = true;
    card.appendChild(panel);

    var built = false;
    libBtn.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      if (built) return;
      built = true;
      // group entries by source-group, in the course order
      var byGroup = {};
      Exercises.list.forEach(function (e) {
        var g = Exercises.groupOf(e);
        (byGroup[g] = byGroup[g] || []).push(e);
      });
      var groups = Exercises.GROUP_ORDER.filter(function (g) { return byGroup[g]; });
      Object.keys(byGroup).forEach(function (g) { if (groups.indexOf(g) < 0) groups.push(g); });
      groups.forEach(function (g) {
        var h = document.createElement('h4');
        h.className = 'lib-group';
        h.textContent = g;
        panel.appendChild(h);
        byGroup[g].forEach(function (e) {
          var item = document.createElement('div');
          item.className = 'lib-item';
          var meta = document.createElement('span');
          meta.className = 'lib-meta';
          meta.innerHTML = '<span class="lib-chip">' + (TYPE_CHIP[e.mode] || e.mode) + '</span>' +
            '<span class="lib-title">' + e.source + ' · ' + e.title + '</span>';
          var open = document.createElement('button');
          open.type = 'button';
          open.className = 'btn lib-open';
          open.textContent = e.mode === 'reading' ? 'קרא ↗' : 'פתח ←';
          open.addEventListener('click', function () {
            onStartExercise(e, { examMode: getExam() });
          });
          item.appendChild(meta);
          item.appendChild(open);
          panel.appendChild(item);
        });
      });
    });
  }

  window.Simplex = window.Simplex || {};
  window.Simplex.problemSetupUI = { init: init };
})();
