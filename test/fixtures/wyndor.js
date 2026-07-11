/* In-class example (Wyndor): Max 3x1+5x2 s.t. x1<=4, 2x2<=12, 3x1+2x2<=18.
 * Every value below matches the course handout (targil 8), with N kept in the
 * engine's canonical order (entering var replaces leaving var in place).
 */
module.exports = {
  name: 'Wyndor (in-class example)',
  problem: { n: 2, m: 3, c: [3, 5], A: [[1, 0], [0, 2], [3, 2]], b: [4, 12, 18] },
  iterations: [
    {
      B: [3, 4, 5], N: [1, 2],
      Binv: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      cB: [0, 0, 0], cN: [3, 5],
      xB: [4, 12, 18], Z: 0,
      y: [0, 0, 0], rN: [3, 5],
      optimal: false, q: 2,
      nBarQ: [0, 2, 2], unbounded: false,
      p: 4, pivotRow: 1,
      nextB: [3, 2, 5], nextN: [1, 4],
      nextBinv: [[1, 0, 0], [0, 0.5, 0], [0, -1, 1]],
    },
    {
      B: [3, 2, 5], N: [1, 4],
      Binv: [[1, 0, 0], [0, 0.5, 0], [0, -1, 1]],
      cB: [0, 5, 0], cN: [3, 0],
      xB: [4, 6, 6], Z: 30,
      y: [0, 2.5, 0], rN: [3, -2.5],
      optimal: false, q: 1,
      nBarQ: [1, 0, 3], unbounded: false,
      p: 5, pivotRow: 2,
      nextB: [3, 2, 1], nextN: [5, 4],
      nextBinv: [[1, 1 / 3, -1 / 3], [0, 0.5, 0], [0, -1 / 3, 1 / 3]],
    },
    {
      B: [3, 2, 1], N: [5, 4],
      Binv: [[1, 1 / 3, -1 / 3], [0, 0.5, 0], [0, -1 / 3, 1 / 3]],
      cB: [0, 5, 3], cN: [0, 0],
      xB: [2, 6, 2], Z: 36,
      y: [0, 1.5, 1], rN: [-1, -1.5],
      optimal: true,
    },
  ],
  final: {
    status: 'optimal',
    Z: 36,
    assignments: { 1: 2, 2: 6, 3: 2, 4: 0, 5: 0 },
    hasAlternateOptima: false,
  },
};
