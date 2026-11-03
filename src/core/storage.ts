import {
  BRIDGE_COLUMNS,
  BRIDGE_ROWS,
  createTiles,
  INITIAL_BUDGET,
  isBuilding,
  MAP_WIDTH,
} from './map.ts';
import { createGame, getMetrics, taskReady } from './game.ts';
import { TASKS } from './scenario.ts';
import type { GameState, Metrics, Tile } from './types.ts';

// Keep the key actually used by the original UI, so existing players can continue.
export const SAVE_KEY = 'berezovka-save-v1';
export const LEGACY_SAVE_KEY = 'most-mezhdu-nami-save-v1';
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && Number(v) >= min && Number(v) <= max;
const strings = (v: unknown, max = 100): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && x.length <= 2000);

function validTiles(value: unknown, legacy = false): value is Tile[] {
  const base = createTiles();
  if (!Array.isArray(value) || value.length !== base.length) return false;
  for (let i = 0; i < base.length; i++) {
    const t = value[i],
      b = base[i];
    if (
      !object(t) ||
      t.x !== b.x ||
      t.y !== b.y ||
      t.terrain !== b.terrain ||
      t.bridgeSite !== b.bridgeSite ||
      typeof t.damaged !== 'boolean' ||
      ![null, 'dirt', 'asphalt', 'bridge'].includes(t.road as null)
    )
      return false;
    if (!legacy && typeof t.reinforced !== 'boolean') return false;
    if (t.damaged && !t.road) return false;
    if (
      t.road &&
      (b.terrain === 'obstacle' || (isBuilding(b.x, b.y) && !(legacy && b.x === 6 && b.y === 11)))
    )
      return false;
    if (b.terrain === 'water' && t.road !== null && (t.road !== 'bridge' || !b.bridgeSite))
      return false;
    if (b.terrain !== 'water' && t.road === 'bridge') return false;
    if (t.reinforced && t.road !== 'bridge') return false;
  }
  for (const y of BRIDGE_ROWS) {
    const [a, b] = BRIDGE_COLUMNS.map((x) => value[y * MAP_WIDTH + x]);
    if (a.road !== b.road || a.damaged !== b.damaged || (!legacy && a.reinforced !== b.reinforced))
      return false;
  }
  return true;
}

function validMetrics(value: unknown): value is Metrics {
  if (!object(value)) return false;
  const v = value;
  return (
    integer(v.connected, 0, 24) &&
    [18, 24].includes(Number(v.total)) &&
    Number(v.connected) <= Number(v.total) &&
    ['accessibility', 'wellbeing', 'speed'].every(
      (k) => typeof v[k] === 'number' && Number.isFinite(v[k]),
    ) &&
    Number(v.accessibility) >= 0 &&
    Number(v.accessibility) <= 100 &&
    Number(v.wellbeing) >= 0 &&
    Number(v.wellbeing) <= 100 &&
    Number(v.speed) >= 0 &&
    Number(v.speed) <= 1 &&
    (v.averageTime === null ||
      (typeof v.averageTime === 'number' && Number.isFinite(v.averageTime) && v.averageTime >= 0))
  );
}

