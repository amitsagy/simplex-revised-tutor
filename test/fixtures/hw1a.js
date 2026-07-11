/* Homework Q1a: Max 10x1-16x2+x3 s.t. x1-3x2+x3<=2, x1-x2-x3<=4.
 * Terminates UNBOUNDED on the third iteration (entering x3, nBarQ all <= 0).
 * N is kept in the engine's canonical order: [1,2,3] -> [4,2,3] -> [4,5,3].
 * rN values match the handout after reordering.
 */
module.exports = {
  name: 'Homework 1a (unbounded)',
  problem: { n: 3, m: 2, c: [10, -16, 1], A: [[1, -3, 1], [1, -1, -1]], b: [2, 4] },
  iterations: [
    {
      B: [4, 5], N: [1, 2, 3],
      Binv: [[1, 0], [0, 1]],
      cB: [0, 0], cN: [10, -16, 1],
      xB: [2, 4], Z: 0,
      y: [0, 0], rN: [10, -16, 1],
      optimal: false, q: 1,
      nBarQ: [1, 1], unbounded: false,
      p: 4, pivotRow: 0,
      nextB: [1, 5], nextN: [4, 2, 3],
      nextBinv: [[1, 0], [-1, 1]],
    },
    {
      B: [1, 5], N: [4, 2, 3],
      Binv: [[1, 0], [-1, 1]],
      cB: [10, 0], cN: [0, -16, 1],
      xB: [2, 2], Z: 20,
      y: [10, 0], rN: [-10, 14, -9],
      optimal: false, q: 2,
      nBarQ: [-3, 2], unbounded: false,
      p: 5, pivotRow: 1,
      nextB: [1, 2], nextN: [4, 5, 3],
      nextBinv: [[-0.5, 1.5], [-0.5, 0.5]],
    },
    {
      B: [1, 2], N: [4, 5, 3],
      Binv: [[-0.5, 1.5], [-0.5, 0.5]],
      cB: [10, -16], cN: [0, 0, 1],
      xB: [5, 1], Z: 34,
      y: [3, 7], rN: [-3, -7, 5],
      optimal: false, q: 3,
      nBarQ: [-2, -1], unbounded: true,
    },
  ],
  final: {
    status: 'unbounded',
    enteringVar: 3,
  },
};
