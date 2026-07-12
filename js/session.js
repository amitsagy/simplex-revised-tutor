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
  var Generator = isNode ? require('./generator.js') : window.Simplex.generator;
  var Duality = isNode ? require('./duality.js') : window.Simplex.duality;
  var Tableau = isNode ? require('./tableau.js') : window.Simplex.tableau;

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
    if (step.kind === 'quantity') {
      if (step.qtype === 'scalar') return 'fill';
      if (step.directFill) return 'fill';  // prompt fully specifies shape (dual-simplex tableau/ratios)
      if (step.noRecall) return 'dims';    // reverse/duality: name given, but declare dimensions
      return 'recall';
    }
    return 'choose';
  }

  /* ---- reverse-engineering drill (homework Q3): rebuild the problem from
   * its optimal tableau. Same state machine, a self-contained step queue. ---- */

  function reverseQuiz(id, question, options, correct, why) {
    return { kind: 'quiz', key: id, question: question, options: options, correct: correct, why: why };
  }

  function buildReverseSteps(s) {
    var r = s.reverse;
    var n = s.problem.n, m = s.problem.m;
    var steps = [];

    steps.push(reverseQuiz('q-binv-loc',
      'בטבלה האופטימלית — <b>איפה קוראים את המטריצה B⁻¹?</b>',
      [
        { id: 'slacks', label: 'בעמודות משתני הסרק, בשורות האילוצים' },
        { id: 'zrow', label: 'בשורת ה-Z' },
        { id: 'orig', label: 'בעמודות המשתנים המקוריים' },
        { id: 'rhs', label: 'בעמודת ה-RHS' },
      ], 'slacks',
      'זהו העיקרון המרכזי (!!!): העמודות שמתחת למשתני הסרק, בשורות האילוצים, מרכיבות בדיוק את B⁻¹ של האיטרציה.'));

    steps.push({ kind: 'quantity', key: 'Binv', quantityId: 'Binv', qtype: 'grid',
      dims: [m, m], correct: r.Binv, noRecall: true,
      label: 'B⁻¹', why: 'העתקה ישירה מהאזור שמתחת למשתני הסרק בטבלה האופטימלית.' });

    steps.push({ kind: 'quantity', key: 'Bmatrix', quantityId: 'Bmatrix', qtype: 'grid',
      dims: [m, m], correct: r.Bmatrix, noRecall: true, inverseCalc: true,
      label: 'B', why: 'B מתקבלת מהיפוך B⁻¹ (למשל בדירוג [B⁻¹ | I]).' });

    steps.push(reverseQuiz('q-b-meaning',
      '<b>מה מייצגת המטריצה B?</b>',
      [
        { id: 'cols', label: 'עמודות הבעיה המקורית של המשתנים הבסיסיים' },
        { id: 'inv', label: 'ההופכית של הטבלה האופטימלית' },
        { id: 'slack', label: 'עמודות משתני הסרק' },
      ], 'cols',
      'B בנויה מהעמודות המקוריות של המשתנים הבסיסיים. כאן הבסיס הוא {x1, x2} — כל המשתנים המקוריים — ולכן B היא בדיוק מטריצת האילוצים A!'));

    steps.push(reverseQuiz('q-y-loc',
      '<b>איפה קוראים את yᵀ (מחירי הצל) בטבלה האופטימלית?</b>',
      [
        { id: 'zneg', label: 'בשורת ה-Z מתחת למשתני הסרק, בסימן הפוך' },
        { id: 'binv', label: 'מתחת למשתני הסרק בשורות האילוצים' },
        { id: 'rhs', label: 'בעמודת ה-RHS של שורת Z' },
      ], 'zneg',
      'מחירי הצל yᵀ = cB·B⁻¹ נמצאים בשורת פונקציית המטרה מתחת למשתני הסרק, בסימן הפוך.'));

    steps.push({ kind: 'quantity', key: 'y', quantityId: 'y', qtype: 'grid',
      dims: [1, m], correct: [r.y], noRecall: true,
      label: 'yᵀ', why: 'קריאת ערכי שורת ה-Z שמתחת למשתני הסרק, עם היפוך הסימן.' });

    steps.push({ kind: 'quantity', key: 'cB', quantityId: 'cB', qtype: 'grid',
      dims: [1, n], correct: [r.c], noRecall: true,
      label: 'cᵀ', why: 'מכיוון ש-yᵀ = cB·B⁻¹, מתקיים cBᵀ = yᵀ·B. כאן כל המשתנים בסיסיים, אז זה כל וקטור המקדמים c.',
      scratchPreset: { A: { label: 'yᵀ', values: [r.y] }, B: { label: 'B', values: r.Bmatrix }, resultLabel: 'cᵀ' } });

    steps.push({ kind: 'quantity', key: 'xB', quantityId: 'xB', qtype: 'grid',
      dims: [m, 1], correct: colVec(r.xB), noRecall: true,
      label: 'xB', why: 'ערכי המשתנים הבסיסיים בפתרון: xB = B⁻¹·b. אלה משלימים את עמודת ה-RHS בטבלה האופטימלית.',
      scratchPreset: { A: { label: 'B⁻¹', values: r.Binv }, B: { label: 'b', values: colVec(s.problem.b) }, resultLabel: 'xB' },
      rowLabels: r.basis });

    steps.push({ kind: 'quantity', key: 'Z', quantityId: 'Z', qtype: 'scalar',
      dims: null, correct: r.Z, noRecall: true,
      label: 'Z', why: 'ערך פונקציית המטרה: Z = yᵀ·b (או cB·xB).',
      scratchPreset: { A: { label: 'yᵀ', values: [r.y] }, B: { label: 'b', values: colVec(s.problem.b) }, resultLabel: 'Z' } });

    return steps;
  }

  function createReverseSession(problem) {
    var full = Engine.buildFullProblem(problem);
    var sim = Generator.simulate(problem, 6);
    var g = sim.given;
    var r = {
      basis: g.B.slice(),                       // ordered basic vars (== [1,2])
      Binv: g.Binv,
      Bmatrix: Engine.computeBMatrix(full.AFull, g.B),
      A: problem.A,
      y: sim.y,
      c: problem.c,
      xB: sim.xB,
      Z: Engine.computeZ(g.cB, sim.xB),
      b: problem.b,
    };
    var s = {
      problem: problem,
      AFull: full.AFull,
      cFull: full.cFull,
      mode: 'reverse',
      examMode: false,
      phase: 'reverse',
      status: 'in-progress',
      iterIndex: -1,
      reverse: r,
      canonical: null,
      iterations: [],
      stepQueue: [],
      stepIndex: 0,
      substage: null,
      history: [],
      helpLog: [],
      autoLog: [],
      errorLog: [],
      elapsedMs: 0,
      finalResult: null,
    };
    s.stepQueue = buildReverseSteps(s);
    s.substage = initialSubstage(s.stepQueue[0]);
    return s;
  }

  function submitQuiz(s, id) {
    var st = getCurrent(s);
    return settle(s, { ok: id === st.correct });
  }

  /* ---- duality drill (targil 9): build the dual from the primal ---- */

  function dualVarLabels(m) {
    var out = [];
    for (var i = 1; i <= m; i++) out.push('y' + i);
    return out;
  }
  function dedupOptions(opts) {
    var seen = {}, out = [];
    opts.forEach(function (o) { if (!seen[o.id]) { seen[o.id] = true; out.push(o); } });
    return out;
  }
  function vtypeText(t) {
    return t === 'ge0' ? 'אי-שלילי (≥0)' : t === 'le0' ? 'אי-חיובי (≤0)' : 'חופשי';
  }
  function ctypeText(t) { return t === 'le' ? '≤' : t === 'ge' ? '≥' : '='; }
  function domText(t) { return t === 'ge0' ? '≥0' : t === 'le0' ? '≤0' : 'חופשי'; }
  function dirWord(dir) { return dir === 'max' ? 'מקסימום' : 'מינימום'; }
  function relWhy(dir, vtype, ctype) {
    return 'לפי טבלת ההצמדה: בבעיית ' + dirWord(dir) + ', משתנה ' + vtypeText(vtype) +
      ' בבעיה הפרימלית גורר אילוץ דואלי מסוג ' + ctypeText(ctype) + '.';
  }
  function signWhy(dir, ctype, vtype) {
    return 'לפי טבלת ההצמדה: בבעיית ' + dirWord(dir) + ', אילוץ מסוג ' + ctypeText(ctype) +
      ' בבעיה הפרימלית גורר משתנה דואלי ' + domText(vtype) + '.';
  }

  function dualityQuiz(id, question, options, correct, why) {
    return { kind: 'quiz', key: id, question: question, options: options, correct: correct, why: why };
  }

  function buildDualitySteps(s) {
    var primal = s.duality.primal;
    var dual = s.duality.dual;
    var m = primal.A.length;   // # primal constraints  = # dual variables
    var n = primal.c.length;   // # primal variables    = # dual constraints
    var steps = [];

    steps.push(dualityQuiz('dual-dir',
      'הבעיה הפרימלית היא בעיית <b>' + dirWord(primal.dir) + '</b>. <b>איזו בעיה תהיה הדואלית שלה?</b>',
      [{ id: 'max', label: 'בעיית מקסימום (Max)' }, { id: 'min', label: 'בעיית מינימום (Min)' }],
      dual.dir,
      'ההצמדה תמיד הופכת את כיוון האופטימיזציה: הדואלית של בעיית Max היא בעיית Min, ולהפך.'));

    steps.push(dualityQuiz('dual-nvars',
      '<b>כמה משתני החלטה יהיו בבעיה הדואלית?</b>',
      dedupOptions([{ id: m, label: String(m) }, { id: n, label: String(n) }, { id: m + n, label: String(m + n) }]),
      m,
      'לכל אילוץ בבעיה הפרימלית מתאים משתנה דואלי אחד — מספר המשתנים הדואליים שווה למספר האילוצים הפרימליים (' + m + ').'));

    steps.push(dualityQuiz('dual-ncons',
      '<b>כמה אילוצים פונקציונליים יהיו בבעיה הדואלית?</b>',
      dedupOptions([{ id: n, label: String(n) }, { id: m, label: String(m) }, { id: m + n, label: String(m + n) }]),
      n,
      'לכל משתנה בבעיה הפרימלית מתאים אילוץ דואלי אחד — מספר האילוצים הדואליים שווה למספר המשתנים הפרימליים (' + n + ').'));

    steps.push({ kind: 'quantity', key: 'dualObj', quantityId: 'dualObj', qtype: 'grid',
      dims: [1, m], correct: [dual.c.slice()], noRecall: true,
      colLabels: dualVarLabels(m),
      label: 'מקדמי פונקציית המטרה הדואלית',
      why: 'מקדמי היעד של הבעיה הדואלית הם אגף ימין (b) של הבעיה הפרימלית.' });

    for (var j = 0; j < n; j++) {
      var col = primal.A.map(function (row) { return row[j]; });   // primal column j = A^T row j
      steps.push({ kind: 'quantity', key: 'dualCon' + j, quantityId: 'dualCon' + j, qtype: 'grid',
        dims: [1, m + 1], correct: [col.concat([dual.b[j]])], noRecall: true,
        colLabels: dualVarLabels(m).concat(['אגף ימין']),
        label: 'האילוץ הדואלי מס׳ ' + (j + 1) + ' (מתאים ל-x' + (j + 1) + ')',
        why: 'האילוץ הדואלי המתאים ל-x' + (j + 1) + ': המקדמים הם עמודה ' + (j + 1) +
          ' של A (שורה ' + (j + 1) + ' ב-Aᵀ), ואגף ימין הוא המקדם c' + (j + 1) + ' של x' + (j + 1) + ' בפונקציית המטרה הפרימלית.' });
      steps.push(dualityQuiz('dualRel' + j,
        'מה <b>סוג האילוץ</b> הדואלי המתאים ל-x' + (j + 1) + ' (שהוא ' + vtypeText(primal.vtypes[j]) + ')?',
        [{ id: 'ge', label: '≥ (גדול-שווה)' }, { id: 'eq', label: '= (שוויון)' }, { id: 'le', label: '≤ (קטן-שווה)' }],
        dual.ctypes[j],
        relWhy(primal.dir, primal.vtypes[j], dual.ctypes[j])));
    }

    for (var i = 0; i < m; i++) {
      steps.push(dualityQuiz('dualSign' + i,
        'מה <b>התחום</b> של המשתנה הדואלי y' + (i + 1) + ' (המתאים לאילוץ הפרימלי מס׳ ' + (i + 1) +
        ', מסוג ' + ctypeText(primal.ctypes[i]) + ')?',
        [{ id: 'ge0', label: 'y' + (i + 1) + ' ≥ 0' }, { id: 'free', label: 'y' + (i + 1) + ' חופשי' }, { id: 'le0', label: 'y' + (i + 1) + ' ≤ 0' }],
        dual.vtypes[i],
        signWhy(primal.dir, primal.ctypes[i], dual.vtypes[i])));
    }

    return steps;
  }

  function createDualitySession(primal, opts) {
    opts = opts || {};
    var dual = Duality.buildDual(primal);
    var s = {
      problem: { n: primal.c.length, m: primal.A.length, c: primal.c, A: primal.A, b: primal.b },
      mode: 'duality',
      examMode: !!opts.examMode,
      phase: 'duality',
      status: 'in-progress',
      iterIndex: -1,
      duality: { primal: primal, dual: dual },
      canonical: null,
      iterations: [],
      stepQueue: [],
      stepIndex: 0,
      substage: null,
      history: [],
      helpLog: [],
      autoLog: [],
      errorLog: [],
      elapsedMs: 0,
      finalResult: null,
    };
    s.stepQueue = buildDualitySteps(s);
    s.substage = initialSubstage(s.stepQueue[0]);
    return s;
  }

  /* ---- dual-simplex drill (targil 10): solve a Min problem by dual simplex ---- */

  function tblName(t, id) { return t.names[t.vars.indexOf(id)]; }

  function buildDsimSteps(s, first) {
    var cur = s.tableau;
    var dc = s.dsCanon;
    var steps = [];

    if (first) {
      steps.push(dualityQuiz('ds-first',
        'בסימפלקס דואלי — <b>מה בוחרים קודם</b> בכל איטרציה?',
        [{ id: 'leaving', label: 'קודם את המשתנה היוצא (ה-RHS השלילי ביותר)' },
          { id: 'entering', label: 'קודם את המשתנה הנכנס' }],
        'leaving',
        'זה ההבדל המרכזי מהסימפלקס הרגיל: כאן בוחרים קודם את המשתנה היוצא — השורה עם ה-RHS השלילי ביותר — ורק אחר כך את הנכנס לפי מבחן היחס.'));
    }

    steps.push(dualityQuiz('ds-leaving',
      'איזה משתנה <b>יוצא</b> מהבסיס?',
      cur.basis.map(function (id) { return { id: id, label: tblName(cur, id) }; }),
      dc.leaveVar,
      'בוחרים את המשתנה הבסיסי בשורה עם ה-RHS השלילי ביותר: כאן ' + tblName(cur, dc.leaveVar) +
      ' (RHS = ' + Parse.formatNumber(cur.rhs[dc.leaveRow]) + ').'));

    steps.push({ kind: 'quantity', key: 'ds-ratios', quantityId: 'ds-ratios', qtype: 'ratios',
      correct: dc.ratios.slice(), directFill: true, rowLabels: cur.names.slice(),
      label: 'מבחן היחס',
      ratioPrompt: 'בשורת המשתנה היוצא (' + tblName(cur, dc.leaveVar) +
        ') חשב בכל עמודה |מקדם שורת ה-Z ÷ מקדם השורה| — רק כאשר מקדם השורה שלילי. בעמודות האחרות סמן "-".',
      why: 'מבחן היחס הדואלי: המינימום, על העמודות שבהן מקדם שורת היוצא שלילי, של |r_k ÷ a_k|. הבחירה הזו שומרת על אי-חיוביות שורת ה-Z (כלומר על האופטימליות).' });

    var candVars = [];
    dc.ratios.forEach(function (r, k) { if (r !== null) candVars.push(cur.vars[k]); });
    steps.push(dualityQuiz('ds-entering',
      'איזה משתנה <b>נכנס</b> לבסיס? (העמודה עם היחס הקטן ביותר)',
      candVars.map(function (id) { return { id: id, label: tblName(cur, id) }; }),
      dc.enterVar,
      'המשתנה בעמודה עם היחס הקטן ביותר במבחן היחס נכנס — כאן ' + tblName(cur, dc.enterVar) + '.'));

    var next = dc.next;
    var gridCorrect = [next.zRow.concat([next.zRHS])].concat(
      next.rows.map(function (r, i) { return r.concat([next.rhs[i]]); }));
    steps.push({ kind: 'quantity', key: 'ds-tableau', quantityId: 'ds-tableau', qtype: 'grid',
      dims: [next.m + 1, next.ncols + 1], correct: gridCorrect, directFill: true, autoFill: true,
      colLabels: next.names.concat(['RHS']),
      rowLabels: ['Z'].concat(next.basis.map(function (id) { return tblName(next, id); })),
      label: 'הטבלה החדשה (אחרי הפיבוט)',
      why: 'מבצעים פיבוט על העמודה הנכנסת בשורת היוצאת: פעולות שורה שמביאות את איבר הציר ל-1 ומאפסות את שאר העמודה — כולל בשורת ה-Z.' });

    steps.push(dualityQuiz('ds-feasible',
      'הסתכל על עמודת ה-RHS החדשה: <b>האם הפתרון ישים כעת?</b>',
      [{ id: 'stop', label: 'כן — כל ה-RHS אי-שליליים, עוצרים (אופטימלי)' },
        { id: 'continue', label: 'לא — נדרשת עוד איטרציה' }],
      dc.feasibleAfter ? 'stop' : 'continue',
      dc.feasibleAfter
        ? 'כל רכיבי ה-RHS אי-שליליים — הפתרון ישים, ומכיוון ששורת ה-Z נשארה אי-חיובית הוא גם אופטימלי.'
        : 'עדיין קיים RHS שלילי — הפתרון אינו ישים, ממשיכים לאיטרציה נוספת.'));

    return steps;
  }

  function startDsimIteration(s, first) {
    s.phase = 'dsim';
    s.iterIndex++;
    var cur = s.tableau;
    var lv = Tableau.dsLeaving(cur);
    var ratios = Tableau.dsRatios(cur, lv.row);
    var en = Tableau.dsEntering(cur, ratios);
    var next = Tableau.dsPivot(cur, lv.row, en.col);
    s.dsCanon = {
      leaveRow: lv.row, leaveVar: lv.varId, ratios: ratios,
      enterCol: en.col, enterVar: en.varId, next: next,
      feasibleAfter: Tableau.isFeasible(next),
    };
    s.stepQueue = buildDsimSteps(s, first);
    s.stepIndex = 0;
    s.substage = initialSubstage(getCurrent(s));
  }

  function createDualSimplexSession(minProblem, opts) {
    opts = opts || {};
    var s = {
      problem: { n: minProblem.n, m: minProblem.m, c: minProblem.c, A: minProblem.A, b: minProblem.b },
      mode: 'dualsimplex',
      examMode: !!opts.examMode,
      phase: 'dsim',
      status: 'in-progress',
      iterIndex: -1,
      dsim: { minProblem: minProblem },
      tableau: Tableau.initialDualTableau(minProblem),
      dsCanon: null,
      dsHistory: [],
      canonical: null,
      iterations: [],
      stepQueue: [],
      stepIndex: 0,
      substage: null,
      history: [],
      helpLog: [],
      autoLog: [],
      errorLog: [],
      elapsedMs: 0,
      finalResult: null,
    };
    startDsimIteration(s, true);
    return s;
  }

  /* ---- sensitivity-analysis drill (targil 10) ---- */

  /** Full optimal state from a stored basis (order matters). All plain data. */
  function optStateFromBasis(problem, basis) {
    var full = Engine.buildFullProblem(problem);
    var total = problem.n + problem.m;
    var B = basis.slice();
    var N = [];
    for (var v = 1; v <= total; v++) if (B.indexOf(v) < 0) N.push(v);
    var Binv = Engine.invert(Engine.computeBMatrix(full.AFull, B));
    var cB = Engine.pickCosts(full.cFull, B);
    var cN = Engine.pickCosts(full.cFull, N);
    var xB = Engine.computeXB(Binv, problem.b);
    var y = Engine.computeY(cB, Binv);
    var NMatrix = Engine.computeNMatrix(full.AFull, N);
    var rN = Engine.computeRN(cN, y, NMatrix);
    return { B: B, N: N, Binv: Binv, cB: cB, cN: cN, xB: xB, y: y, NMatrix: NMatrix, rN: rN, full: full };
  }

  function sensGrid(key, label, dims, correct, extra) {
    var st = { kind: 'quantity', key: key, quantityId: key, qtype: 'grid',
      dims: dims, correct: correct, directFill: true, label: label };
    if (extra) Object.keys(extra).forEach(function (k) { st[k] = extra[k]; });
    return st;
  }
  function sensScalar(key, label, correct, extra) {
    var st = { kind: 'quantity', key: key, quantityId: key, qtype: 'scalar',
      correct: correct, directFill: true, label: label };
    if (extra) Object.keys(extra).forEach(function (k) { st[k] = extra[k]; });
    return st;
  }
  function nn(x) { return x >= -Engine.ENGINE_EPS; }
  function np(x) { return x <= Engine.ENGINE_EPS; }

  function buildSensitivitySteps(s) {
    var sn = s.sens, opt = sn.opt, ch = sn.change;
    var m = sn.problem.m;
    var steps = [];
    var res = {};

    if (ch.kind === 'read-opt') {
      steps.push(sensGrid('sens-xB', 'ערכי המשתנים הבסיסיים xB', [m, 1], colVec(opt.xB),
        { rowLabels: opt.B.slice(),
          why: 'ערכי הבסיס נמצאים בעמודת ה-RHS של הטבלה האופטימלית: xB = B⁻¹·b.',
          scratchPreset: { A: { label: 'B⁻¹', values: opt.Binv }, B: { label: 'b', values: colVec(sn.problem.b) }, resultLabel: 'xB' } }));
      if (ch.shadow) {
        steps.push(sensGrid('sens-shadow', 'מחירי הצל yᵀ', [1, m], [opt.y.slice()],
          { colLabels: opt.y.map(function (_, i) { return 'אילוץ ' + (i + 1); }),
            why: 'מחירי הצל yᵀ = cB·B⁻¹, ונקראים מהטבלה מתחת למשתני הסרק בשורת ה-Z (בסימן הפוך).',
            scratchPreset: { A: { label: 'cB', values: [opt.cB] }, B: { label: 'B⁻¹', values: opt.Binv }, resultLabel: 'yᵀ' } }));
      }
      res.conclusion = 'קראנו מהטבלה האופטימלית את הפתרון' + (ch.shadow ? ' ואת מחירי הצל' : '') + '.';

    } else if (ch.kind === 'db') {
      var newXB = Engine.computeXB(opt.Binv, ch.bNew);
      var feasible = newXB.every(nn);
      steps.push(sensGrid('sens-xB-new', 'xB החדש (אחרי שינוי b)', [m, 1], colVec(newXB),
        { rowLabels: opt.B.slice(),
          why: 'שינוי ב-b משפיע רק על xB: xB_new = B⁻¹·b_new. שורת ה-Z (האופטימליות) אינה משתנה.',
          scratchPreset: { A: { label: 'B⁻¹', values: opt.Binv }, B: { label: 'b_new', values: colVec(ch.bNew) }, resultLabel: 'xB' } }));
      steps.push(dualityQuiz('sens-feasible', 'האם הפתרון החדש <b>ישים</b>? (כל רכיבי xB אי-שליליים?)',
        [{ id: 'yes', label: 'כן — כל הערכים אי-שליליים' }, { id: 'no', label: 'לא — יש ערך שלילי' }],
        feasible ? 'yes' : 'no',
        feasible ? 'כל רכיבי xB_new אי-שליליים — הפתרון ישים.' : 'יש רכיב שלילי ב-xB_new — הפתרון אינו ישים.'));
      steps.push(dualityQuiz('sens-action', '<b>מה עושים כעת?</b>',
        [{ id: 'nochange', label: 'שום דבר — הפתרון עדיין אופטימלי' },
          { id: 'dual', label: 'מריצים סימפלקס דואלי (על-אופטימלי ולא ישים)' },
          { id: 'primal', label: 'מריצים סימפלקס רגיל' }],
        feasible ? 'nochange' : 'dual',
        feasible ? 'הבסיס נשאר אופטימלי ו-xB אי-שלילי — אין צורך בשום פעולה נוספת.'
          : 'הבסיס אופטימלי (שורת Z לא השתנתה) אך הפתרון אינו ישים — זהו בדיוק המצב שבו משתמשים בסימפלקס דואלי.'));
      res.conclusion = feasible
        ? 'הפתרון נשאר ישים ואופטימלי: xB_new = ' + fmtVec(newXB) + '.'
        : 'הפתרון אינו ישים (xB_new = ' + fmtVec(newXB) + ') — יש להריץ סימפלקס דואלי.';

    } else if (ch.kind === 'db-max') {
      var bi = ch.bIndex;
      var col = opt.Binv.map(function (r) { return r[bi]; });
      var maxDec = Infinity, maxInc = Infinity;
      col.forEach(function (cij, i) {
        if (cij > Engine.ENGINE_EPS) maxDec = Math.min(maxDec, opt.xB[i] / cij);
        if (cij < -Engine.ENGINE_EPS) maxInc = Math.min(maxInc, -opt.xB[i] / cij);
      });
      var decStr = isFinite(maxDec) ? Parse.formatNumber(maxDec) : '∞';
      var incStr = isFinite(maxInc) ? Parse.formatNumber(maxInc) : '∞';
      steps.push(sensScalar('sens-db-max',
        'בכמה לכל היותר אפשר <b>להקטין</b> את b' + (bi + 1) + ' מבלי לשנות את הבסיס האופטימלי?', maxDec,
        { why: 'התנאי לישימות: xB + B⁻¹·Δb ≥ 0. עבור שינוי ב-b' + (bi + 1) +
            ' זהו xB + (עמודה ' + (bi + 1) + ' של B⁻¹)·Δ ≥ 0. הקיטון המקסימלי הוא ' + decStr +
            ', וההגדלה ' + (isFinite(maxInc) ? 'מוגבלת ל-' + incStr : 'אינה מוגבלת') + '.' }));
      res.conclusion = 'הקיטון המקסימלי של b' + (bi + 1) + ' הוא ' + decStr +
        '; ההגדלה ' + (isFinite(maxInc) ? 'עד ' + incStr : 'אינה חסומה') + '.';

    } else if (ch.kind === 'dc-basic') {
      var pos = opt.B.indexOf(ch.varId);
      var cBnew = opt.cB.slice(); cBnew[pos] = ch.newC;
      var yNew = Engine.computeY(cBnew, opt.Binv);
      var rNnew = Engine.computeRN(opt.cN, yNew, opt.NMatrix);
      var Znew = Engine.computeZ(cBnew, opt.xB);
      var stillOpt = rNnew.every(np);
      steps.push(sensGrid('sens-rN-new', 'שורת המקדמים המתוקנים rN (החדשה)', [1, opt.N.length], [rNnew],
        { colLabels: opt.N.slice(),
          why: 'שינוי במקדם של משתנה בסיסי משנה את cB ולכן את שורת ה-0: rN_new = cN − cB_new·B⁻¹·N.',
          scratchPreset: { A: { label: 'yᵀ חדש (=cB_new·B⁻¹)', values: [yNew] }, B: { label: 'N', values: opt.NMatrix }, D: { label: 'cN', values: [opt.cN] }, resultLabel: 'rN' } }));
      steps.push(sensScalar('sens-Z-new', 'ערך המטרה החדש Z', Znew,
        { why: 'Z_new = cB_new·xB.',
          scratchPreset: { A: { label: 'cB_new', values: [cBnew] }, B: { label: 'xB', values: colVec(opt.xB) }, resultLabel: 'Z' } }));
      steps.push(dualityQuiz('sens-optimal', 'האם הפתרון עדיין <b>אופטימלי</b>? (כל rN ≤ 0?)',
        [{ id: 'yes', label: 'כן — כל rN אי-חיוביים' }, { id: 'no', label: 'לא — יש rN חיובי' }],
        stillOpt ? 'yes' : 'no',
        stillOpt ? 'כל רכיבי rN_new אי-חיוביים — הבסיס נשאר אופטימלי.'
          : 'יש רכיב חיובי ב-rN_new — נדרשת עוד איטרציה של סימפלקס רגיל.'));
      res.conclusion = 'rN_new = ' + fmtVec(rNnew) + ', Z_new = ' + Parse.formatNumber(Znew) + ' — ' +
        (stillOpt ? 'נשאר אופטימלי.' : 'לא אופטימלי, נדרשת איטרציה נוספת.');

    } else if (ch.kind === 'dc-nonbasic') {
      var aj = Engine.getColumn(opt.full.AFull, ch.varId);
      var cjOld = opt.full.cFull[ch.varId - 1];
      var rjOld = cjOld - Engine.dot(opt.y, aj);
      if (ch.maxVariant) {
        var maxIncC = -rjOld;
        steps.push(sensScalar('sens-cj-max',
          'בכמה לכל היותר אפשר <b>להגדיל</b> את המקדם c' + ch.varId + ' (של המשתנה הלא-בסיסי) מבלי לשנות את האופטימום?', maxIncC,
          { why: 'המקדם המתוקן הנוכחי הוא r' + ch.varId + ' = c' + ch.varId + ' − yᵀ·a' + ch.varId + ' = ' + Parse.formatNumber(rjOld) +
              '. הגדלת c' + ch.varId + ' מגדילה את r' + ch.varId + ' באותה מידה; האופטימליות נשמרת כל עוד r ≤ 0, ולכן ההגדלה המקסימלית היא −r' + ch.varId + ' = ' + Parse.formatNumber(maxIncC) + '.' }));
        res.conclusion = 'ניתן להגדיל את c' + ch.varId + ' בעד ' + Parse.formatNumber(maxIncC) + ' (עד ש-r' + ch.varId + ' יתאפס).';
      } else {
        var rjNew = ch.newC - Engine.dot(opt.y, aj);
        var stillOptN = rjNew <= Engine.ENGINE_EPS;
        steps.push(sensScalar('sens-rj-new', 'המקדם המתוקן החדש r' + ch.varId, rjNew,
          { why: 'r' + ch.varId + '_new = c' + ch.varId + '_new − yᵀ·a' + ch.varId + ' (y אינו משתנה, כי הבסיס לא משתנה).' }));
        steps.push(dualityQuiz('sens-optimal', 'האם הפתרון עדיין אופטימלי?',
          [{ id: 'yes', label: 'כן — r ≤ 0' }, { id: 'no', label: 'לא — r > 0' }], stillOptN ? 'yes' : 'no',
          stillOptN ? 'r' + ch.varId + '_new ≤ 0 — נשאר אופטימלי.' : 'r' + ch.varId + '_new > 0 — כדאי להכניס את המשתנה, נדרשת עוד איטרציה.'));
        res.conclusion = 'r' + ch.varId + '_new = ' + Parse.formatNumber(rjNew) + ' — ' + (stillOptN ? 'אופטימלי.' : 'לא אופטימלי.');
      }

    } else if (ch.kind === 'new-var') {
      var rW = ch.cW - Engine.dot(opt.y, ch.aW);
      var enters = rW > Engine.ENGINE_EPS;
      var nW = Engine.computeXB(opt.Binv, ch.aW);
      var minR = Infinity, leaveRow = -1;
      nW.forEach(function (v, i) {
        if (v > Engine.ENGINE_EPS) { var r = opt.xB[i] / v; if (r < minR - Engine.ENGINE_EPS) { minR = r; leaveRow = i; } }
      });
      var leaveVar = leaveRow >= 0 ? opt.B[leaveRow] : null;
      var Zold = Engine.computeZ(opt.cB, opt.xB);
      var Znew2 = leaveVar != null ? Zold + rW * minR : Zold;
      steps.push(sensScalar('sens-rW', 'המקדם המתוקן של המשתנה החדש: r = c − yᵀ·a', rW,
        { why: 'למשתנה חדש מחשבים r = c_new − yᵀ·a_new, כאשר a_new היא עמודת האילוצים של המשתנה החדש.' }));
      steps.push(dualityQuiz('sens-enter', 'האם כדאי להכניס את המשתנה החדש לבסיס?',
        [{ id: 'yes', label: 'כן — r > 0 (בבעיית Max)' }, { id: 'no', label: 'לא — r ≤ 0' }], enters ? 'yes' : 'no',
        enters ? 'r > 0 בבעיית מקסימום — כדאי להכניס את המשתנה, הבסיס הנוכחי כבר לא אופטימלי.'
          : 'r ≤ 0 — המשתנה החדש לא ישפר את הפתרון, הבסיס נשאר אופטימלי.'));
      if (enters) {
        steps.push(sensGrid('sens-nW', 'עמודת המשתנה החדש בטבלו: n = B⁻¹·a', [m, 1], colVec(nW),
          { rowLabels: opt.B.slice(),
            why: 'עמודת המשתנה החדש בטבלו הנוכחי היא n = B⁻¹·a_new — עליה מבצעים את מבחן היחס.',
            scratchPreset: { A: { label: 'B⁻¹', values: opt.Binv }, B: { label: 'a_new', values: colVec(ch.aW) }, resultLabel: 'n' } }));
        steps.push(dualityQuiz('sens-leave', 'לפי מבחן היחס — <b>איזה משתנה יוצא</b> מהבסיס?',
          opt.B.map(function (id) { return { id: id, label: 'x' + id }; }), leaveVar,
          'מבחן היחס על n: היחס הקטן ביותר בשורה ' + (leaveRow + 1) + ' → יוצא x' + leaveVar + '. אחרי הפיבוט ערך המטרה יעלה ל-' + Parse.formatNumber(Znew2) + '.'));
      }
      res.conclusion = enters
        ? 'המשתנה נכנס (r = ' + Parse.formatNumber(rW) + '); יוצא x' + leaveVar + '; אחרי איטרציה אחת Z = ' + Parse.formatNumber(Znew2) + '.'
        : 'המשתנה החדש אינו משתלם (r = ' + Parse.formatNumber(rW) + '); הפתרון נשאר אופטימלי.';
      res.Znew = Znew2;
    }

    s.sens.result = res;
    return steps;
  }

  function createSensitivitySession(exercise, opts) {
    opts = opts || {};
    var problem = exercise.problem;
    var s = {
      problem: { n: problem.n, m: problem.m, c: problem.c, A: problem.A, b: problem.b },
      mode: 'sensitivity',
      examMode: !!opts.examMode,
      phase: 'sensitivity',
      status: 'in-progress',
      iterIndex: -1,
      sens: { problem: problem, opt: optStateFromBasis(problem, exercise.basis),
        change: exercise.change, title: exercise.title || '' },
      canonical: null,
      iterations: [],
      stepQueue: [],
      stepIndex: 0,
      substage: null,
      history: [],
      helpLog: [],
      autoLog: [],
      errorLog: [],
      elapsedMs: 0,
      finalResult: null,
    };
    s.stepQueue = buildSensitivitySteps(s);
    s.substage = initialSubstage(s.stepQueue[0]);
    return s;
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
    if (s.mode === 'reverse') {
      s.status = 'reverse-done';
      s.phase = 'done';
      s.finalResult = { reverse: s.reverse };
      return;
    }
    if (s.mode === 'duality') {
      s.status = 'duality-done';
      s.phase = 'done';
      s.finalResult = { duality: s.duality };
      return;
    }
    if (s.mode === 'dualsimplex') {
      s.dsHistory.push({ iter: s.iterIndex, leaving: s.dsCanon.leaveVar,
        entering: s.dsCanon.enterVar, Z: s.dsCanon.next.zRHS });
      s.tableau = s.dsCanon.next;
      if (s.dsCanon.feasibleAfter) {
        s.status = 'dsim-done';
        s.phase = 'done';
        s.finalResult = { tableau: s.tableau, solution: Tableau.solution(s.tableau) };
      } else {
        startDsimIteration(s, false);
      }
      return;
    }
    if (s.mode === 'sensitivity') {
      s.status = 'sensitivity-done';
      s.phase = 'done';
      s.finalResult = { sens: s.sens.result };
      return;
    }
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
    if (st.kind === 'quiz') return st.correct;
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
    if (st.kind === 'quiz') return st.why || st.question;
    if (st.kind === 'quantity' && st.why) {
      // reverse / duality / sensitivity steps carry their own explanation
      // (reading a tableau or a rule, not the forward-mode formula) — prefer it.
      return st.why;
    }
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
    if (st.kind === 'stepRecall' || st.kind === 'decision' || st.kind === 'quiz') {
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
    if (st.kind === 'quiz') return st.why || '';
    if (st.kind === 'quantity' && st.why) return st.why;
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
    } else if (s.phase !== 'iter' || !s.canonical) {
      lines.push('מצב: תרגול (' + (s.mode || '') + ').');
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
    createReverseSession: createReverseSession,
    createDualitySession: createDualitySession,
    createDualSimplexSession: createDualSimplexSession,
    createSensitivitySession: createSensitivitySession,
    optStateFromBasis: optStateFromBasis,
    getCurrent: getCurrent,
    submitStepRecall: submitStepRecall,
    submitQuiz: submitQuiz,
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