function migrateLegacy(s: Record<string, unknown>): GameState | null {
  if (
    !integer(s.budget, 0, 900) ||
    !validTiles(s.tiles, true) ||
    !strings(s.completedTasks, 6) ||
    !strings(s.failedTasks, 6) ||
    !strings(s.events) ||
    !validMetrics(s.dayStart) ||
    !Array.isArray(s.history) ||
    s.history.length > 100
  )
    return null;
  const oldIds = TASKS.filter((t) => t.id !== 'workshop').map((t) => t.id);
  const judged = [...s.completedTasks, ...s.failedTasks];
  const legacyOpens: Record<string, number> = {
    'school-link': 1,
    health: 2,
    rain: 3,
    crossing: 4,
    'fire-access': 5,
    resilience: 6,
  };
  if (
    new Set(judged).size !== judged.length ||
    judged.some((id) => !oldIds.includes(id) || legacyOpens[id] > Number(s.day))
  )
    return null;
  if (s.history.some((h) => !object(h) || !integer(h.budget, 0, 900) || !validTiles(h.tiles, true)))
    return null;
  const convert = (tiles: Tile[]) =>
    tiles.map((t) => ({ ...t, reinforced: t.road === 'bridge' && t.y === 8 }));
  const state = createGame();
  state.day = Number(s.day);
  state.finished = Boolean(s.finished);
  state.budget = Math.floor((Number(s.budget) * INITIAL_BUDGET) / 900);
  state.tiles = convert(s.tiles);
  // The new workshop occupies a former empty cell. Refund that one legacy tile.
  const old = state.tiles[11 * MAP_WIDTH + 6];
  if (old.road) {
    state.budget = Math.min(INITIAL_BUDGET, state.budget + (old.road === 'asphalt' ? 34 : 18));
    old.road = null;
    old.damaged = false;
  }
  state.events = [...s.events];
  state.tutorialStep = 4;
  for (const task of TASKS.filter((t) => t.deadline < state.day || state.finished)) {
    const check = { ...state, day: task.deadline };
    (taskReady(check, task.id) ? state.completedTasks : state.failedTasks).push(task.id);
  }
  // Old undo snapshots have different prices and rules; keep roads, not unsafe undo.
  state.history = [];
  state.dayStart = getMetrics(state);
  state.migrationNotice =
    'Партия версии 1 перенесена: день и дороги сохранены, доля оставшегося бюджета пересчитана из 900 в 700. Новые цели прошлых дней оценены по текущей сети. История отмены начата заново.';
  return state;
}

export const serialize = (state: GameState): string => JSON.stringify(state);
export function deserialize(raw: string): GameState | null {
  try {
    if (typeof raw !== 'string' || raw.length > 5_000_000) return null;
    const s: unknown = JSON.parse(raw);
    if (
      !object(s) ||
      !integer(s.day, 1, 7) ||
      typeof s.finished !== 'boolean' ||
      (s.finished && s.day !== 7)
    )
      return null;
    if (s.version === 1) return migrateLegacy(s);
    if (
      s.version !== 2 ||
      !integer(s.budget, 0, INITIAL_BUDGET) ||
      !validTiles(s.tiles) ||
      !strings(s.completedTasks, 7) ||
      !strings(s.failedTasks, 7) ||
      !strings(s.events) ||
      !integer(s.tutorialStep, 0, 4) ||
      !validMetrics(s.dayStart)
    )
      return null;
    const ids = [...s.completedTasks, ...s.failedTasks];
    if (new Set(ids).size !== ids.length || ids.some((id) => !TASKS.some((t) => t.id === id)))
      return null;
    for (const task of TASKS) {
      const judged = ids.includes(task.id);
      if (judged !== (task.deadline < Number(s.day) || s.finished)) return null;
    }
    if (
      s.migrationNotice !== undefined &&
      (typeof s.migrationNotice !== 'string' || s.migrationNotice.length > 1000)
    )
      return null;
    if (
      !Array.isArray(s.history) ||
      s.history.length > 100 ||
      s.history.some(
        (h) =>
          !object(h) ||
          !integer(h.budget, 0, INITIAL_BUDGET) ||
          !validTiles(h.tiles) ||
          Number(h.budget) < Number(s.budget),
      )
    )
      return null;
    const result = s as unknown as GameState;
    const expected = getMetrics({
      ...result,
      tiles: result.history[0]?.tiles ?? result.tiles,
      completedTasks: result.completedTasks,
      failedTasks: result.failedTasks,
    });
    if (result.dayStart.total !== expected.total) return null;
    getMetrics(result);
    return result;
  } catch {
    return null;
  }
}
