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
