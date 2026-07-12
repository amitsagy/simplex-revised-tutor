/* Simplex Tutor — exercises.js
 * The saved exercise library: every numeric problem from targilim 8–10, tagged
 * with the drill mode that runs it. Data only (no DOM). The setup UI renders a
 * picker over this list; main.js routes each entry to the right session factory.
 *
 * Entry: { id, source, title, mode, data }
 *   mode ∈ 'forward' | 'duality' | 'dualsimplex' | 'sensitivity' | 'guided' | 'reading'
 *   data shape depends on mode:
 *     forward     -> { n, m, c, A, b }  (+ optional startBasis / maxIters — targil 8 mid-run)
 *     duality     -> general primal { dir, c, A, b, ctypes, vtypes }
 *     reading     -> { question, solution } (HTML) — a proof/derivation reading card
 *     dualsimplex/sensitivity/guided -> added in later phases
 */
(function () {
  'use strict';

  /* Base problems reused by several sensitivity exercises. */
  var GLASS = { n: 2, m: 3, c: [3, 5], A: [[1, 0], [0, 2], [3, 2]], b: [4, 12, 18] };
  var Q3BASE = { n: 3, m: 3, c: [-1, 3, -2], A: [[3, -1, 2], [-2, 4, 0], [-4, 3, 8]], b: [7, 12, 10] };

  var EXERCISES = [
    /* ================= תרגול 8 — Revised Simplex ================= */
    {
      id: 't8-ex1', source: 'תרגול 8 · תרגיל 1', title: 'דוגמת הכיתה (מפעל הזכוכית)',
      mode: 'forward', data: GLASS,
    },

    /* ================= תרגיל בית 8 ================= */
    {
      id: 'hw8-q1a', source: 'ת״ב 8 · שאלה 1א', title: 'פתרון מלא — בעיה לא-חסומה',
      mode: 'forward',
      data: { n: 3, m: 2, c: [10, -16, 1], A: [[1, -3, 1], [1, -1, -1]], b: [2, 4] },
    },
    {
      id: 'hw8-q1b', source: 'ת״ב 8 · שאלה 1ב', title: 'פתרון מלא — פתרון אופטימלי מרובה',
      mode: 'forward',
      data: { n: 4, m: 3, c: [1, 2, 3, 1], A: [[-1, 2, 1, -1], [1, 0, -1, 1], [1, -1, 0, 2]], b: [1, 1, 1] },
    },
    {
      id: 'hw8-q2a', source: 'ת״ב 8 · שאלה 2א', title: 'איטרציה בודדת מבסיס נתון',
      mode: 'forward',
      data: { problem: { n: 2, m: 3, c: [4, 5], A: [[2, 1], [1, 2], [0, 1]], b: [8, 7, 3] },
        startBasis: [3, 1, 2], maxIters: 1 },
    },
    {
      id: 'hw8-q2b', source: 'ת״ב 8 · שאלה 2ב', title: 'איטרציה בודדת — הפתרון כבר אופטימלי',
      mode: 'forward',
      data: { problem: { n: 4, m: 3, c: [0, 4, 2, 0], A: [[1, 2, 1, 0], [1, -1, 2, 1], [0, 1, 0, 1]], b: [3, 3, 1] },
        startBasis: [2, 3, 4], maxIters: 1 },
    },
    {
      id: 'hw8-q2c', source: 'ת״ב 8 · שאלה 2ג', title: 'איטרציה בודדת — הבעיה לא-חסומה',
      mode: 'forward',
      data: { problem: { n: 3, m: 3, c: [3, -1, 5], A: [[1, -1, 2], [1, -2, 3], [1, -1, 1]], b: [2, 4, 3] },
        startBasis: [1, 5, 6], maxIters: 1 },
    },
    {
      id: 'hw8-q3', source: 'ת״ב 8 · שאלה 3', title: 'שחזור הבעיה מהטבלה (נתונים עשרוניים)',
      mode: 'reverse-data',
      // B⁻¹ under the slacks, y in the Z-row (negated), initial b: rebuild the problem.
      data: { Binv: [[0.357, -0.214], [-0.132, 0.285]], y: [0, 2], b: [12, 10] },
    },

    /* ================= תרגול 9 — דואליות ================= */
    {
      id: 't9-bags', source: 'תרגול 9 · דוגמה', title: 'תיקים וחגורות (מפעל העור)',
      mode: 'duality',
      data: { dir: 'max', c: [100, 50], A: [[3, 1]], b: [67],
        ctypes: ['le'], vtypes: ['ge0', 'ge0'] },
    },
    {
      id: 't9-ex1', source: 'תרגול 9 · תרגיל 1', title: 'הצגת הבעיה הדואלית',
      mode: 'duality',
      data: { dir: 'max', c: [12, 3, 1],
        A: [[4, 0, 1], [3, 1, 4], [0, 1, 4], [2, 0, 0]], b: [24, 8, 48, 32],
        ctypes: ['le', 'le', 'le', 'le'], vtypes: ['ge0', 'ge0', 'ge0'] },
    },
    {
      id: 't9-ex2', source: 'תרגול 9 · תרגיל 2', title: 'בעיה לא-סטנדרטית (=, ≥, משתנה חופשי)',
      mode: 'duality',
      data: { dir: 'max', c: [1, 3], A: [[1, -1], [5, 2], [1, 1]], b: [1, 2, 1],
        ctypes: ['le', 'eq', 'ge'], vtypes: ['free', 'ge0'] },
    },

    /* ================= תרגיל בית 9 — דואליות ================= */
    {
      id: 'hw9-q1', source: 'ת״ב 9 · שאלה 1', title: 'דואלית של בעיית מינימום (חופשי / =)',
      mode: 'duality',
      // Min y1 − y2 ; y1 ≥ 3 ; y1+2y2 ≤ 5 ; 3y1 = 12 ; y1 free, y2 ≥ 0
      data: { dir: 'min', c: [1, -1], A: [[1, 0], [1, 2], [3, 0]], b: [3, 5, 12],
        ctypes: ['ge', 'le', 'eq'], vtypes: ['free', 'ge0'] },
    },

    /* ================= תרגול 10 — סימפלקס דואלי ================= */
    {
      id: 't10-ex1', source: 'תרגול 10 · תרגיל 1', title: 'סימפלקס דואלי (הדואלית של מפעל הזכוכית)',
      mode: 'dualsimplex',
      // Min 4y1+12y2+18y3 ; y1+3y3 ≥ 3 ; 2y2+2y3 ≥ 5 ; y ≥ 0  → optimal Z=36, y=(0,3/2,1)
      data: { n: 3, m: 2, c: [4, 12, 18], A: [[1, 0, 3], [0, 2, 2]], b: [3, 5] },
    },

    /* --- targil 10 sensitivity exercises (base = the glass problem) --- */
    {
      id: 't10-ex2', source: 'תרגול 10 · תרגיל 2', title: 'ניתוח רגישות — שינוי מותר ב-b₁',
      mode: 'sensitivity',
      data: { problem: GLASS, basis: [3, 2, 1], change: { kind: 'db-max', bIndex: 0 } },
    },
    {
      id: 't10-ex3', source: 'תרגול 10 · תרגיל 3', title: 'ניתוח רגישות — שינוי מקדם של משתנה בסיסי',
      mode: 'sensitivity',
      data: { problem: GLASS, basis: [3, 2, 1], change: { kind: 'dc-basic', varId: 1, newC: 4 } },
    },
    {
      id: 't10-ex4', source: 'תרגול 10 · תרגיל 4', title: 'ניתוח רגישות — הוספת משתנה חדש',
      mode: 'sensitivity',
      data: { problem: GLASS, basis: [3, 2, 1], change: { kind: 'new-var', cW: 1, aW: [2, 0, 0] } },
    },

    /* ================= תרגיל בית 10 ================= */
    {
      id: 'hw10-q1', source: 'ת״ב 10 · שאלה 1', title: 'סימפלקס דואלי — הדואלית של הבעיה',
      mode: 'dualsimplex',
      // dual of Max 2x1+x2+3x3+x4 s.t. 2x1+4x2+2x3+x4≤18, x1+3x2+3x3+6x4≤12:
      // Min 18y1+12y2 ; 2y1+y2≥2 ; 4y1+3y2≥1 ; 2y1+3y2≥3 ; y1+6y2≥1 → Z=19.5, y=(3/4,1/2)
      data: { n: 2, m: 4, c: [18, 12], A: [[2, 1], [4, 3], [2, 3], [1, 6]], b: [2, 1, 3, 1] },
    },
    /* --- homework 10 q3: seven sensitivity checks sharing one base --- */
    {
      id: 'hw10-q3a', source: 'ת״ב 10 · שאלה 3א', title: 'קריאת הפתרון האופטימלי',
      mode: 'sensitivity',
      data: { problem: Q3BASE, basis: [1, 2, 6], change: { kind: 'read-opt' } },
    },
    {
      id: 'hw10-q3b', source: 'ת״ב 10 · שאלה 3ב', title: 'מחירי הצל של המשאבים',
      mode: 'sensitivity',
      data: { problem: Q3BASE, basis: [1, 2, 6], change: { kind: 'read-opt', shadow: true } },
    },
    {
      id: 'hw10-q3c', source: 'ת״ב 10 · שאלה 3ג', title: 'עד כמה אפשר להגדיל את c₃ (משתנה לא-בסיסי)',
      mode: 'sensitivity',
      data: { problem: Q3BASE, basis: [1, 2, 6], change: { kind: 'dc-nonbasic', varId: 3, maxVariant: true } },
    },
    {
      id: 'hw10-q3d', source: 'ת״ב 10 · שאלה 3ד', title: 'שינוי אגף ימין ל-(7,10,10)',
      mode: 'sensitivity',
      data: { problem: Q3BASE, basis: [1, 2, 6], change: { kind: 'db', bNew: [7, 10, 10] } },
    },

    /* ================= תרגיל מודרך (דואליות + סרק משלים) ================= */
    {
      id: 'hw9-q6', source: 'ת״ב 9 · שאלה 6', title: 'מפעל התכשיטים — מהדואלית לפתרון הפרימלי',
      mode: 'guided',
      data: {
        problem: { n: 3, m: 2, c: [9, 12, 18], A: [[3, 1, 2], [1, 6, 6]], b: [24, 20] },
        intro:
          '<p>מפעל מייצר עגילים <span class="ltr-math">(x<sub>1</sub>)</span>, צמידים ' +
          '<span class="ltr-math">(x<sub>2</sub>)</span> וטבעות <span class="ltr-math">(x<sub>3</sub>)</span>. הבעיה הפרימלית:</p>' +
          '<div class="formulation ltr-math">Max 9x<sub>1</sub> + 12x<sub>2</sub> + 18x<sub>3</sub><br>s.t.<br>' +
          '3x<sub>1</sub> + x<sub>2</sub> + 2x<sub>3</sub> ≤ 24 (זהב)<br>' +
          'x<sub>1</sub> + 6x<sub>2</sub> + 6x<sub>3</sub> ≤ 20 (יהלומים)<br>x<sub>1</sub>, x<sub>2</sub>, x<sub>3</sub> ≥ 0</div>' +
          '<p>הדואלית נפתרה גרפית ונמצא הפתרון האופטימלי ' +
          '<span class="ltr-math">y* = (2.25, 2.25)</span> עם ערך מטרה <span class="ltr-math">99</span>. ' +
          'נסיק ממנו את הפתרון הפרימלי בעזרת תכונת משתני הסרק המשלימים.</p>',
        steps: [
          { kind: 'quiz', key: 'g-both-binding',
            question: 'שני המשתנים הדואליים חיוביים <span class="ltr-math">(y<sub>1</sub>, y<sub>2</sub> > 0)</span>. מה זה אומר על שני האילוצים (המשאבים) בבעיה הפרימלית?',
            options: [
              { id: 'both', label: 'שני האילוצים כובלים (מתקיימים בשוויון)' },
              { id: 'none', label: 'שני האילוצים אינם כובלים' },
              { id: 'one', label: 'רק אחד מהם כובל' },
            ], correct: 'both',
            why: 'מחיר צל חיובי ⇐ אילוץ כובל. מכיוון ש-y₁,y₂ > 0, שני אילוצי המשאבים מתקיימים בשוויון.' },
          { kind: 'quiz', key: 'g-c2-slack',
            question: 'נציב את y* באילוץ הדואלי השני (המתאים ל-x<sub>2</sub>): <span class="ltr-math">y<sub>1</sub> + 6y<sub>2</sub> = 2.25 + 13.5 = 15.75</span>, מול אגף ימין 12. האם אילוץ זה כובל?',
            options: [
              { id: 'no', label: 'לא — 15.75 > 12, האילוץ אינו כובל' },
              { id: 'yes', label: 'כן — הוא מתקיים בשוויון' },
            ], correct: 'no',
            why: 'האילוץ הדואלי השני אינו כובל (15.75 > 12) ⇐ משתנה הסרק הדואלי שלו חיובי ⇐ המשתנה המקורי המשלים x₂ אינו בסיסי.' },
          { kind: 'quiz', key: 'g-x2-zero',
            question: 'מהי המסקנה לגבי <span class="ltr-math">x<sub>2</sub></span>?',
            options: [
              { id: 'zero', label: 'x₂ = 0 (לא בסיסי)' },
              { id: 'pos', label: 'x₂ > 0 (בסיסי)' },
            ], correct: 'zero',
            why: 'לפי משתני סרק משלימים: אילוץ דואלי לא כובל ⇐ המשתנה המקורי המשלים אינו בסיסי, כלומר x₂ = 0.' },
          { kind: 'quiz', key: 'g-which-eqs',
            question: 'האילוצים הדואליים 1 ו-3 (עבור x<sub>1</sub>, x<sub>3</sub>) כובלים, ולכן x<sub>1</sub>, x<sub>3</sub> בסיסיים. יחד עם x<sub>2</sub>=0 — איזו מערכת פותרים כדי למצוא את הפתרון?',
            options: [
              { id: 'sys', label: '3x₁ + 2x₃ = 24 ו-x₁ + 6x₃ = 20' },
              { id: 'sys2', label: '3x₁ + x₂ = 24 ו-x₁ + 6x₂ = 20' },
            ], correct: 'sys',
            why: 'שני אילוצי המשאבים כובלים (שוויון), ועם x₂ = 0 נשארת המערכת 3x₁ + 2x₃ = 24, x₁ + 6x₃ = 20.' },
          { kind: 'scalar', key: 'g-x1', label: 'ערך x₁', correct: 6.5,
            why: 'פתרון המערכת 3x₁ + 2x₃ = 24, x₁ + 6x₃ = 20 נותן x₁ = 6.5.' },
          { kind: 'scalar', key: 'g-x3', label: 'ערך x₃', correct: 2.25,
            why: 'ומאותה מערכת x₃ = 2.25.' },
          { kind: 'scalar', key: 'g-Z', label: 'ערך פונקציית המטרה Z', correct: 99,
            why: 'Z = 9·6.5 + 12·0 + 18·2.25 = 58.5 + 40.5 = 99 — כמו ערך הדואלית, מתכונת הדואליות החזקה.' },
        ],
        conclusion:
          '<p>כדי למקסם רווח: לייצר <b>6.5 עגילים</b>, <b>2.25 טבעות</b> ו-<b>0 צמידים</b>. ' +
          'הרווח הוא <b>99</b> (אלף $) — זהה לערך האופטימלי של הבעיה הדואלית, כצפוי מתכונת הדואליות החזקה.</p>' +
          '<p>העיקרון: בהינתן פתרון אופטימלי לאחת הבעיות, קל למצוא את הפתרון האופטימלי של השנייה דרך משתני הסרק המשלימים — ' +
          'שימושי במיוחד כשקל יותר לפתור דווקא את אחת הבעיות (כאן, את הדואלית — גרפית).</p>',
      },
    },

    /* ================= כרטיסי קריאה (הוכחות) ================= */
    {
      id: 't9-ex3', source: 'תרגול 9 · תרגיל 3', title: 'הוכחה: משתנה חופשי ⇐ אילוץ שוויון בדואלית',
      mode: 'reading',
      data: {
        question:
          '<p>הראה/י שהבעיה הדואלית של</p>' +
          '<div class="formulation ltr-math">Max cᵀx s.t. Ax ≤ b, x free</div>' +
          '<p>היא</p><div class="formulation ltr-math">Min bᵀy s.t. Aᵀy = c, y ≥ 0</div>' +
          '<p>כלומר: משתנה חופשי בפרימלית ⇐ אילוץ שוויון בדואלית.</p>',
        solution:
          '<p>מפצלים משתנה חופשי להפרש שני משתנים אי-שליליים: <span class="ltr-math">x = x⁺ − x⁻</span>, ' +
          'כאשר <span class="ltr-math">x⁺, x⁻ ≥ 0</span>. הבעיה נכתבת בצורה סטנדרטית:</p>' +
          '<div class="formulation ltr-math">Max (cᵀ, −cᵀ)·(x⁺; x⁻) s.t. (A, −A)·(x⁺; x⁻) ≤ b, x⁺,x⁻ ≥ 0</div>' +
          '<p>הדואלית של הצורה הזו:</p>' +
          '<div class="formulation ltr-math">Min bᵀy s.t. (Aᵀ; −Aᵀ)·y ≥ (c; −c), y ≥ 0</div>' +
          '<p>שתי המערכות <span class="ltr-math">Aᵀy ≥ c</span> ו-<span class="ltr-math">−Aᵀy ≥ −c</span> ' +
          '(כלומר <span class="ltr-math">Aᵀy ≤ c</span>) יחד שקולות לשוויון <span class="ltr-math">Aᵀy = c</span>. מש"ל.</p>',
      },
    },
    {
      id: 'hw9-q2', source: 'ת״ב 9 · שאלה 2', title: 'הוכחה: הדואלית של בעיה עם אילוצי שוויון',
      mode: 'reading',
      data: {
        question:
          '<p>הוכח/י שהדואלית של</p><div class="formulation ltr-math">Max cᵀx s.t. Ax = b, x ≥ 0</div>' +
          '<p>היא</p><div class="formulation ltr-math">Min bᵀy s.t. Aᵀy ≥ c, y free</div>',
        solution:
          '<p>אילוץ שוויון <span class="ltr-math">Ax = b</span> שקול לשני אי-שוויונות: ' +
          '<span class="ltr-math">Ax ≤ b</span> ו-<span class="ltr-math">Ax ≥ b</span> (כלומר <span class="ltr-math">−Ax ≤ −b</span>).</p>' +
          '<div class="formulation ltr-math">Max cᵀx s.t. (A; −A)x ≤ (b; −b), x ≥ 0</div>' +
          '<p>הדואלית עם משתנים <span class="ltr-math">y⁺, y⁻ ≥ 0</span> (לשני חלקי האילוץ):</p>' +
          '<div class="formulation ltr-math">Min (bᵀ, −bᵀ)(y⁺; y⁻) s.t. (Aᵀ, −Aᵀ)(y⁺; y⁻) ≥ c, y⁺,y⁻ ≥ 0</div>' +
          '<p>מגדירים <span class="ltr-math">y = y⁺ − y⁻</span> (חופשי כהפרש שני אי-שליליים) ומקבלים ' +
          '<span class="ltr-math">Min bᵀy s.t. Aᵀy ≥ c, y free</span>. מש"ל.</p>',
      },
    },
    {
      id: 'hw9-q3', source: 'ת״ב 9 · שאלה 3', title: 'הוכחה: תכונת הדואליות החלשה',
      mode: 'reading',
      data: {
        question: '<p>הוכח/י את אי-השוויון <span class="ltr-math">cᵀx ≤ bᵀy</span> לכל x ישים לבעיית המקסימום ו-y ישים לבעיית המינימום.</p>',
        solution:
          '<p>מ-<span class="ltr-math">Ax ≤ b</span> ו-<span class="ltr-math">y ≥ 0</span> נובע ' +
          '<span class="ltr-math">yᵀAx ≤ yᵀb</span> (כפל באי-שלילי שומר על הכיוון).</p>' +
          '<p>מ-<span class="ltr-math">Aᵀy ≥ c</span> ו-<span class="ltr-math">x ≥ 0</span> נובע ' +
          '<span class="ltr-math">yᵀAx = (Aᵀy)ᵀx ≥ cᵀx</span>.</p>' +
          '<p>משרשור: <span class="ltr-math">cᵀx ≤ yᵀAx ≤ yᵀb = bᵀy</span>. מש"ל.</p>' +
          '<p>מסקנה: אם אחת הבעיות אינה חסומה, השנייה אינה ישימה.</p>',
      },
    },
    {
      id: 'hw9-q4', source: 'ת״ב 9 · שאלה 4', title: 'הוכחה: אופטימליות מערכים שווים',
      mode: 'reading',
      data: {
        question:
          '<p>יהיו P (מקסימום) ו-D (מינימום) בעיות דואליות. נתונים <span class="ltr-math">x̄</span> ישים ל-P ו-<span class="ltr-math">ȳ</span> ישים ל-D, ' +
          'עם אותו ערך פונקציית מטרה. הוכח/י ששניהם אופטימליים.</p>',
        solution:
          '<p>נניח בשלילה ש-<span class="ltr-math">x̄</span> אינו אופטימלי: קיים <span class="ltr-math">x̂</span> ישים עם ' +
          '<span class="ltr-math">cᵀx̂ > cᵀx̄ = bᵀȳ</span>. אבל אז <span class="ltr-math">cᵀx̂ > bᵀȳ</span> — סתירה לדואליות החלשה.</p>' +
          '<p>סימטרית, אם <span class="ltr-math">ȳ</span> אינו אופטימלי קיים <span class="ltr-math">ŷ</span> עם ' +
          '<span class="ltr-math">bᵀŷ < bᵀȳ = cᵀx̄</span> — שוב סתירה לדואליות החלשה. לכן שניהם אופטימליים. מש"ל.</p>',
      },
    },
    {
      id: 'hw9-q5', source: 'ת״ב 9 · שאלה 5', title: 'הוכחה: מטריצה סימטרית ו-Aw=c',
      mode: 'reading',
      data: {
        question:
          '<p>נתונה <span class="ltr-math">Max cᵀx s.t. Ax ≤ c, x ≥ 0</span> עם <span class="ltr-math">A</span> סימטרית ' +
          '(<span class="ltr-math">A = Aᵀ</span>). נתון פתרון אפשרי <span class="ltr-math">w̄</span> המקיים <span class="ltr-math">Aw̄ = c</span>. ' +
          'הוכח/י ש-<span class="ltr-math">w̄</span> אופטימלי.</p>',
        solution:
          '<p>הדואלית: <span class="ltr-math">Min cᵀy s.t. Aᵀy ≥ c, y ≥ 0</span>. נבדוק ש-<span class="ltr-math">w̄</span> ישים גם לדואלית: ' +
          '<span class="ltr-math">Aᵀw̄ = Aw̄ = c ≥ c</span> ✓ (השוויון השמאלי מהסימטריות, הימני מהנתון). ' +
          'גם <span class="ltr-math">w̄ ≥ 0</span> (פתרון אפשרי לפרימלית).</p>' +
          '<p>אז <span class="ltr-math">w̄</span> ישים לשתי הבעיות, ובשתיהן ערך המטרה זהה <span class="ltr-math">(cᵀw̄)</span> — ' +
          'ולכן, לפי שאלה 4, הוא אופטימלי לשתיהן. מש"ל.</p>',
      },
    },
    {
      id: 'hw10-q2', source: 'ת״ב 10 · שאלה 2', title: 'שאלה מסכמת בדואליות (הסקה מטבלה פרמטרית)',
      mode: 'reading',
      data: {
        question:
          '<p>נתונה <span class="ltr-math">Max a·x₁ + b·x₂ + c·x₃ s.t. d₁x₁ + d₂x₂ + d₃x₃ ≤ e, x ≥ 0</span> ' +
          '(כל הפרמטרים חיוביים). ידוע שהפתרון האופטימלי יחיד ושבעמודת משתנה הסרק בטבלה האופטימלית מופיע האיבר ' +
          '<span class="ltr-math">[1/d₂]</span>. מהם: האילוצים הכובלים בדואלית, פתרון הפרימלית והדואלית, מחירי הצל, והתנאי לאופטימליות?</p>',
        solution:
          '<p><b>הבסיס:</b> מהאיבר <span class="ltr-math">B⁻¹ = 1/d₂</span> נובע <span class="ltr-math">B = d₂</span>, כלומר x₂ הוא המשתנה הבסיסי היחיד ' +
          '(x₁, x₃ ומשתנה הסרק מאופסים).</p>' +
          '<p><b>פתרון פרימלי:</b> מהאילוץ בשוויון <span class="ltr-math">d₂x₂ = e</span> ⇐ <span class="ltr-math">x₂ = e/d₂</span>, וערך המטרה ' +
          '<span class="ltr-math">Z = b·e/d₂</span>.</p>' +
          '<p><b>מחיר צל של האילוץ:</b> <span class="ltr-math">y = cᴮᵀB⁻¹ = b/d₂</span> (וזהו גם ערך המשתנה הדואלי).</p>' +
          '<p><b>אילוצים כובלים בדואלית:</b> מכיוון ש-x₂ > 0, האילוץ הדואלי השני כובל. שני האחרים אינם כובלים (x₁, x₃ מאופסים).</p>' +
          '<p><b>משתני הסרק הדואליים:</b> בסימן הפוך למקדמי שורת ה-0: ' +
          '<span class="ltr-math">a − b·d₁/d₂</span> ו-<span class="ltr-math">c − b·d₃/d₂</span> (עבור האילוצים 1 ו-3).</p>' +
          '<p><b>תנאי אופטימליות:</b> כל מקדמי שורת ה-0 אי-חיוביים: <span class="ltr-math">a − b·d₁/d₂ ≤ 0</span> וגם <span class="ltr-math">c − b·d₃/d₂ ≤ 0</span>.</p>',
      },
    },
  ];

  var byId = {};
  EXERCISES.forEach(function (e) { byId[e.id] = e; });

  /* Display grouping order for the picker. */
  var GROUP_ORDER = [
    'תרגול 8', 'ת״ב 8', 'תרגול 9', 'ת״ב 9', 'תרגול 10', 'ת״ב 10',
  ];
  function groupOf(entry) {
    // "תרגול 9 · תרגיל 1" -> "תרגול 9"
    return String(entry.source).split('·')[0].trim();
  }

  var api = {
    list: EXERCISES,
    byId: byId,
    groupOf: groupOf,
    GROUP_ORDER: GROUP_ORDER,
  };

  if (typeof window !== 'undefined') {
    window.Simplex = window.Simplex || {};
    window.Simplex.exercises = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
