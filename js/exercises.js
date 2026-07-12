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
