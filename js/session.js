/* Simplex Tutor — session.js
 * The tutoring state machine (no DOM). Drives the exact course order:
 *   Setup (step 1) once, then per iteration: step 2 -> 3 -> 4 -> 5 -> loop.
 * Every prompt goes through up to three sub-stages, all student-initiated:
 *   'recall' (which quantity/step comes next?) -> 'dims' -> 'fill'.
 * Decisions (optimal? entering? unbounded? leaving?) are single-choice steps.
 *
 * Critical invariant: each iteration's `given` values are seeded from the
 * ENGINE's canonical results, never from student answers — one mistake never
 * poisons later iterations or makes them ungradable.
 */
(function () {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var Engine = isNode ? require('./engine.js') : window.Simplex.engine;
  var Check = isNode ? require('./answer-check.js') : window.Simplex.answerCheck;
  var Parse = isNode ? require('./parse.js') : window.Simplex.parse;

  /* NOTE: no "שלב N" numbering in the labels — the options are shuffled, and
   * a visible number would give the order away. */
  var COURSE_STEPS = [
    { id: 'step1', label: 'הצג את הבעיה בצורה סטנדרטית וקבע פתרון בסיסי התחלתי (B, B⁻¹)' },
    { id: 'step2', label: 'הערך את הפתרון הבסיסי — חשב את xB ואת Z' },
    { id: 'step3', label: 'מי נכנס? — חשב את yᵀ ואת rN' },
    { id: 'step4', label: 'מי יוצא? — חשב את n̄q ובצע מבחן יחס' },
    { id: 'step5', label: 'עדכן את B ואת B⁻¹ וחזור להערכת הפתרון' },
  ];

  var QUANTITIES = [
    { id: 'Blist', label: 'הקבוצה B — המשתנים הבסיסיים (לפי סדר!)' },
    { id: 'Bmatrix', label: 'המטריצה B' },
    { id: 'Binv', label: 'B⁻¹ — המטריצה ההופכית של B' },
    { id: 'cB', label: 'הווקטור cB' },
    { id: 'Nlist', label: 'הקבוצה N — המשתנים הלא-בסיסיים' },
    { id: 'Nmatrix', label: 'המטריצה N' },
    { id: 'cN', label: 'הווקטור cN' },
    { id: 'xB', label: 'הווקטור xB — ערכי המשתנים הבסיסיים' },
    { id: 'Z', label: 'Z — ערך פונקציית המטרה' },
    { id: 'y', label: 'הווקטור yᵀ' },
    { id: 'rN', label: 'הווקטור rN — המקדמים המתוקנים' },
    { id: 'aQ', label: 'aq — עמודת המשתנה הנכנס בבעיה המקורית' },
    { id: 'nBarQ', label: 'n̄q — עמודת המשתנה הנכנס בטבלו הנוכחי' },
    { id: 'ratios', label: 'מבחן היחס — היחסים (xB)ᵢ/(n̄q)ᵢ' },
  ];

  var Q_HINTS = {
    Blist: {
      what: 'הקבוצה B היא רשימה סדורה של המשתנים הבסיסיים — הסדר קובע!',
      how: 'בהתחלה: משתני הסרק לפי סדר האילוצים. אחרי החלפה: המשתנה הנכנס תופס בדיוק את המקום של המשתנה היוצא.',
      dims: 'כמה משתנים יש בבסיס? בדיוק כמספר האילוצים (m).',
    },
    Bmatrix: {
      what: 'המטריצה B מורכבת מעמודות הבעיה המקורית (A|I) של המשתנים הבסיסיים.',
      how: 'בחר את העמודות לפי סדר הקבוצה B — תמיד מהמטריצה המקורית, לעולם לא מהטבלו הנוכחי!',
      dims: 'ל-B יש שורה לכל אילוץ ועמודה לכל משתנה בסיסי — מטריצה ריבועית m×m.',
    },
    Binv: {
      what: 'B⁻¹ — המטריצה ההופכית של B. היא הלב של הסימפלקס המעודכן.',
      how: 'אפשר לעדכן את B⁻¹ הקודמת בפעולות שורה שמעבירות את n̄q לווקטור היחידה של השורה שממנה יצא המשתנה (המחשבון המוטמע עוזר), או להפוך את B ישירות.',
      dims: 'הופכית של מטריצה ריבועית m×m היא m×m.',
    },
    cB: {
      what: 'cB — מקדמי פונקציית המטרה המקורית של המשתנים הבסיסיים.',
      how: 'לכל משתנה ב-B (לפי הסדר!) קח את המקדם שלו מ-cᵀ המקורי. למשתני סרק המקדם הוא 0.',
      dims: 'וקטור שורה עם ערך אחד לכל משתנה בסיסי: 1×m.',
    },
    Nlist: {
      what: 'הקבוצה N — המשתנים שאינם בבסיס באיטרציה הנוכחית.',
      how: 'בהתחלה: המשתנים המקוריים. אחרי החלפה: המשתנה היוצא תופס את מקומו של המשתנה שנכנס.',
      dims: 'כמה משתנים מחוץ לבסיס? n (מספר המשתנים המקוריים).',
    },
    Nmatrix: {
      what: 'המטריצה N מורכבת מעמודות הבעיה המקורית של המשתנים הלא-בסיסיים.',
      how: 'בחר את העמודות לפי סדר הקבוצה N — מהמטריצה המקורית (A|I).',
      dims: 'שורה לכל אילוץ, עמודה לכל משתנה לא-בסיסי: m×n.',
    },
    cN: {
      what: 'cN — מקדמי פונקציית המטרה המקורית של המשתנים הלא-בסיסיים.',
      how: 'לכל משתנה ב-N (לפי הסדר!) קח את המקדם שלו מ-cᵀ המקורי.',
      dims: 'וקטור שורה: 1×n.',
    },
    xB: {
      what: 'ערכי המשתנים הבסיסיים בפתרון הנוכחי.',
      how: 'xB = B⁻¹ · b — כפל את B⁻¹ הנוכחית ב-b המקורי (תמיד ב-b ההתחלתי!).',
      dims: 'ערך אחד לכל משתנה בסיסי — וקטור עמודה m×1.',
    },
    Z: {
      what: 'ערך פונקציית המטרה בפתרון הבסיסי הנוכחי.',
      how: 'Z = cB · xB (מכפלה סקלרית).',
      dims: '',
    },
    y: {
      what: 'הווקטור yᵀ (באיטרציה האחרונה — מחירי הצל!).',
      how: 'yᵀ = cB · B⁻¹.',
      dims: 'וקטור שורה: 1×m.',
    },
    rN: {
      what: 'המקדמים המתוקנים של המשתנים הלא-בסיסיים בפונקציית המטרה.',
      how: 'rN = cN − yᵀ·N — לכל עמודה של N: המקדם המקורי פחות y כפול העמודה.',
      dims: 'ערך אחד לכל משתנה לא-בסיסי — וקטור שורה 1×n.',
    },
    aQ: {
      what: 'aq — העמודה של המשתנה הנכנס בבעיה המקורית (A|I), לא בטבלו הנוכחי!',
      how: 'מצא את העמודה של המשתנה שנכנס במטריצה המקורית. בשלב הבא נכפיל אותה ב-B⁻¹.',
      dims: 'עמודה אחת מהבעיה המקורית — וקטור עמודה m×1.',
    },
    nBarQ: {
      what: 'עמודת המשתנה הנכנס כפי שהיא נראית בטבלו הנוכחי.',
      how: 'n̄q = B⁻¹ · aq, כאשר aq היא עמודת המשתנה הנכנס בבעיה המקורית (A|I).',
      dims: 'עמודה בטבלו — וקטור עמודה m×1.',
    },
    ratios: {
      what: 'מבחן היחס קובע מי יוצא מהבסיס: (xB)ᵢ חלקי (n̄q)ᵢ.',
      how: 'חשב יחס רק בשורות שבהן (n̄q)ᵢ חיובי; בשורות האחרות סמן "-". המשתנה בשורת היחס הקטן ביותר יוצא.',
      dims: 'יחס אחד לכל שורת בסיס — וקטור עמודה m×1.',
    },
  };

  var D_HINTS = {
    stop1: {
      what: 'הסתכל על הסימנים של כל רכיבי rN.',
      how: 'אם כל הערכים ≤ 0 — הפתרון אופטימלי ועוצרים. אם קיים ערך חיובי — ממשיכים ובוחרים משתנה נכנס.',
    },
    entering: {
      what: 'המשתנה הנכנס נבחר לפי rN.',
      how: 'בחר את המשתנה הלא-בסיסי עם המקדם החיובי ביותר ב-rN.',
    },
    stop2: {
      what: 'הסתכל על הסימנים של רכיבי n̄q.',
      how: 'אם כל הערכים ≤ 0 — אין את מי להוציא מהבסיס והבעיה לא חסומה. אחרת ממשיכים למבחן היחס.',
    },
    leaving: {
      what: 'המשתנה היוצא נקבע במבחן היחס.',
      how: 'חשב (xB)ᵢ / (n̄q)ᵢ לכל שורה שבה n̄q חיובי, ובחר את המשתנה בשורה עם היחס הקטן ביותר.',
    },
  };

  function colVec(v) { return v.map(function (x) { return [x]; }); }

  function quantityStep(id, qtype, dims, correct, extra) {
    var st = { kind: 'quantity', key: id, quantityId: id, qtype: qtype, dims: dims, correct: correct };
    if (extra) Object.keys(extra).forEach(function (k) { st[k] = extra[k]; });
    return st;
  }

  function buildSetupSteps(s) {
    var g = s.setupCanonical;
    var m = s.problem.m;
    var n = s.problem.n;
    return [
      { kind: 'stepRecall', key: 'recall-setup', correctStep: 'step1', first: true },
      quantityStep('Blist', 'indexList', null, g.B),
      quantityStep('Bmatrix', 'columnPick', [m, m], g.B),
      quantityStep('Binv', 'grid', [m, m], g.Binv),
      quantityStep('cB', 'grid', [1, m], [g.cB]),
      quantityStep('Nlist', 'indexList', null, g.N),
      quantityStep('Nmatrix', 'columnPick', [m, n], g.N),
      quantityStep('cN', 'grid', [1, n], [g.cN]),
    ];
  }

  function buildIterationSteps(s, c) {
    var m = s.problem.m;
    var n = s.problem.n;
    var steps = [
      { kind: 'stepRecall', key: 'recall-step2', correctStep: 'step2' },
      quantityStep('xB', 'grid', [m, 1], colVec(c.xB)),
      quantityStep('Z', 'scalar', null, c.Z),
      { kind: 'stepRecall', key: 'recall-step3', correctStep: 'step3' },
      quantityStep('y', 'grid', [1, m], [c.y]),
      quantityStep('rN', 'grid', [1, n], [c.rN]),
      { kind: 'decision', key: 'stop1', decision: 'stop1' },
    ];
    if (c.optimal) return steps;
    steps.push({ kind: 'decision', key: 'entering', decision: 'entering' });
    steps.push({ kind: 'stepRecall', key: 'recall-step4', correctStep: 'step4' });
    steps.push(quantityStep('aQ', 'columnPick', [m, 1], [c.q]));
    steps.push(quantityStep('nBarQ', 'grid', [m, 1], colVec(c.nBarQ)));
    steps.push({ kind: 'decision', key: 'stop2', decision: 'stop2' });
    if (c.unbounded) return steps;
    steps.push(quantityStep('ratios', 'ratios', [m, 1], c.ratios.slice()));
    steps.push({ kind: 'decision', key: 'leaving', decision: 'leaving' });
    steps.push({ kind: 'stepRecall', key: 'recall-step5', correctStep: 'step5' });
    steps.push(quantityStep('Blist', 'indexList', null, c.nextB));
    steps.push(quantityStep('Bmatrix', 'columnPick', [m, m], c.nextB));
    steps.push(quantityStep('Binv', 'grid', [m, m], c.nextBinv, { calculator: true }));
    steps.push(quantityStep('cB', 'grid', [1, m], [c.nextCB]));
    steps.push(quantityStep('Nlist', 'indexList', null, c.nextN));
    steps.push(quantityStep('Nmatrix', 'columnPick', [m, n], c.nextN));
    steps.push(quantityStep('cN', 'grid', [1, n], [c.nextCN]));
    return steps;
  }

  function initialSubstage(step) {
    if (!step) return null;
    if (step.kind === 'quantity') return step.qtype === 'scalar' ? 'fill' : 'recall';
    return 'choose';
  }

  function createSession(problem, opts) {
    opts = opts || {};
    var full = Engine.buildFullProblem(problem);
    var s = {
      problem: problem,
      AFull: full.AFull,
      cFull: full.cFull,
      mode: 'forward',           // 'forward' | 'reverse'
      examMode: !!opts.examMode,
      phase: 'setup',            // 'setup' | 'iter' | 'done'
      status: 'in-progress',     // 'in-progress' | 'optimal' | 'unbounded'
      iterIndex: -1,             // 0-based; -1 during setup
      setupCanonical: Engine.setupInitialBasis(problem),
      canonical: null,           // per-iteration canonical values
      iterations: [],
      stepQueue: [],
      stepIndex: 0,
      substage: null,
      history: [],               // {iter, Z, entering, leaving}
      helpLog: [],               // {phase, iter, key, substage, level}
      autoLog: [],               // auto-computed algebra (NOT counted as help)
      errorLog: [],              // {phase, iter, key} — one per wrong submission
      elapsedMs: 0,              // accumulated across resumes (exam mode)
      finalResult: null,
    };
    s.stepQueue = buildSetupSteps(s);
    s.substage = initialSubstage(s.stepQueue[0]);
    return s;
  }

  /** Record a wrong submission (drives the exam-mode error report). */
  function recordError(s) {
    var st = getCurrent(s);
    s.errorLog.push({ phase: s.phase, iter: s.iterIndex, key: st ? st.key : '?' });
  }

  function getCurrent(s) {
    return s.stepQueue[s.stepIndex] || null;
  }

  function startIteration(s, given) {
    s.phase = 'iter';
    s.iterIndex++;
    var c = { given: given };
    c.xB = Engine.computeXB(given.Binv, s.problem.b);
    c.Z = Engine.computeZ(given.cB, c.xB);
    c.y = Engine.computeY(given.cB, given.Binv);
    c.NMatrix = Engine.computeNMatrix(s.AFull, given.N);
    c.rN = Engine.computeRN(given.cN, c.y, c.NMatrix);
    c.optimal = Engine.decideOptimal(c.rN);
    if (!c.optimal) {
      var ent = Engine.decideEntering(c.rN, given.N);
      c.q = ent.q;
      c.aQ = Engine.getColumn(s.AFull, c.q);
      c.nBarQ = Engine.computeNBarQ(given.Binv, c.aQ);
      c.unbounded = Engine.decideUnbounded(c.nBarQ);
      if (!c.unbounded) {
        c.ratios = Engine.computeRatios(c.xB, c.nBarQ);
        var lv = Engine.decideLeaving(c.xB, c.nBarQ, given.B);
        c.p = lv.p;
        c.pivotRow = lv.row;
        var nb = Engine.computeNextBasis(given.B, given.N, c.p, c.q);
        c.nextB = nb.B;
        c.nextN = nb.N;
        c.nextBinv = Engine.computeNextBinv(given.Binv, c.nBarQ, c.pivotRow);
        c.nextCB = Engine.pickCosts(s.cFull, c.nextB);
        c.nextCN = Engine.pickCosts(s.cFull, c.nextN);
      }
    }
    s.canonical = c;
    s.iterations.push(c);
    s.stepQueue = buildIterationSteps(s, c);
    s.stepIndex = 0;
    s.substage = initialSubstage(getCurrent(s));
  }

  function finishQueue(s) {
    if (s.phase === 'setup') {
      startIteration(s, s.setupCanonical);
      return;
    }
    var c = s.canonical;
    if (c.optimal) {
      s.status = 'optimal';
      s.phase = 'done';
      s.finalResult = Engine.computeFinalOptimalResult(s.problem, c.given, c.xB, c.rN);
    } else if (c.unbounded) {
      s.status = 'unbounded';
      s.phase = 'done';
      s.finalResult = { enteringVar: c.q, nBarQ: c.nBarQ.slice(), Z: c.Z, B: c.given.B.slice() };
    } else {
      s.history.push({ iter: s.iterIndex, Z: c.Z, entering: c.q, leaving: c.p });
      startIteration(s, {
        B: c.nextB, N: c.nextN, Binv: c.nextBinv, cB: c.nextCB, cN: c.nextCN,
      });
    }
  }

  function advance(s) {
    var st = getCurrent(s);
    if (st && st.kind === 'quantity') {
      if (s.substage === 'recall') { s.substage = 'dims'; return; }
      if (s.substage === 'dims') { s.substage = 'fill'; return; }
    }
    s.stepIndex++;
    if (s.stepIndex >= s.stepQueue.length) {
      finishQueue(s);
      return;
    }
    s.substage = initialSubstage(getCurrent(s));
  }

  /* ---- submissions (each advances the session on success) ---- */

  function settle(s, res) {
    if (res.ok) advance(s);
    else recordError(s);
    return res;
  }

  function submitStepRecall(s, stepId) {
    var st = getCurrent(s);
    return settle(s, { ok: stepId === st.correctStep });
  }

  function submitQuantityRecall(s, quantityId) {
    var st = getCurrent(s);
    return settle(s, { ok: quantityId === st.quantityId });
  }

  /** dims: {size} for indexList, {rows, cols} for grid/columnPick. */
  function submitDims(s, dims) {
    var st = getCurrent(s);
    var ok = st.qtype === 'indexList'
      ? dims.size === st.correct.length
      : dims.rows === st.dims[0] && dims.cols === st.dims[1];
    return settle(s, { ok: ok });
  }

  function submitScalar(s, str) {
    return settle(s, Check.checkScalar(str, getCurrent(s).correct));
  }

  function submitGrid(s, strs) {
    return settle(s, Check.checkGrid(strs, getCurrent(s).correct));
  }

  function submitIndexList(s, values) {
    return settle(s, Check.checkIndexList(values, getCurrent(s).correct));
  }

  function submitColumnPick(s, picked) {
    return settle(s, Check.checkIndexList(picked, getCurrent(s).correct));
  }

  /** Ratio-test vector: numbers, with "-" for rows where nBarQ_i <= 0. */
  function submitRatios(s, strs) {
    return settle(s, Check.checkRatioVec(strs, getCurrent(s).correct));
  }

  function getCorrectChoice(s) {
    var st = getCurrent(s);
    var c = s.canonical;
    if (st.kind === 'stepRecall') return st.correctStep;
    if (st.kind === 'quantity') return st.quantityId;
    if (st.decision === 'stop1') return c.optimal ? 'stop' : 'continue';
    if (st.decision === 'stop2') return c.unbounded ? 'stop' : 'continue';
    if (st.decision === 'entering') return c.q;
    if (st.decision === 'leaving') return c.p;
    return null;
  }

  function submitDecision(s, choice) {
    var st = getCurrent(s);
    var c = s.canonical;
    var g = c.given;
    var ok = false;
    var note = null;
    if (st.decision === 'stop1') {
      ok = choice === (c.optimal ? 'stop' : 'continue');
    } else if (st.decision === 'stop2') {
      ok = choice === (c.unbounded ? 'stop' : 'continue');
    } else if (st.decision === 'entering') {
      ok = Engine.isAcceptableEnteringChoice(c.rN, g.N, choice);
      if (ok && choice !== c.q) {
        note = 'גם x' + choice + ' בחירה תקפה (תיקו ב-rN). לצורך ההמשך נתקדם עם x' + c.q + '.';
      }
    } else if (st.decision === 'leaving') {
      ok = Engine.isAcceptableLeavingChoice(c.xB, c.nBarQ, g.B, choice);
      if (ok && choice !== c.p) {
        note = 'גם x' + choice + ' בחירה תקפה (תיקו במבחן היחס). לצורך ההמשך נתקדם עם x' + c.p + '.';
      }
    }
    if (ok) advance(s);
    else recordError(s);
    return { ok: ok, note: note };
  }

  /* ---- help / hints ---- */

  function recordHelp(s, level) {
    var st = getCurrent(s);
    s.helpLog.push({
      phase: s.phase,
      iter: s.iterIndex,
      key: st ? st.key : '?',
      substage: s.substage,
      level: level,
    });
  }

  /** Auto-computed pure algebra (e.g. B⁻¹) — a legitimate shortcut, tracked
   *  separately from help and never shown as a weakness. */
  function recordAuto(s) {
    var st = getCurrent(s);
    s.autoLog.push({ phase: s.phase, iter: s.iterIndex, key: st ? st.key : '?' });
  }

  function autoSummary(s) {
    return s.autoLog.map(function (e) {
      return { where: e.phase === 'setup' ? 'הקמה' : 'איטרציה ' + (e.iter + 1), key: e.key };
    });
  }

  function quantityLabel(id) {
    for (var i = 0; i < QUANTITIES.length; i++) {
      if (QUANTITIES[i].id === id) return QUANTITIES[i].label;
    }
    return id;
  }

  /** Progressive textual hint for the CURRENT step+substage (levels 1..2). */
  function getHint(s, level) {
    recordHelp(s, level);
    var st = getCurrent(s);
    if (!st) return '';
    if (st.kind === 'stepRecall') {
      if (level === 1) return 'חשוב: מה בדיוק סיימנו הרגע, ומה ההמשך הטבעי לפי מחזור האלגוריתם?';
      return 'סדר האלגוריתם: ' + COURSE_STEPS.map(function (cs) { return cs.label; }).join('  ←  ');
    }
    if (st.kind === 'decision') {
      var d = D_HINTS[st.decision];
      var text = level === 1 ? d.what : d.how;
      if (st.decision === 'leaving' && level >= 2 && s.canonical && s.canonical.ratios) {
        var g = s.canonical.given;
        var parts = s.canonical.ratios.map(function (r, i) {
          if (r === null) return 'x' + g.B[i] + ': —';
          return 'x' + g.B[i] + ': ' + s.canonical.xB[i] + '/' + s.canonical.nBarQ[i];
        });
        text += ' היחסים: ' + parts.join(' ; ');
      }
      return text;
    }
    var h = Q_HINTS[st.quantityId];
    if (s.substage === 'recall') {
      return level === 1
        ? 'אנחנו בתוך ' + currentCourseStepLabel(s) + '. איזה גודל מגדירים עכשיו?'
        : h.what;
    }
    if (s.substage === 'dims') return h.dims || h.what;
    return level === 1 ? h.what : h.how;
  }

  function currentCourseStepLabel(s) {
    // last passed stepRecall's label
    for (var i = s.stepIndex; i >= 0; i--) {
      var st = s.stepQueue[i];
      if (st && st.kind === 'stepRecall') {
        for (var j = 0; j < COURSE_STEPS.length; j++) {
          if (COURSE_STEPS[j].id === st.correctStep) return COURSE_STEPS[j].label;
        }
      }
    }
    return 'האלגוריתם';
  }

  /** Full reveal (level 3). Returns the correct answer for the current sub-stage. */
  function revealCurrent(s) {
    recordHelp(s, 3);
    var st = getCurrent(s);
    if (st.kind === 'stepRecall' || st.kind === 'decision') {
      return { type: 'choice', value: getCorrectChoice(s) };
    }
    if (s.substage === 'recall') return { type: 'choice', value: st.quantityId };
    if (s.substage === 'dims') {
      return {
        type: 'dims',
        value: st.qtype === 'indexList'
          ? { size: st.correct.length }
          : { rows: st.dims[0], cols: st.dims[1] },
      };
    }
    return { type: 'values', value: st.correct };
  }

  /* ---- "why is this correct?" (shown AFTER a correct answer) ---- */

  var STEP_WHY = {
    step1: 'לפני שמחשבים דבר צריך פתרון בסיסי ישים. בסיס משתני הסרק נותן B = I, ולכן B⁻¹ = I מיידית — נקודת פתיחה חוקית וזולה.',
    step2: 'יש בסיס ו-B⁻¹ עדכניים — הדבר הראשון בכל איטרציה הוא להעריך את הפתרון הנוכחי: xB ואז Z.',
    step3: 'אחרי שהערכנו את הפתרון בודקים אם אפשר לשפר: yᵀ ואז rN מגלים איזה משתנה כדאי להכניס לבסיס.',
    step4: 'נבחר משתנה נכנס — עכשיו קובעים מי מפנה לו מקום: מחשבים את עמודתו בטבלו הנוכחי ומבצעים מבחן יחס.',
    step5: 'יש נכנס ויש יוצא — נותר לעדכן את B, B⁻¹ והנגזרות שלהם, ולחזור להערכת הפתרון.',
  };

  function fmtVec(v) {
    return '(' + v.map(function (x) {
      return x === null ? '—' : Parse.formatNumber(x);
    }).join(', ') + ')';
  }

  function fmtSet(list) {
    return '{' + list.map(function (v) { return 'x' + v; }).join(', ') + '}';
  }

  /** Explanation of WHY the current step's correct answer is correct. */
  function getWhyForCurrent(s) {
    var st = getCurrent(s);
    if (!st) return '';
    var c = s.canonical;
    if (st.kind === 'stepRecall') return STEP_WHY[st.correctStep] || '';
    if (st.kind === 'decision') {
      var g = c.given;
      if (st.decision === 'stop1') {
        return c.optimal
          ? 'כל רכיבי rN = ' + fmtVec(c.rN) + ' אי-חיוביים — אף משתנה לא ישפר את Z, הפתרון אופטימלי.'
          : 'קיים רכיב חיובי ב-rN = ' + fmtVec(c.rN) + ' — עדיין אפשר לשפר את Z, ממשיכים.';
      }
      if (st.decision === 'entering') {
        return 'ל-x' + c.q + ' המקדם המתוקן החיובי הגדול ביותר: rN = ' + fmtVec(c.rN) +
          ' בסדר של N = ' + fmtSet(g.N) + '.';
      }
      if (st.decision === 'stop2') {
        return c.unbounded
          ? 'כל רכיבי n̄q = ' + fmtVec(c.nBarQ) + ' אי-חיוביים — שום שורה לא מגבילה את x' + c.q + ', הבעיה לא חסומה.'
          : 'יש רכיב חיובי ב-n̄q = ' + fmtVec(c.nBarQ) + ' — יש מי שמגביל את הכניסה, עוברים למבחן היחס.';
      }
      var parts = c.ratios.map(function (r, i) {
        return 'x' + g.B[i] + ': ' + (r === null ? '—' : Parse.formatNumber(r));
      });
      return 'היחס הקטן ביותר נמצא בשורת x' + c.p + '. היחסים: ' + parts.join(' ; ') + '.';
    }
    var h = Q_HINTS[st.quantityId] || {};
    if (s.substage === 'recall') return h.what || '';
    if (s.substage === 'dims') return h.dims || h.what || '';
    var how = h.how || '';
    if (st.qtype === 'scalar') {
      return how + ' התוצאה: ' + Parse.formatNumber(st.correct) + '.';
    }
    if (st.qtype === 'indexList' || st.qtype === 'columnPick') {
      var extra = '';
      if (s.phase === 'iter' && c && c.p != null &&
          (st.quantityId === 'Blist' || st.quantityId === 'Bmatrix')) {
        extra = ' כאן x' + c.q + ' נכנס בדיוק למקומו של x' + c.p + '.';
      }
      return how + extra + ' התוצאה: ' + fmtSet(st.correct) + '.';
    }
    if (st.qtype === 'ratios') {
      return how + ' כאן: ' + fmtVec(st.correct) + '.';
    }
    var flat = st.correct.map(function (row) { return fmtVec(row); }).join(' ; ');
    return how + ' עם הנתונים הנוכחיים מתקבל: ' + flat + '.';
  }

  /** Plain-text snapshot of the session, for the "ask Claude" sidebar. */
  function describeSession(s) {
    var p = s.problem;
    var lines = [];
    lines.push('הבעיה: Max Z = cᵀx, s.t. Ax ≤ b, x ≥ 0');
    lines.push('c = ' + fmtVec(p.c));
    p.A.forEach(function (row, i) {
      lines.push('אילוץ ' + (i + 1) + ': ' + fmtVec(row) + ' ≤ ' + Parse.formatNumber(p.b[i]));
    });
    if (s.phase === 'setup') {
      lines.push('מצב: הקמה — קביעת הבסיס ההתחלתי.');
    } else if (s.phase === 'done') {
      lines.push('מצב: התרגיל הסתיים (' + (s.status === 'optimal' ? 'פתרון אופטימלי' : 'לא חסום') + ').');
    } else {
      var g = s.canonical.given;
      lines.push('מצב: איטרציה ' + (s.iterIndex + 1) + '. B = ' + fmtSet(g.B) + ', N = ' + fmtSet(g.N));
      lines.push('B⁻¹ = ' + g.Binv.map(fmtVec).join(' ; '));
      lines.push('cB = ' + fmtVec(g.cB) + ' , cN = ' + fmtVec(g.cN));
    }
    var st = getCurrent(s);
    if (st) {
      var what;
      if (st.kind === 'stepRecall') what = 'זיהוי השלב הבא באלגוריתם';
      else if (st.kind === 'decision') what = 'החלטה (' + st.key + ')';
      else what = quantityLabel(st.quantityId) + ' — תת-שלב ' + s.substage;
      lines.push('השלב הנוכחי בתרגול: ' + what);
    }
    if (s.history.length) {
      lines.push('איטרציות שהושלמו: ' + s.history.map(function (h) {
        return 'איטרציה ' + (h.iter + 1) + ': Z=' + Parse.formatNumber(h.Z) +
          ', נכנס x' + h.entering + ', יצא x' + h.leaving;
      }).join(' | '));
    }
    return lines.join('\n');
  }

  /** Max help level per (phase-iter-key), for the end-of-exercise summary. */
  function helpSummary(s) {
    var byKey = {};
    s.helpLog.forEach(function (e) {
      var where = e.phase === 'setup' ? 'הקמה' : 'איטרציה ' + (e.iter + 1);
      var k = where + '|' + e.key;
      if (!byKey[k] || byKey[k].level < e.level) {
        byKey[k] = { where: where, key: e.key, level: e.level };
      }
    });
    return Object.keys(byKey).map(function (k) { return byKey[k]; });
  }

  /** Exam-mode report: total errors, and the steps with the most errors. */
  function examSummary(s) {
    var byKey = {};
    s.errorLog.forEach(function (e) {
      var where = e.phase === 'setup' ? 'הקמה' : 'איטרציה ' + (e.iter + 1);
      var label = keyDisplayName(e.key);
      var k = where + '|' + label;
      byKey[k] = byKey[k] || { where: where, label: label, count: 0 };
      byKey[k].count++;
    });
    var rows = Object.keys(byKey).map(function (k) { return byKey[k]; });
    rows.sort(function (a, b) { return b.count - a.count; });
    var score = Math.max(0, 100 - 3 * s.errorLog.length);
    return { totalErrors: s.errorLog.length, byStep: rows, score: score };
  }

  /* Human label for an errorLog key (reuses the quantity labels + decisions). */
  function keyDisplayName(key) {
    var DEC = {
      stop1: 'החלטת אופטימליות', entering: 'בחירת משתנה נכנס',
      stop2: 'בדיקת חסימות', leaving: 'מבחן יחס',
    };
    if (DEC[key]) return DEC[key];
    if (String(key).indexOf('recall') === 0) return 'זיהוי השלב';
    return quantityLabel(key);
  }

  var api = {
    COURSE_STEPS: COURSE_STEPS,
    QUANTITIES: QUANTITIES,
    createSession: createSession,
    getCurrent: getCurrent,
    submitStepRecall: submitStepRecall,
    submitQuantityRecall: submitQuantityRecall,
    submitDims: submitDims,
    submitScalar: submitScalar,
    submitGrid: submitGrid,
    submitIndexList: submitIndexList,
    submitColumnPick: submitColumnPick,
    submitRatios: submitRatios,
    submitDecision: submitDecision,
    getCorrectChoice: getCorrectChoice,
    getHint: getHint,
    getWhyForCurrent: getWhyForCurrent,
    describeSession: describeSession,
    recordHelp: recordHelp,
    recordAuto: recordAuto,
    recordError: recordError,
    autoSummary: autoSummary,
    revealCurrent: revealCurrent,
    helpSummary: helpSummary,
    examSummary: examSummary,
    quantityLabel: quantityLabel,
  };

  if (typeof window !== 'undefined') {
    window.Simplex = window.Simplex || {};
    window.Simplex.session = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
