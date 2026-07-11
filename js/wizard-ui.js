/* Simplex Tutor — wizard-ui.js
 * Renders the current prompt from session.js. Knows shapes and Hebrew copy,
 * not simplex math: every correct answer comes from the session/engine.
 */
(function () {
  'use strict';

  var S = window.Simplex;
  var Parse = S.parse;
  var Engine = S.engine;
  var Session = S.session;
  var MI = S.matrixInput;
  var CP = S.columnPicker;
  var SR = S.stepRecall;
  var RRUI = S.rowReduceUI;
  var MS = S.multScratch;

  var session = null;
  var els = {};
  var onNewProblemCb = null;
  var hintLevel = 0;

  /* back/forward time-travel: serialized snapshots at each prompt boundary */
  var timeline = { past: [], future: [] };
  var lastSnapshot = null;
  var restoring = false;

  /* exam-mode timer: elapsedMs accumulates across steps and survives refresh;
   * examLastResume is a wall-clock anchor kept OFF the serialized session. */
  var examLastResume = 0;
  var examTicker = null;

  function fmtClock(ms) {
    var s = Math.floor(ms / 1000);
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    return mm + ':' + (ss < 10 ? '0' : '') + ss;
  }

  var SHORT_LABELS = {
    Blist: 'B', Bmatrix: 'B (מטריצה)', Binv: 'B⁻¹', cB: 'cB',
    Nlist: 'N', Nmatrix: 'N (מטריצה)', cN: 'cN',
    xB: 'xB', Z: 'Z', y: 'yᵀ', rN: 'rN', aQ: 'aq', nBarQ: 'n̄q',
    ratios: 'מבחן היחס',
  };

  var KEY_DISPLAY = {
    'recall-setup': 'זיהוי השלב הראשון',
    'recall-step2': 'זיהוי השלב (xB ו-Z)', 'recall-step3': 'זיהוי השלב (yᵀ ו-rN)',
    'recall-step4': 'זיהוי השלב (n̄q ומבחן יחס)', 'recall-step5': 'זיהוי השלב (עדכון B)',
    stop1: 'החלטת אופטימליות', entering: 'בחירת משתנה נכנס',
    stop2: 'בדיקת חסימות', leaving: 'בחירת משתנה יוצא (מבחן יחס)',
  };

  /* No step numbers here either — these badges are visible while the next
   * "what's the next step?" question is open, and a number would leak it. */
  var STEP_SHORT = {
    step1: 'בסיס התחלתי', step2: 'xB ו-Z',
    step3: 'yᵀ ו-rN', step4: 'n̄q ומבחן יחס',
    step5: 'עדכון B ו-B⁻¹',
  };

  /* ---------- small helpers ---------- */

  function fmt(x) { return Parse.formatNumber(x); }
  function varSub(v) { return 'x<sub>' + v + '</sub>'; }
  function varLabels(list) { return list.map(varSub); }
  function chipHTML(list) {
    return '<span class="ltr-math chip-set">{' + list.map(varSub).join(', ') + '}</span>';
  }

  /** "B = {x3, x2, x5}" as ONE isolated LTR island (avoids bidi scrambling). */
  function setEqHTML(name, list) {
    return '<span class="ltr-math set-eq"><b>' + name + '</b> = <span class="chip-set">{' +
      list.map(varSub).join(', ') + '}</span></span>';
  }
  function colVec(v) { return v.map(function (x) { return [x]; }); }

  /** Fresh shuffled copy — options are reshuffled on EVERY render so the
   *  student memorizes content, not positions. */
  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
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

  function matrixHTML(values, opts) {
    opts = opts || {};
    var h = '<div class="mini-matrix-wrap">';
    if (opts.label) h += '<div class="mini-label ltr-math">' + opts.label + '</div>';
    h += '<table class="mini-matrix ltr-math">';
    if (opts.colLabels) {
      h += '<tr>';
      if (opts.rowLabels) h += '<th></th>';
      opts.colLabels.forEach(function (l) { h += '<th>' + l + '</th>'; });
      h += '</tr>';
    }
    values.forEach(function (row, i) {
      h += '<tr>';
      if (opts.rowLabels) h += '<th>' + (opts.rowLabels[i] || '') + '</th>';
      row.forEach(function (v) { h += '<td>' + fmt(v) + '</td>'; });
      h += '</tr>';
    });
    h += '</table></div>';
    return h;
  }

  function keyDisplay(key) {
    return KEY_DISPLAY[key] || SHORT_LABELS[key] || key;
  }

  /* ---------- init & top-level render ---------- */

  function init(sess, rootEl, onNewProblem, saved) {
    session = sess;
    onNewProblemCb = onNewProblem;
    timeline = (saved && saved.past)
      ? { past: saved.past.slice(), future: (saved.future || []).slice() }
      : { past: [], future: [] };
    lastSnapshot = JSON.stringify(sess);
    els.problemRef = rootEl.querySelector('#problem-ref');
    els.timeline = rootEl.querySelector('#timeline-bar');
    els.history = rootEl.querySelector('#history');
    els.workspace = rootEl.querySelector('#workspace');
    els.prompt = rootEl.querySelector('#prompt-card');
    examLastResume = Date.now();
    if (examTicker) { clearInterval(examTicker); examTicker = null; }
    if (session.examMode) {
      examTicker = setInterval(function () {
        var chip = els.timeline && els.timeline.querySelector('.exam-timer-val');
        if (chip) chip.textContent = fmtClock(session.elapsedMs + (Date.now() - examLastResume));
      }, 1000);
    }
    renderProblemRef();
    renderAll();
  }

  function persist() {
    if (S.store) {
      S.store.save({ session: session, past: timeline.past, future: timeline.future });
    }
  }

  function goBack() {
    if (!timeline.past.length) return;
    timeline.future.push(JSON.stringify(session));
    var snap = timeline.past.pop();
    session = JSON.parse(snap);
    window.Simplex.currentSession = session;
    lastSnapshot = snap;
    restoring = true;
    renderAll();
  }

  function goForward() {
    if (!timeline.future.length) return;
    timeline.past.push(JSON.stringify(session));
    var snap = timeline.future.pop();
    session = JSON.parse(snap);
    window.Simplex.currentSession = session;
    lastSnapshot = snap;
    restoring = true;
    renderAll();
  }

  function renderTimelineBar() {
    if (!els.timeline) return;
    els.timeline.innerHTML = '';
    var bar = el('div', 'timeline-bar');
    var back = btn('⏪ שלב אחורה', 'btn', goBack);
    back.id = 'tl-back';
    back.disabled = !timeline.past.length;
    var fwd = btn('שלב קדימה ⏩', 'btn', goForward);
    fwd.id = 'tl-fwd';
    fwd.disabled = !timeline.future.length;
    var pos = session.phase === 'setup' ? 'הקמה'
      : session.phase === 'done' ? 'סיום'
      : 'איטרציה ' + (session.iterIndex + 1);
    bar.appendChild(back);
    bar.appendChild(el('span', 'tl-pos', pos + ' · צעד ' + (timeline.past.length + 1)));
    bar.appendChild(fwd);
    if (session.examMode) {
      bar.appendChild(el('span', 'exam-chip timer',
        '⏱️ <span class="exam-timer-val">' + fmtClock(session.elapsedMs) + '</span>'));
      bar.appendChild(el('span', 'exam-chip errors', '❌ שגיאות: ' + session.errorLog.length));
      bar.appendChild(el('span', 'tl-note exam-note', '📝 מצב מבחן — בלי רמזים'));
    } else {
      bar.appendChild(el('span', 'tl-note', '💾 נשמר אוטומטית — רענון לא מוחק כלום'));
    }
    els.timeline.appendChild(bar);
  }

  function renderAll() {
    hintLevel = 0;
    // fold wall-clock time since the last render into the persisted total
    if (session.examMode && !restoring) {
      session.elapsedMs += Date.now() - examLastResume;
    }
    examLastResume = Date.now();
    var snap = JSON.stringify(session);
    if (!restoring && lastSnapshot !== null && snap !== lastSnapshot) {
      timeline.past.push(lastSnapshot);   // we advanced — the old prompt joins the past
      timeline.future = [];               // any redo branch is invalidated
    }
    lastSnapshot = snap;
    restoring = false;
    persist();
    renderTimelineBar();
    renderHistory();
    renderWorkspace();
    renderPrompt();
    window.scrollTo(0, document.body.scrollHeight);
  }

  /* ---------- problem reference (always visible) ---------- */

  function linComb(coeffs) {
    var parts = [];
    coeffs.forEach(function (c, i) {
      if (c === 0) return;
      var mag = Math.abs(c);
      var term = (mag === 1 ? '' : fmt(mag)) + 'x<sub>' + (i + 1) + '</sub>';
      if (parts.length === 0) parts.push((c < 0 ? '−' : '') + term);
      else parts.push((c < 0 ? ' − ' : ' + ') + term);
    });
    return parts.length ? parts.join('') : '0';
  }

  function renderProblemRef() {
    var p = session.problem;
    var html = '<h2>התרגיל</h2><div class="ref-cols"><div class="formulation ltr-math">';
    html += 'Max Z = ' + linComb(p.c) + '<br>s.t.<br>';
    p.A.forEach(function (row, i) {
      html += linComb(row) + ' ≤ ' + fmt(p.b[i]) + '<br>';
    });
    var names = [];
    for (var v = 1; v <= p.n; v++) names.push('x<sub>' + v + '</sub>');
    html += names.join(', ') + ' ≥ 0</div>';

    html += '<div><div class="mini-label">הצורה הסטנדרטית: (A|I) , b , cᵀ</div>';
    html += '<table class="mini-matrix ref-table ltr-math"><tr><th></th>';
    for (var j = 1; j <= p.n + p.m; j++) {
      html += '<th class="' + (j <= p.n ? 'orig' : 'slack') + '">x<sub>' + j + '</sub></th>';
    }
    html += '<th class="bcol">b</th></tr>';
    html += '<tr><th>cᵀ</th>';
    session.cFull.forEach(function (c) { html += '<td>' + fmt(c) + '</td>'; });
    html += '<td class="bcol"></td></tr>';
    session.AFull.forEach(function (row, i) {
      html += '<tr><th></th>';
      row.forEach(function (val) { html += '<td>' + fmt(val) + '</td>'; });
      html += '<td class="bcol">' + fmt(p.b[i]) + '</td></tr>';
    });
    html += '</table></div></div>';
    els.problemRef.innerHTML = html;
  }

  /* ---------- history & workspace ---------- */

  function renderHistory() {
    if (!session.history.length) {
      els.history.innerHTML = '';
      return;
    }
    var html = '<div class="card history"><h3>איטרציות שהושלמו</h3><ul>';
    session.history.forEach(function (h) {
      html += '<li>איטרציה ' + (h.iter + 1) + ': <span class="ltr-math">Z = ' + fmt(h.Z) +
        '</span> · נכנס <span class="ltr-math">' + varSub(h.entering) +
        '</span> · יצא <span class="ltr-math">' + varSub(h.leaving) + '</span></li>';
    });
    els.history.innerHTML = html + '</ul></div>';
  }

  function gridLabelsFor(st) {
    var c = session.canonical;
    var g = c ? c.given : null;
    var setup = session.phase === 'setup';
    switch (st.quantityId) {
      case 'cB': return { colLabels: varLabels(setup ? session.setupCanonical.B : c.nextB) };
      case 'cN': return { colLabels: varLabels(setup ? session.setupCanonical.N : c.nextN) };
      case 'rN': return { colLabels: varLabels(g.N) };
      case 'xB': return { rowLabels: varLabels(g.B) };
      case 'nBarQ': return { rowLabels: varLabels(g.B) };
      case 'ratios': return { rowLabels: varLabels(g.B) };
      default: return {};
    }
  }

  function completedHTML(st) {
    var c = session.canonical;
    if (st.kind === 'stepRecall') {
      return '<div class="done-badge">✓ ' + STEP_SHORT[st.correctStep] + '</div>';
    }
    if (st.kind === 'decision') {
      var text;
      if (st.decision === 'stop1') text = c.optimal ? 'עצירה: אופטימלי' : 'לא אופטימלי — ממשיכים';
      else if (st.decision === 'entering') text = 'נכנס: <span class="ltr-math">' + varSub(c.q) + '</span>';
      else if (st.decision === 'stop2') text = c.unbounded ? 'עצירה: לא חסום' : 'חסום — מבחן יחס';
      else text = 'יוצא: <span class="ltr-math">' + varSub(c.p) + '</span>';
      return '<div class="done-badge decision">' + text + '</div>';
    }
    // quantity
    var label = SHORT_LABELS[st.quantityId];
    if (st.qtype === 'indexList') {
      return '<div class="done-item">' + setEqHTML(label, st.correct) + '</div>';
    }
    if (st.qtype === 'columnPick') {
      var mat = Engine.computeBMatrix(session.AFull, st.correct);
      return matrixHTML(mat, { label: label, colLabels: varLabels(st.correct) });
    }
    if (st.qtype === 'scalar') {
      return '<div class="done-item ltr-math">' + label + ' = ' + fmt(st.correct) + '</div>';
    }
    if (st.qtype === 'ratios') {
      var disp = st.correct.map(function (v) { return [v === null ? '—' : v]; });
      return matrixHTML(disp, {
        label: label, rowLabels: varLabels(session.canonical.given.B),
      });
    }
    var labels = gridLabelsFor(st);
    return matrixHTML(st.correct, {
      label: label, colLabels: labels.colLabels, rowLabels: labels.rowLabels,
    });
  }

  /** Full cᵀ row with each coefficient tagged basic/non-basic — shows the
   *  split of c into cB and cN, not just the two pieces. */
  function cSplitHTML(g) {
    var p = session.problem;
    var h = '<div class="mini-matrix-wrap"><div class="mini-label">cᵀ המלא ופיצולו</div>';
    h += '<table class="mini-matrix ltr-math"><tr>';
    var v;
    for (v = 1; v <= p.n + p.m; v++) h += '<th>' + varSub(v) + '</th>';
    h += '</tr><tr>';
    for (v = 1; v <= p.n + p.m; v++) {
      var cls = g.B.indexOf(v) >= 0 ? 'c-basic' : 'c-nonbasic';
      h += '<td class="' + cls + '">' + fmt(session.cFull[v - 1]) + '</td>';
    }
    h += '</tr></table>';
    h += '<div class="c-legend"><span class="c-basic">בסיסי ← cB</span>' +
      '<span class="c-nonbasic">לא-בסיסי ← cN</span></div></div>';
    return h;
  }

  function renderWorkspace() {
    var html = '';
    if (session.phase === 'iter') {
      var g = session.canonical.given;
      html += '<div class="card given"><h3>איטרציה ' + (session.iterIndex + 1) +
        ' — נתוני הפתיחה</h3>';
      html += '<p>' + setEqHTML('B', g.B) + ' &nbsp;·&nbsp; ' + setEqHTML('N', g.N) + '</p>';
      html += '<div class="mini-row">';
      html += cSplitHTML(g);
      html += matrixHTML(g.Binv, { label: 'B⁻¹' });
      html += matrixHTML([g.cB], { label: 'cB', colLabels: varLabels(g.B) });
      html += matrixHTML([g.cN], { label: 'cN', colLabels: varLabels(g.N) });
      html += '</div></div>';
    }
    var done = session.stepQueue.slice(0, session.stepIndex);
    if (done.length && session.phase !== 'done') {
      html += '<div class="card done-steps"><h3>' +
        (session.phase === 'setup' ? 'ההקמה עד כה' : 'האיטרציה הנוכחית עד כה') +
        '</h3><div class="mini-row">';
      done.forEach(function (st) { html += completedHTML(st); });
      html += '</div></div>';
    }
    els.workspace.innerHTML = html;
  }

  /* ---------- prompt card ---------- */

  function renderPrompt() {
    els.prompt.innerHTML = '';
    if (session.phase === 'done') {
      renderFinal();
      return;
    }
    var st = Session.getCurrent(session);
    var sub = session.substage;

    var card = el('div', 'card prompt');
    var title = session.phase === 'setup'
      ? '🚀 פתיחת התרגיל'
      : '🔁 איטרציה ' + (session.iterIndex + 1);
    card.appendChild(el('h3', 'prompt-title', title));

    var applyReveal;
    if (st.kind === 'stepRecall') applyReveal = renderStepRecall(card, st);
    else if (st.kind === 'decision') applyReveal = renderDecision(card, st);
    else if (sub === 'recall') applyReveal = renderQuantityRecall(card, st);
    else if (sub === 'dims') applyReveal = renderDims(card, st);
    else applyReveal = renderFill(card, st);

    if (!session.examMode) card.appendChild(hintStrip(applyReveal));
    els.prompt.appendChild(card);
  }

  function hintStrip(applyReveal) {
    var box = el('div', 'hint-strip');
    var texts = el('div', 'hint-texts');
    var hb = btn('רמז', 'btn hint-btn', function () {
      if (hintLevel >= 2) {
        var r = Session.revealCurrent(session);
        applyReveal(r);
        texts.appendChild(el('p', 'hint-text revealed-note', 'התשובה נחשפה (נרשם בסיכום העזרה).'));
        hb.disabled = true;
        return;
      }
      hintLevel++;
      texts.appendChild(el('p', 'hint-text', Session.getHint(session, hintLevel)));
      hb.textContent = hintLevel === 1 ? 'רמז נוסף' : 'חשוף את התשובה';
    });
    box.appendChild(hb);
    box.appendChild(texts);
    return box;
  }

  function showSuccess(card, note, why) {
    card.querySelectorAll('input, select, button').forEach(function (e) { e.disabled = true; });
    var box = el('div', 'success-box', '<span class="ok-mark">✓ נכון!</span>' +
      (note ? '<div class="note">' + note + '</div>' : ''));
    var whyBox = null;
    if (why && !session.examMode) {
      whyBox = el('div', 'why-box', why);
      whyBox.hidden = true;
      var whyBtn = btn('למה?', 'btn why-btn', function () {
        whyBox.hidden = !whyBox.hidden;
      });
      whyBtn.addEventListener('mouseenter', function () { whyBox.hidden = false; });
      box.appendChild(whyBtn);
    }
    var cont = btn('המשך ←', 'btn primary', renderAll);
    box.appendChild(cont);
    card.appendChild(box);
    if (whyBox) card.appendChild(whyBox);
    cont.focus();
  }

  function feedbackLine(card) {
    var fb = el('p', 'error-msg');
    card.appendChild(fb);
    return fb;
  }

  /* --- recall prompts (hidden options) --- */

  function renderStepRecall(card, st) {
    var why = Session.getWhyForCurrent(session);
    var widget = SR.create(card, {
      question: st.first
        ? 'קלטנו את התרגיל. <b>מה השלב הראשון באלגוריתם?</b>'
        : '<b>מה השלב הבא באלגוריתם?</b>',
      options: shuffled(Session.COURSE_STEPS),
      onFirstReveal: function () { Session.recordHelp(session, 1); },
      onChoose: function (id) {
        var res = Session.submitStepRecall(session, id);
        widget.markChoice(id, res.ok ? 'ok' : 'bad');
        if (res.ok) showSuccess(card, null, why);
      },
    });
    return function (r) {
      widget.revealNow();
      widget.markChoice(r.value, 'revealed');
    };
  }

  function renderQuantityRecall(card, st) {
    var why = Session.getWhyForCurrent(session);
    var widget = SR.create(card, {
      question: 'בתוך השלב הנוכחי: <b>איזה גודל מגדירים או מחשבים עכשיו?</b>',
      options: shuffled(Session.QUANTITIES),
      onFirstReveal: function () { Session.recordHelp(session, 1); },
      onChoose: function (id) {
        var res = Session.submitQuantityRecall(session, id);
        widget.markChoice(id, res.ok ? 'ok' : 'bad');
        if (res.ok) showSuccess(card, null, why);
      },
    });
    return function (r) {
      widget.revealNow();
      widget.markChoice(r.value, 'revealed');
    };
  }

  /* --- dims --- */

  function renderDims(card, st) {
    var why = Session.getWhyForCurrent(session);
    var label = Session.quantityLabel(st.quantityId);
    card.appendChild(el('p', 'prompt-q',
      'זיהית נכון: <b>' + label + '</b>. <b>מה הממדים?</b>'));

    var form = el('div', 'dims-form ltr-math');
    var fb = null;
    var inputs = {};

    function smallInput() {
      var i = document.createElement('input');
      i.type = 'text';
      i.dir = 'ltr';
      i.className = 'cell dims-cell';
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      return i;
    }

    if (st.qtype === 'indexList') {
      form.appendChild(el('span', null, 'מספר איברים: '));
      inputs.size = smallInput();
      form.appendChild(inputs.size);
    } else {
      inputs.rows = smallInput();
      inputs.rows.placeholder = 'שורות';
      inputs.cols = smallInput();
      inputs.cols.placeholder = 'עמודות';
      form.appendChild(inputs.rows);
      form.appendChild(el('span', 'dims-x', ' × '));
      form.appendChild(inputs.cols);
    }
    card.appendChild(form);
    card.appendChild(btn('אשר', 'btn primary', submit));
    fb = feedbackLine(card);

    function submit() {
      var dims;
      if (st.qtype === 'indexList') {
        dims = { size: parseInt(inputs.size.value, 10) };
        if (isNaN(dims.size)) { fb.textContent = 'הזן מספר.'; return; }
      } else {
        dims = { rows: parseInt(inputs.rows.value, 10), cols: parseInt(inputs.cols.value, 10) };
        if (isNaN(dims.rows) || isNaN(dims.cols)) { fb.textContent = 'הזן מספרים בשני השדות.'; return; }
      }
      var res = Session.submitDims(session, dims);
      Object.keys(inputs).forEach(function (k) {
        inputs[k].classList.remove('ok', 'bad');
        inputs[k].classList.add(res.ok ? 'ok' : 'bad');
      });
      if (res.ok) showSuccess(card, null, why);
      else fb.textContent = 'לא מדויק — חשוב מה הגודל הזה מכיל (רמז יעזור).';
    }

    return function (r) {
      if (r.value.size != null) inputs.size.value = String(r.value.size);
      else {
        inputs.rows.value = String(r.value.rows);
        inputs.cols.value = String(r.value.cols);
      }
      Object.keys(inputs).forEach(function (k) { inputs[k].classList.add('revealed'); });
    };
  }

  /* --- fill --- */

  function renderFill(card, st) {
    if (st.qtype === 'grid') return renderGridFill(card, st);
    if (st.qtype === 'scalar') return renderScalarFill(card, st);
    if (st.qtype === 'indexList') return renderIndexListFill(card, st);
    if (st.qtype === 'ratios') return renderRatiosFill(card, st);
    return renderColumnPickFill(card, st);
  }

  function renderRatiosFill(card, st) {
    var why = Session.getWhyForCurrent(session);
    var g = session.canonical.given;
    card.appendChild(el('p', 'prompt-q',
      'בצע את <b>מבחן היחס</b>: חשב (xB)<sub>i</sub>/(n̄q)<sub>i</sub> בכל שורה מתאימה. ' +
      'בשורה ללא יחס תקף סמן "<span class="ltr-math">-</span>".'));
    var box = el('div', 'fill-box');
    card.appendChild(box);
    var grid = MI.create(box, {
      rows: st.correct.length,
      cols: 1,
      rowLabels: varLabels(g.B),
      onEnter: doCheck,
    });
    box.appendChild(btn('בדוק', 'btn primary', doCheck));
    var fb = feedbackLine(card);
    grid.focusFirst();

    function doCheck() {
      var strs = grid.getStrings().map(function (r) { return r[0]; });
      var res = Session.submitRatios(session, strs);
      var anyInvalid = false;
      res.cells.forEach(function (cell, i) {
        if (cell.invalid) anyInvalid = true;
        grid.setCellStatus(i, 0, cell.ok ? 'ok' : (cell.invalid ? 'invalid' : 'bad'));
      });
      if (res.ok) showSuccess(card, null, why);
      else {
        fb.textContent = anyInvalid
          ? 'קלט לא תקין — מספר, שבר a/b, או "-" לשורה בלי יחס.'
          : 'יש שורות שגויות — זכור: יחס מחושב רק כאשר (n̄q)ᵢ חיובי.';
      }
    }

    return function (r) {
      grid.setStrings(r.value.map(function (v) { return [v === null ? '-' : fmt(v)]; }));
      r.value.forEach(function (_, i) { grid.setCellStatus(i, 0, 'revealed'); });
    };
  }

  /** Operands for the multiplication scratch area of the current step. */
  function multPresetFor(st) {
    var c = session.canonical;
    if (!c) return null;
    var g = c.given;
    switch (st.quantityId) {
      case 'xB':
        return { A: { label: 'B⁻¹', values: g.Binv },
          B: { label: 'b', values: colVec(session.problem.b) }, resultLabel: 'xB' };
      case 'Z':
        return { A: { label: 'cB', values: [g.cB] },
          B: { label: 'xB', values: colVec(c.xB) }, resultLabel: 'Z' };
      case 'y':
        return { A: { label: 'cB', values: [g.cB] },
          B: { label: 'B⁻¹', values: g.Binv }, resultLabel: 'yᵀ' };
      case 'rN':
        return { A: { label: 'yᵀ', values: [c.y] },
          B: { label: 'N', values: c.NMatrix },
          D: { label: 'cN', values: [g.cN] }, resultLabel: 'rN' };
      case 'nBarQ':
        return { A: { label: 'B⁻¹', values: g.Binv },
          B: { label: 'aq', values: colVec(c.aQ) }, resultLabel: 'n̄q' };
      default:
        return null;
    }
  }

  function renderGridFill(card, st) {
    var why = Session.getWhyForCurrent(session);
    var label = Session.quantityLabel(st.quantityId);
    card.appendChild(el('p', 'prompt-q', 'מלא את הערכים של <b>' + label + '</b>:'));

    var gridBox = el('div', 'fill-box');
    var calcBox = el('div', 'calc-box');
    calcBox.hidden = true;

    var multPreset = st.calculator ? null : multPresetFor(st);
    if (st.calculator || multPreset) {
      var tabs = el('div', 'tabs');
      var tType = btn('תשובה (הקלדה)', 'tab-btn active', function () {
        tType.classList.add('active');
        tCalc.classList.remove('active');
        gridBox.hidden = false;
        calcBox.hidden = true;
      });
      var calcPanel = null;
      var tabLabel = st.calculator
        ? 'מחשבון דירוג (פעולות שורה)'
        : 'אזור חישוב (כפל מטריצות)';
      var tCalc = btn(tabLabel, 'tab-btn', function () {
        tCalc.classList.add('active');
        tType.classList.remove('active');
        gridBox.hidden = true;
        calcBox.hidden = false;
        if (calcPanel) return;
        if (st.calculator) {
          var c = session.canonical;
          var g = c.given;
          var aug = g.Binv.map(function (row, i) { return row.concat([c.nBarQ[i]]); });
          var labels = [];
          for (var j = 0; j < g.Binv.length; j++) labels.push('');
          labels.push('n̄q');
          calcBox.appendChild(el('p', 'calc-tip',
            'לפניך [B⁻¹ | n̄q]. בצע פעולות שורה עד שהעמודה האחרונה תהפוך לווקטור היחידה של שורת המשתנה היוצא — ואז העמודות שנותרו משמאל הן B⁻¹ החדשה.'));
          calcPanel = RRUI.create(calcBox, {
            matrix: aug,
            colLabels: labels,
            mode: 'embedded',
            autoTarget: { kind: 'pivot', row: c.pivotRow, col: g.Binv.length },
            correctLeft: st.correct,
            examMode: session.examMode,
            onAccept: useStrings,
          });
        } else {
          multPreset.onUseResult = useStrings;
          multPreset.examMode = session.examMode;
          calcPanel = MS.create(calcBox, multPreset);
        }
      });
      tabs.appendChild(tType);
      tabs.appendChild(tCalc);
      card.appendChild(tabs);
    }

    function useStrings(strings) {
      grid.setStrings(strings);
      if (typeof tType !== 'undefined') tType.click();
      doCheck();
    }

    card.appendChild(gridBox);
    card.appendChild(calcBox);

    var labels = gridLabelsFor(st);
    var grid = MI.create(gridBox, {
      rows: st.dims[0],
      cols: st.dims[1],
      colLabels: labels.colLabels,
      rowLabels: labels.rowLabels,
      onEnter: doCheck,
    });
    gridBox.appendChild(btn('בדוק', 'btn primary', doCheck));
    if (st.quantityId === 'Binv' && !session.examMode) {
      // Pure algebra — a one-click final answer that is NOT counted as help.
      gridBox.appendChild(btn('⚡ חשב עבורי (דירוג אוטומטי)', 'btn auto-btn', function () {
        grid.setStrings(st.correct.map(function (row) { return row.map(fmt); }));
        Session.recordAuto(session);
        doCheck();
      }));
    }
    var fb = feedbackLine(card);
    grid.focusFirst();

    function doCheck() {
      var res = Session.submitGrid(session, grid.getStrings());
      var anyInvalid = false;
      res.cells.forEach(function (row, i) {
        row.forEach(function (cell, j) {
          if (cell.invalid) anyInvalid = true;
          grid.setCellStatus(i, j, cell.ok ? 'ok' : (cell.invalid ? 'invalid' : 'bad'));
        });
      });
      if (res.ok) showSuccess(card, null, why);
      else {
        fb.textContent = anyInvalid
          ? 'יש קלט לא תקין בתאים המסומנים — מספר עשרוני או שבר a/b בלבד.'
          : 'יש תאים שגויים (אדומים) — בדוק את החישוב.';
      }
    }

    return function (r) {
      grid.setStrings(r.value.map(function (row) { return row.map(fmt); }));
      r.value.forEach(function (row, i) {
        row.forEach(function (_, j) { grid.setCellStatus(i, j, 'revealed'); });
      });
    };
  }

  function renderScalarFill(card, st) {
    var why = Session.getWhyForCurrent(session);
    card.appendChild(el('p', 'prompt-q',
      'חשב את <b>' + Session.quantityLabel(st.quantityId) + '</b>:'));
    var box = el('div', 'fill-box ltr-math');
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.dir = 'ltr';
    inp.className = 'cell scalar-cell';
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doCheck(); });
    box.appendChild(el('span', 'mini-label', 'Z = '));
    box.appendChild(inp);
    card.appendChild(box);
    card.appendChild(btn('בדוק', 'btn primary', doCheck));

    var multPreset = multPresetFor(st);
    if (multPreset) {
      var scratchBox = el('div', 'calc-box');
      scratchBox.hidden = true;
      var scratchPanel = null;
      card.appendChild(btn('אזור חישוב (מכפלה סקלרית)', 'btn scratch-toggle', function () {
        scratchBox.hidden = !scratchBox.hidden;
        if (!scratchPanel && !scratchBox.hidden) {
          multPreset.onUseResult = function (strings) {
            inp.value = strings[0][0];
            scratchBox.hidden = true;
            doCheck();
          };
          multPreset.examMode = session.examMode;
          scratchPanel = MS.create(scratchBox, multPreset);
        }
      }));
      card.appendChild(scratchBox);
    }

    var fb = feedbackLine(card);
    inp.focus();

    function doCheck() {
      var res = Session.submitScalar(session, inp.value);
      inp.classList.remove('ok', 'bad', 'invalid');
      inp.classList.add(res.ok ? 'ok' : (res.invalid ? 'invalid' : 'bad'));
      if (res.ok) showSuccess(card, null, why);
      else fb.textContent = res.invalid ? 'קלט לא תקין — מספר או שבר a/b.' : 'לא נכון — בדוק את החישוב.';
    }

    return function (r) {
      inp.value = fmt(r.value);
      inp.classList.add('revealed');
    };
  }

  function renderIndexListFill(card, st) {
    var why = Session.getWhyForCurrent(session);
    var label = Session.quantityLabel(st.quantityId);
    card.appendChild(el('p', 'prompt-q',
      'מלא את <b>' + label + '</b> — אינדקסים של משתנים לפי הסדר (למשל 3 או x3):'));
    var box = el('div', 'fill-box ltr-math index-list');
    var inputs = [];
    for (var i = 0; i < st.correct.length; i++) {
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.dir = 'ltr';
      inp.className = 'cell';
      inp.placeholder = 'x?';
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doCheck(); });
      inputs.push(inp);
      box.appendChild(inp);
    }
    card.appendChild(box);
    card.appendChild(btn('בדוק', 'btn primary', doCheck));
    var fb = feedbackLine(card);
    inputs[0].focus();

    function parseIndexToken(str) {
      var mo = String(str).trim().match(/^x?\s*(\d+)$/i);
      return mo ? parseInt(mo[1], 10) : NaN;
    }

    function doCheck() {
      var values = inputs.map(function (i) { return parseIndexToken(i.value); });
      if (values.some(isNaN)) {
        inputs.forEach(function (inp, i) {
          inp.classList.remove('ok', 'bad', 'invalid');
          if (isNaN(values[i])) inp.classList.add('invalid');
        });
        fb.textContent = 'קלט לא תקין — הזן אינדקס משתנה (מספר).';
        return;
      }
      var res = Session.submitIndexList(session, values);
      res.cells.forEach(function (ok, i) {
        inputs[i].classList.remove('ok', 'bad', 'invalid');
        inputs[i].classList.add(ok ? 'ok' : 'bad');
      });
      if (res.ok) showSuccess(card, null, why);
      else fb.textContent = 'לא מדויק — זכור: הסדר קובע!';
    }

    return function (r) {
      r.value.forEach(function (v, i) {
        inputs[i].value = String(v);
        inputs[i].classList.add('revealed');
      });
    };
  }

  function renderColumnPickFill(card, st) {
    var why = Session.getWhyForCurrent(session);
    var label = Session.quantityLabel(st.quantityId);
    card.appendChild(el('p', 'prompt-q',
      'בנה את <b>' + label + '</b>: בחר את העמודות המתאימות מתוך (A|I) המקורית, לפי הסדר.'));
    var picker = CP.create(card, {
      AFull: session.AFull,
      expectedCount: st.correct.length,
    });
    card.appendChild(btn('אשר בחירה', 'btn primary', doCheck));
    var fb = feedbackLine(card);

    function doCheck() {
      var picked = picker.getPicked();
      if (picked.length !== st.correct.length) {
        fb.textContent = 'בחר בדיוק ' + st.correct.length + ' עמודות.';
        return;
      }
      var res = Session.submitColumnPick(session, picked);
      picker.markResult(res.cells);
      if (res.ok) {
        picker.disable();
        showSuccess(card, null, why);
      } else {
        fb.textContent = 'הבחירה לא מדויקת — שים לב לזהות העמודות ולסדר שלהן.';
      }
    }

    return function (r) {
      picker.setPicked(r.value);
      fb.textContent = 'זה הסדר הנכון — לחץ "אשר בחירה".';
    };
  }

  /* --- decisions --- */

  function renderDecision(card, st) {
    var why = Session.getWhyForCurrent(session);
    var c = session.canonical;
    var g = c.given;
    var qtext;
    var options;
    if (st.decision === 'stop1') {
      qtext = 'הסתכל על rN שחישבת: <b>האם הפתרון הנוכחי אופטימלי?</b>';
      options = [
        { id: 'stop', label: 'אופטימלי — עוצרים' },
        { id: 'continue', label: 'לא אופטימלי — ממשיכים' },
      ];
    } else if (st.decision === 'entering') {
      qtext = '<b>איזה משתנה נכנס לבסיס?</b>';
      options = g.N.map(function (v) { return { id: v, label: varSub(v) }; });
    } else if (st.decision === 'stop2') {
      qtext = 'הסתכל על n̄q שחישבת: <b>מה המסקנה?</b>';
      options = [
        { id: 'continue', label: 'אפשר להמשיך — מבחן היחס' },
        { id: 'stop', label: 'הבעיה לא חסומה — עוצרים' },
      ];
    } else {
      qtext = '<b>איזה משתנה יוצא מהבסיס?</b> (מבחן היחס)';
      options = g.B.map(function (v) { return { id: v, label: varSub(v) }; });
    }
    card.appendChild(el('p', 'prompt-q', qtext));
    var box = el('div', 'decision-options');
    var buttons = {};
    shuffled(options).forEach(function (opt) {
      var b = btn(opt.label, 'option-btn ltr-math', function () {
        var res = Session.submitDecision(session, opt.id);
        b.classList.remove('ok', 'bad');
        b.classList.add(res.ok ? 'ok' : 'bad');
        if (res.ok) showSuccess(card, res.note, why);
      });
      b.dataset.id = String(opt.id);
      buttons[opt.id] = b;
      box.appendChild(b);
    });
    card.appendChild(box);

    return function (r) {
      var b = buttons[r.value];
      if (b) b.classList.add('revealed');
    };
  }

  /* ---------- final screen ---------- */

  function renderFinal() {
    if (examTicker) { clearInterval(examTicker); examTicker = null; }
    renderFinalBody();
  }

  function renderExamSummary(card) {
    var ex = Session.examSummary(session);
    var box = el('div', 'exam-summary');
    box.appendChild(el('h3', null, '📝 סיכום מבחן'));
    var scoreCls = ex.score >= 90 ? 'score-good' : ex.score >= 70 ? 'score-mid' : 'score-low';
    box.appendChild(el('p', 'exam-score ' + scoreCls, 'ציון: ' + ex.score + ' / 100'));
    box.appendChild(el('p', 'exam-stats ltr-math',
      '⏱️ ' + fmtClock(session.elapsedMs) + ' · ❌ ' + ex.totalErrors + ' שגיאות'));
    box.appendChild(el('p', 'exam-formula', 'הציון: max(0, 100 − 3 × מספר השגיאות).'));
    if (ex.byStep.length) {
      box.appendChild(el('p', 'exam-weak-title', 'השלבים עם הכי הרבה טעויות:'));
      var ul = el('ul');
      ex.byStep.slice(0, 3).forEach(function (r) {
        ul.appendChild(el('li', null, r.where + ' · ' + r.label + ' — ' + r.count + ' טעויות'));
      });
      box.appendChild(ul);
      box.appendChild(el('p', 'help-tip', 'אלה הנושאים לחזור עליהם לפני המבחן האמיתי.'));
    } else {
      box.appendChild(el('p', 'no-help', 'אפס טעויות — מושלם! 🏆'));
    }
    card.appendChild(box);
  }

  function renderFinalBody() {
    var card = el('div', 'card final');
    var p = session.problem;
    var f = session.finalResult;

    if (session.status === 'optimal') {
      card.appendChild(el('h2', null, '🎉 הגעת לפתרון האופטימלי'));
      card.appendChild(el('p', 'big-z ltr-math', 'Z* = ' + fmt(f.Z)));
      if (f.hasAlternateOptima) {
        card.appendChild(el('p', 'alt-badge',
          'שים לב: קיימים פתרונות אופטימליים נוספים (מקדם מתוקן של משתנה לא-בסיסי שווה 0).'));
      }
      var rows = '';
      for (var v = 1; v <= p.n + p.m; v++) {
        var basic = f.B.indexOf(v) >= 0;
        rows += '<tr class="' + (v <= p.n ? 'orig' : 'slack') + '">' +
          '<td class="ltr-math">x<sub>' + v + '</sub></td>' +
          '<td class="ltr-math">' + fmt(f.assignments[v]) + '</td>' +
          '<td>' + (basic ? 'בסיסי' : 'לא בסיסי') + '</td></tr>';
      }
      card.appendChild(el('table', 'result-table',
        '<tr><th>משתנה</th><th>ערך</th><th>מעמד</th></tr>' + rows));

      if (f.shadowPrices) {
        var spBox = el('div', 'shadow-box');
        spBox.appendChild(el('div', null, matrixHTML([f.shadowPrices], {
          label: 'yᵀ — מחירי הצל',
          colLabels: f.shadowPrices.map(function (_, i) { return 'אילוץ ' + (i + 1); }),
        })));
        spBox.appendChild(el('p', 'shadow-note',
          'מחיר הצל <span class="ltr-math">yᵢ</span> הוא התוספת ל-<span class="ltr-math">Z</span> ' +
          'מיחידת משאב אחת נוספת באילוץ <span class="ltr-math">i</span> — כל עוד הבסיס האופטימלי לא משתנה. ' +
          '(נמצא בטבלה האחרונה מתחת למשתני הסרק בשורת Z, בסימן הפוך.)'));
        card.appendChild(spBox);
      }
    } else {
      card.appendChild(el('h2', null, 'הבעיה אינה חסומה'));
      card.appendChild(el('p', null,
        'המשתנה הנכנס <span class="ltr-math">' + varSub(f.enteringVar) +
        '</span> יכול לגדול ללא הגבלה: כל רכיבי n̄q אי-חיוביים, כך שאין שורה שמגבילה אותו במבחן היחס.'));
      card.appendChild(el('div', null, matrixHTML(colVec(f.nBarQ), {
        label: 'n̄q', rowLabels: varLabels(f.B),
      })));
    }

    if (session.examMode) {
      renderExamSummary(card);
      card.appendChild(btn('תרגיל חדש', 'btn primary big', function () { onNewProblemCb(); }));
      els.prompt.appendChild(card);
      return;
    }

    var hs = Session.helpSummary(session);
    var helpBox = el('div', 'help-summary');
    helpBox.appendChild(el('h3', null, 'סיכום עזרה'));
    if (!hs.length) {
      helpBox.appendChild(el('p', 'no-help', 'פתרת בלי שום עזרה — מצוין! 💪'));
    } else {
      var LEVELS = { 1: 'רמז קל', 2: 'רמז מפורט', 3: 'נחשפה תשובה' };
      var ul = el('ul');
      hs.forEach(function (h) {
        ul.appendChild(el('li', h.level === 3 ? 'help-heavy' : '',
          h.where + ' · ' + keyDisplay(h.key) + ' · ' + LEVELS[h.level]));
      });
      helpBox.appendChild(ul);
      helpBox.appendChild(el('p', 'help-tip',
        'הנושאים שבהם נחשפה תשובה שווים חזרה נוספת לפני המבחן.'));
    }
    var autos = Session.autoSummary(session);
    if (autos.length) {
      helpBox.appendChild(el('p', 'auto-note',
        '⚡ חישובים אלגבריים שבוצעו אוטומטית (בחירה לגיטימית — זה לא חלק מהשינון): ' +
        autos.map(function (a) { return a.where + ' · ' + keyDisplay(a.key); }).join(' ; ')));
    }
    card.appendChild(helpBox);
    card.appendChild(btn('תרגיל חדש', 'btn primary big', function () { onNewProblemCb(); }));
    els.prompt.appendChild(card);
  }

  window.Simplex = window.Simplex || {};
  window.Simplex.wizardUI = { init: init };
})();
