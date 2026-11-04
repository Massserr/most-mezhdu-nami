import type { Action } from '../src/core/types.ts';
export type Plan = Partial<Record<number, [Action, number, number][]>>;
export const centralPlan: Plan = {
  1: [['asphalt', 17, 3]],
  2: [['bridge', 11, 8]],
  3: [
    ['asphalt', 15, 9],
    ['asphalt', 15, 10],
    ['asphalt', 15, 11],
  ],
  4: [
    ['repair', 11, 13],
    ['reinforce', 11, 13],
  ],
  5: [
    ['asphalt', 8, 9],
    ['asphalt', 8, 10],
    ['asphalt', 8, 11],
    ['asphalt', 8, 12],
  ],
  6: [
    ['dirt', 7, 10],
    ['dirt', 6, 10],
  ],
};
export const northPlan: Plan = {
  ...centralPlan,
  2: [['bridge', 11, 3]],
  4: [
    ['bridge', 11, 8],
    ['reinforce', 11, 3],
  ],
};
export const shortcutPlan: Plan = {
  ...centralPlan,
  3: [
    ['asphalt', 18, 9],
    ['asphalt', 18, 10],
    ['asphalt', 18, 11],
    ['asphalt', 18, 12],
  ],
};
