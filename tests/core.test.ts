import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeBridges,
  allRoutes,
  applyAction,
  BUILDINGS,
  COSTS,
  createGame,
  deserialize,
  endDay,
  explainRoute,
  getEnding,
  getMetrics,
  getResidentViews,
  getRoute,
  getScore,
  getTasks,
  getTile,
  INITIAL_BUDGET,
  previewAction,
  serialize,
  taskReady,
  undo,
} from '../src/core/index.ts';
import type { Action, GameState } from '../src/core/index.ts';
import { centralPlan, northPlan, shortcutPlan, type Plan } from './scenarios.ts';

function act(state: GameState, action: Action, x: number, y: number) {
  const result = applyAction(state, action, x, y);
  assert.equal(result.ok, true, `${action} ${x}:${y}: ${result.message}`);
}
function run(plan: Plan, inspect?: (state: GameState) => void) {
  const state = createGame();
  while (!state.finished) {
    for (const [action, x, y] of plan[state.day] ?? []) act(state, action, x, y);
    inspect?.(state);
    endDay(state);
  }
  return state;
}
const advance = (s: GameState, day: number) => {
  while (s.day < day) endDay(s);
};

test('initial graph: 15/18 routes, water crossed only at bridges, workshop opens on day 6', () => {
  const s = createGame();
  assert.equal(getMetrics(s).connected, 15);
  assert.equal(getMetrics(s).total, 18);
  assert.equal(getRoute(s, 'home-east-north', 'school').time, null);
  for (const p of getRoute(s, 'home-east', 'school').path)
    if ([11, 12].includes(p.x)) assert.equal(p.y, 13);
  assert.equal(getRoute(s, 'home-east', 'workshop').time, null);
  advance(s, 6);
  assert.equal(getMetrics(s).total, 24);
});
test('preview is pure; bridge atomic; undo restores budget and topology', () => {
  const s = createGame(),
    before = serialize(s),
    preview = previewAction(s, 'bridge', 11, 8);
  assert.equal(preview.valid, true);
  assert.equal(preview.cost, 220);
  assert.equal(serialize(s), before);
  act(s, 'bridge', 12, 8);
  for (const x of [11, 12]) {
    assert.equal(getTile(s, x, 8)!.road, 'bridge');
    assert.equal(getTile(s, x, 8)!.reinforced, true);
  }
  assert.ok(undo(s));
  assert.equal(serialize(s), before);
});
test('invalid construction, coordinates and unknown tools never mutate state', () => {
  const s = createGame();
  for (const [a, x, y] of [
    ['dirt', 11, 6],
    ['bridge', 10, 8],
    ['asphalt', 5, 7],
    ['repair', 3, 3],
    ['dirt', 1, 4],
    ['asphalt', -1, 8],
    ['dirt', 3.5, 3],
    ['reinforce', 3, 3],
    ['toString', 17, 3],
  ] as const) {
    const old = serialize(s);
    assert.equal(applyAction(s, a as Action, x, y).ok, false);
    assert.equal(serialize(s), old);
  }
  s.budget = 10;
  assert.equal(applyAction(s, 'asphalt', 17, 3).ok, false);
  assert.equal(s.budget, 10);
});
test('repair retains coverage class; upgrading existing dirt has its own price', () => {
  const s = createGame(),
    tile = getTile(s, 8, 5)!;
  tile.damaged = true;
  act(s, 'repair', 8, 5);
  assert.equal(tile.road, 'dirt');
  assert.equal(s.budget, INITIAL_BUDGET - COSTS.repair);
  act(s, 'asphalt', 8, 5);
  assert.equal(tile.road, 'asphalt');
  assert.equal(s.budget, INITIAL_BUDGET - COSTS.repair - COSTS.upgrade);
});
for (const [name, plan, budget] of [
  ['central', centralPlan, 132],
  ['north', northPlan, 50],
  ['new clinic shortcut', shortcutPlan, 68],
] as const) {
  test(`${name} strategy: all seven promises, real routes and bounded budget`, () => {
    let actions = 0;
    const s = run(plan, (day) => {
      assert.equal(
        getTasks(day).find((t) => t.startDay === day.day)!.status,
        'ready',
        `day ${day.day}`,
      );
      assert.ok(day.budget >= 0);
      actions += (plan[day.day] ?? []).length;
      assert.ok(deserialize(serialize(day)), `save on day ${day.day}`);
    });
    assert.equal(s.completedTasks.length, 7);
    assert.equal(s.failedTasks.length, 0);
    assert.equal(getMetrics(s).connected, 24);
    assert.equal(s.budget, budget);
    assert.ok(getScore(s).success);
    assert.ok(getScore(s).total >= 85);
    assert.ok(actions >= 10);
    assert.ok(taskReady(s, 'resilience'));
    assert.ok(deserialize(serialize(s)));
    const final = serialize(s);
    endDay(s);
    assert.equal(serialize(s), final);
    assert.equal(undo(s), false);
    assert.equal(applyAction(s, 'dirt', 0, 0).ok, false);
  });
}
test('two-action exploit and inaction fail the new campaign', () => {
  const two = run({
      1: [
        ['dirt', 17, 3],
        ['bridge', 11, 8],
      ],
    }),
    idle = run({});
  assert.equal(getScore(two).success, false);
  assert.ok(getScore(two).total < 65);
  assert.equal(two.completedTasks.length, 2);
  assert.equal(getScore(idle).success, false);
  assert.equal(idle.completedTasks.length, 0);
});
test('wasteful spending is irreversible after a day but budget never becomes negative', () => {
  const s = createGame();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 24; x++)
      if (getTile(s, x, y)?.road === null) applyAction(s, 'asphalt', x, y);
  assert.ok(s.budget >= 0);
  assert.ok(s.budget < 34);
  endDay(s);
  assert.equal(undo(s), false);
  while (!s.finished) endDay(s);
  assert.equal(getScore(s).success, false);
});
test('dirt is cheaper but slower in rain; paving changes graph time', () => {
  const dirt = createGame(),
    asphalt = createGame();
  act(dirt, 'dirt', 17, 3);
  act(asphalt, 'asphalt', 17, 3);
  assert.equal(dirt.budget - asphalt.budget, 16);
  const dry = getRoute(dirt, 'home-east-north', 'clinic').time!;
  advance(dirt, 3);
  advance(asphalt, 3);
  assert.ok(getRoute(dirt, 'home-east-north', 'clinic').time! > dry);
  assert.ok(
    getRoute(dirt, 'home-east-north', 'clinic').time! >
      getRoute(asphalt, 'home-east-north', 'clinic').time!,
  );
});
test('flood affects unreinforced timber, protected and stone bridges survive', () => {
  const s = createGame();
  act(s, 'bridge', 11, 3);
  act(s, 'reinforce', 11, 3);
  act(s, 'bridge', 11, 8);
  advance(s, 5);
  assert.equal(getTile(s, 11, 3)!.damaged, false);
  assert.equal(getTile(s, 12, 8)!.damaged, false);
  assert.equal(getTile(s, 11, 13)!.damaged, true);
  assert.equal(activeBridges(s), 2);
  const unprotected = createGame();
  act(unprotected, 'bridge', 11, 3);
  advance(unprotected, 5);
  assert.equal(getTile(unprotected, 11, 3)!.damaged, true);
  assert.equal(getTile(unprotected, 12, 3)!.damaged, true);
});
test('reinforcement is paid and atomic; repair does not grant free protection', () => {
  const s = createGame();
  advance(s, 4);
  assert.equal(previewAction(s, 'reinforce', 11, 13).valid, false);
  act(s, 'repair', 12, 13);
  assert.equal(getTile(s, 11, 13)!.reinforced, false);
  const budget = s.budget;
  act(s, 'reinforce', 11, 13);
  assert.equal(s.budget, budget - COSTS.reinforce);
  assert.equal(getTile(s, 12, 13)!.reinforced, true);
  assert.equal(applyAction(s, 'reinforce', 11, 13).ok, false);
  undo(s);
  assert.equal(getTile(s, 11, 13)!.reinforced, false);
});
test('day-7 washout is forecast and asphalt avoids it; repair keeps dirt', () => {
  const dirt = createGame(),
    asphalt = createGame();
  act(dirt, 'dirt', 17, 3);
  act(asphalt, 'asphalt', 17, 3);
  advance(dirt, 7);
  advance(asphalt, 7);
  assert.equal(getTile(dirt, 17, 3)!.damaged, true);
  assert.equal(getTile(asphalt, 17, 3)!.damaged, false);
  act(dirt, 'repair', 17, 3);
  assert.equal(getTile(dirt, 17, 3)!.road, 'dirt');
});
test('a missed daily promise cannot be credited retroactively', () => {
  const s = createGame();
  endDay(s);
  assert.ok(s.failedTasks.includes('school-link'));
  act(s, 'asphalt', 17, 3);
  endDay(s);
  assert.equal(s.completedTasks.includes('school-link'), false);
});
test('resident reactions and ending follow real route conditions', () => {
  const s = createGame();
  assert.equal(getResidentViews(s).find((p) => p.id === 'misha')!.status, 'blocked');
  act(s, 'asphalt', 17, 3);
  act(s, 'bridge', 11, 8);
  assert.equal(getResidentViews(s).find((p) => p.id === 'misha')!.status, 'good');
  assert.equal(getResidentViews(s).find((p) => p.id === 'ilya')!.status, 'waiting');
  const good = run(centralPlan);
  assert.ok(getEnding(good).some((x) => x.includes('Первый стол')));
});
test('route explanation identifies disconnected entrances and closed institutions', () => {
  const s = createGame();
  assert.match(explainRoute(s, 'home-east', 'workshop'), /день 6/);
  advance(s, 6);
  assert.match(explainRoute(s, 'home-east', 'workshop'), /7:11/);
  for (const route of allRoutes(s))
    for (const point of route.path) {
      const t = getTile(s, point.x, point.y)!;
      assert.ok(t.road);
      assert.equal(t.damaged, false);
      assert.equal(
        BUILDINGS.some((b) => b.x === point.x && b.y === point.y),
        false,
      );
    }
});
test('save round trip retains undo; malformed and semantically impossible saves rejected', () => {
  const s = createGame();
  act(s, 'asphalt', 17, 3);
  const loaded = deserialize(serialize(s));
  assert.ok(loaded);
  assert.deepEqual(getMetrics(loaded), getMetrics(s));
  assert.ok(undo(loaded));
  assert.equal(loaded.budget, INITIAL_BUDGET);
  for (const raw of [
    '',
    '{}',
    'null',
    '{broken',
    JSON.stringify({ ...s, version: 9 }),
    JSON.stringify({ ...s, budget: -1 }),
    JSON.stringify({ ...s, day: 99 }),
    JSON.stringify({ ...s, history: [{}] }),
    JSON.stringify({ ...s, completedTasks: ['resilience'] }),
  ])
    assert.equal(deserialize(raw), null);
  const broken = JSON.parse(serialize(s));
  broken.tiles[8 * 24 + 11].road = 'bridge';
  assert.equal(deserialize(JSON.stringify(broken)), null);
  const reinforced = JSON.parse(serialize(s));
  reinforced.tiles[3 * 24 + 17].reinforced = true;
  assert.equal(deserialize(JSON.stringify(reinforced)), null);
});
test('legacy saves migrate roads, day and budget ratio, and corrupt legacy snapshots fail', () => {
  const initial = createGame();
  const legacy = {
    ...initial,
    version: 1,
    budget: 900,
    tiles: initial.tiles.map(({ reinforced, ...t }) => t),
  };
  const loaded = deserialize(JSON.stringify(legacy));
  assert.ok(loaded);
  assert.equal(loaded.version, 2);
  assert.equal(loaded.budget, 700);
  assert.ok(loaded.migrationNotice);
  assert.deepEqual(loaded.tiles, initial.tiles);
  assert.equal(deserialize(JSON.stringify({ ...legacy, history: [{}] })), null);
  assert.equal(deserialize(JSON.stringify({ ...legacy, completedTasks: ['resilience'] })), null);
});
test('wellbeing and score stay within bounds even with corrupt caller task arrays', () => {
  const s = createGame();
  s.completedTasks = Array(30).fill('resilience');
  assert.ok(getMetrics(s).wellbeing <= 100);
  assert.ok(getScore(s).total <= 100);
});
