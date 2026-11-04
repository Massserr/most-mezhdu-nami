import {
  BUILDINGS,
  BRIDGE_COLUMNS,
  BRIDGE_ROWS,
  createTiles,
  getTile,
  INITIAL_BUDGET,
  isBuilding,
} from './map.ts';
import { allRoutes, getRoute } from './routing.ts';
import { ACTION_LABELS, bridgeCost, COSTS, DAYS, TASKS } from './scenario.ts';
import type { Action, DayReport, GameState, Metrics, Preview, Score, TaskView } from './types.ts';

const clamp = (x: number, max = 1) => Math.min(max, Math.max(0, x));
export function createGame(): GameState {
  const state: GameState = {
    version: 2,
    day: 1,
    budget: INITIAL_BUDGET,
    tiles: createTiles(),
    completedTasks: [],
    failedTasks: [],
    events: [DAYS[0].story],
    history: [],
    finished: false,
    tutorialStep: 0,
    dayStart: {
      accessibility: 0,
      averageTime: null,
      wellbeing: 0,
      connected: 0,
      total: 18,
      speed: 0,
    },
  };
  state.dayStart = getMetrics(state);
  return state;
}

export function getMetrics(state: GameState): Metrics {
  const routes = allRoutes(state),
    reachable = routes.filter((r) => r.time !== null);
  const connected = reachable.length,
    total = routes.length;
  const accessibility = (100 * connected) / total;
  const speed =
    routes.reduce((sum, r) => sum + (r.time === null ? 0 : clamp(1 - r.time / 60)), 0) / total;
  const due = TASKS.filter((t) => t.startDay <= state.day);
  const promises =
    due.filter((t) => state.completedTasks.includes(t.id)).length / Math.max(1, due.length);
  return {
    accessibility,
    connected,
    total,
    speed,
    averageTime: connected ? reachable.reduce((sum, r) => sum + r.time!, 0) / connected : null,
    wellbeing: Math.round(
      clamp((0.55 * accessibility) / 100 + 0.3 * speed + 0.15 * promises) * 100,
    ),
  };
}

export function activeBridges(state: GameState): number {
  return BRIDGE_ROWS.filter((y) =>
    BRIDGE_COLUMNS.every((x) => {
      const tile = getTile(state, x, y)!;
      return tile.road === 'bridge' && !tile.damaged;
    }),
  ).length;
}

export function taskReady(state: GameState, id: string): boolean {
  const within = (home: string, service: string, limit: number) => {
    const time = getRoute(state, home, service).time;
    return time !== null && time <= limit;
  };
  switch (id) {
    case 'school-link':
      return getRoute(state, 'home-east-north', 'clinic').time !== null;
    case 'rain':
      return within('home-east-north', 'school', 32);
    case 'health':
      return within('home-south', 'clinic', 16);
    case 'crossing':
      return activeBridges(state) >= 2 && allRoutes(state).every((r) => r.time !== null);
    case 'fire-access':
      return allRoutes(state)
        .filter((r) => r.serviceId === 'fire')
        .every((r) => r.time !== null && r.time <= 48);
    case 'workshop':
      return (
        state.day >= 6 &&
        within('home-east', 'workshop', 26) &&
        allRoutes(state)
          .filter((r) => r.serviceId === 'workshop')
          .every((r) => r.time !== null)
      );
    case 'resilience': {
      const m = getMetrics(state);
      return (
        m.total === 24 &&
        m.connected === m.total &&
        activeBridges(state) >= 2 &&
        m.averageTime !== null &&
        m.averageTime <= 29
      );
    }
    default:
      return false;
  }
}

function taskProgress(state: GameState, id: string): string {
  if (id === 'crossing') return `Действующих мостов: ${activeBridges(state)} / 2`;
  if (id === 'resilience') {
    const m = getMetrics(state);
    return `${m.connected}/24 путей · ${activeBridges(state)}/2 моста · среднее ${m.averageTime?.toFixed(1) ?? '—'}/29`;
  }
  if (id === 'fire-access') {
    const routes = allRoutes(state).filter((r) => r.serviceId === 'fire');
    return `В пределах 48: ${routes.filter((r) => r.time !== null && r.time <= 48).length} / 6 кварталов`;
  }
  const task = TASKS.find((t) => t.id === id)!;
  const time = getRoute(state, task.homeId, task.serviceId).time;
  const limit = id === 'rain' ? 32 : id === 'health' ? 16 : id === 'workshop' ? 26 : null;
  return time === null
    ? 'Проезда пока нет'
    : `${time.toFixed(1)} усл. ед.${limit ? ` / не больше ${limit}` : ' · путь открыт'}`;
}

export function getTasks(state: GameState): TaskView[] {
  return TASKS.map((task) => {
    const status = state.completedTasks.includes(task.id)
      ? 'completed'
      : state.failedTasks.includes(task.id)
        ? 'failed'
        : state.day < task.startDay
          ? 'locked'
          : taskReady(state, task.id)
            ? 'ready'
            : 'active';
    return {
      ...task,
      status,
      progress:
        status === 'completed'
          ? 'Выполнено в срок'
          : status === 'failed'
            ? 'Срок пропущен. Дороги всё ещё можно улучшить.'
            : status === 'locked'
              ? `День ${task.startDay}`
              : taskProgress(state, task.id),
    };
  });
}

export function validateAction(state: GameState, action: Action, x: number, y: number) {
  const invalid = (reason: string, cost = 0) => ({ valid: false, reason, cost });
  if (state.finished) return invalid('Неделя завершена. Начните новую историю.');
  const tile = getTile(state, x, y);
  if (!tile) return invalid('Выберите целую клетку внутри карты.');
  if (!Object.hasOwn(ACTION_LABELS, action)) return invalid('Неизвестный инструмент.');
  if (isBuilding(x, y)) return invalid('Здесь здание. Дорогу подводят к светлой отметке входа.');
  let cost = 0;
  if (action === 'bridge') {
    if (!tile.bridgeSite) return invalid('Мост строят на одном из трёх отмеченных створов реки.');
    if (tile.road) return invalid('Переход уже есть. Выберите ремонт или укрепление.');
    cost = bridgeCost(y);
  } else if (action === 'repair') {
    if (!tile.road || !tile.damaged)
      return invalid('Ремонт нужен участку с красной отметкой повреждения.');
    cost = tile.road === 'bridge' ? COSTS.bridgeRepair : COSTS.repair;
  } else if (action === 'reinforce') {
    if (tile.road !== 'bridge') return invalid('Укрепить можно деревянный мост.');
    if (tile.damaged) return invalid('Сначала восстановите повреждённый мост.');
    if (tile.reinforced) return invalid('Этот мост уже защищён от паводка.');
    cost = COSTS.reinforce;
  } else {
    if (tile.terrain !== 'grass')
      return invalid('Для воды нужен мост, зелёную зону с деревьями сохраняем.');
    if (tile.damaged) return invalid('Сначала отремонтируйте повреждённый участок.');
    if (tile.road && !(action === 'asphalt' && tile.road === 'dirt'))
      return invalid('Здесь уже есть такое покрытие.');
    cost = action === 'dirt' ? COSTS.dirt : tile.road === 'dirt' ? COSTS.upgrade : COSTS.asphalt;
  }
  if (state.budget < cost)
    return invalid(
      `Нужно ${cost}, в бюджете ${state.budget}. Отмените сегодняшнюю работу или выберите другой путь.`,
      cost,
    );
  const reason =
    action === 'reinforce'
      ? 'Защита всего моста от паводка'
      : action === 'repair'
        ? 'Восстановить проезд без смены покрытия'
        : action === 'bridge'
          ? y === 8
            ? 'Каменный переход: устойчив к паводку'
            : 'Деревянный переход: дешевле, требуется защита от паводка'
          : action === 'asphalt' && tile.road === 'dirt'
            ? 'Заменить грунт устойчивым асфальтом'
            : 'Проложить новый участок';
  return { valid: true, reason, cost };
}

function mutate(state: GameState, action: Action, x: number, y: number, cost: number) {
  const tile = getTile(state, x, y)!;
  if (
    action === 'bridge' ||
    action === 'reinforce' ||
    (action === 'repair' && tile.road === 'bridge')
  ) {
    for (const xx of BRIDGE_COLUMNS) {
      const part = getTile(state, xx, y)!;
      part.road = 'bridge';
      part.damaged = false;
      if (action === 'reinforce' || (action === 'bridge' && y === 8)) part.reinforced = true;
    }
  } else if (action === 'repair') tile.damaged = false;
  else tile.road = action;
  state.budget -= cost;
}

export function previewAction(state: GameState, action: Action, x: number, y: number): Preview {
  const check = validateAction(state, action, x, y);
  if (!check.valid) return { ...check, metrics: null, tasksReady: [] };
  const copy = { ...state, tiles: state.tiles.map((t) => ({ ...t })) };
  mutate(copy, action, x, y, check.cost);
  return {
    ...check,
    metrics: getMetrics(copy),
    tasksReady: getTasks(copy)
      .filter((t) => t.status === 'ready' && !taskReady(state, t.id))
      .map((t) => t.title),
  };
}

export function applyAction(state: GameState, action: Action, x: number, y: number) {
  const check = validateAction(state, action, x, y);
  if (!check.valid) return { ok: false, message: check.reason };
  state.history.push({ tiles: state.tiles.map((t) => ({ ...t })), budget: state.budget });
  mutate(state, action, x, y, check.cost);
  return { ok: true, message: `${ACTION_LABELS[action]}: −${check.cost} ед. ${check.reason}.` };
}

export function undo(state: GameState): boolean {
  if (state.finished) return false;
  const last = state.history.pop();
  if (!last) return false;
  state.tiles = last.tiles;
  state.budget = last.budget;
  return true;
}

export function enterDay(state: GameState): string[] {
  const events: string[] = [DAYS[state.day - 1].story];
  const damageBridge = (y: number) =>
    BRIDGE_COLUMNS.forEach((x) => {
      getTile(state, x, y)!.damaged = true;
    });
  if (state.day === 4) {
    damageBridge(13);
    events.push('Южный мост закрыт на обследование. Ремонт: 58. Нужны два работающих перехода.');
  }
  if (state.day === 5) {
    const damaged: string[] = [];
    for (const y of [3, 13]) {
      const tile = getTile(state, 11, y)!;
      if (tile.road && !tile.reinforced) {
        damageBridge(y);
        damaged.push(y === 3 ? 'северный' : 'южный');
      }
    }
    events.push(
      damaged.length
        ? `Паводок закрыл ${damaged.join(' и ')} мост. Укреплённые переходы и каменный мост работают.`
        : 'Защищённые мосты выдержали паводок. Предусмотрительность сохранила проезд.',
    );
  }
  if (state.day === 6)
    events.push('Мастерская открылась: теперь проверяются 24 маршрута. Её вход — 7:11.');
  if (state.day === 7) {
    const tile = getTile(state, 17, 3)!;
    if (tile.road === 'dirt') {
      tile.damaged = true;
      events.push(
        'Северный грунтовый участок 18:4 размок. Ремонт: 16; можно также проложить обход.',
      );
    } else if (tile.road === 'asphalt')
      events.push('Асфальт у Северной слободы выдержал дождь: квартал остаётся на связи.');
  }
  state.events.push(...events);
  return events;
}

export function endDay(state: GameState): DayReport {
  if (state.finished)
    return {
      day: state.day,
      before: state.dayStart,
      after: getMetrics(state),
      completed: [],
      failed: [],
      events: [],
      finished: true,
    };
  const completed: string[] = [],
    failed: string[] = [];
  for (const task of getTasks(state)) {
    if (task.status === 'ready') {
      state.completedTasks.push(task.id);
      completed.push(task.title);
    } else if (task.status === 'active' && task.deadline <= state.day) {
      state.failedTasks.push(task.id);
      failed.push(task.title);
    }
  }
  const report: DayReport = {
    day: state.day,
    before: { ...state.dayStart },
    after: getMetrics(state),
    completed,
    failed,
    events: [],
    finished: state.day === 7,
  };
  state.history = [];
  state.tutorialStep = Math.max(state.tutorialStep, 4);
  if (state.day === 7) {
    state.finished = true;
    return report;
  }
  state.day++;
  report.events = enterDay(state);
  state.dayStart = getMetrics(state);
  return report;
}

export function getScore(state: GameState): Score {
  const m = getMetrics(state);
  const accessibility = 0.35 * m.accessibility,
    speed = 20 * m.speed;
  const tasks =
    (40 * TASKS.filter((t) => state.completedTasks.includes(t.id)).length) / TASKS.length;
  const economy = 5 * clamp(state.budget / INITIAL_BUDGET);
  const total = Math.round(accessibility + speed + tasks + economy);
  const success =
    total >= 65 && m.connected === m.total && m.total === 24 && state.completedTasks.length >= 5;
  return {
    total,
    success,
    accessibility,
    speed,
    tasks,
    economy,
    label: success
      ? total >= 85 && state.completedTasks.length === 7
        ? 'Берёзовка стала ближе'
        : 'Хорошее начало'
      : 'У Берёзовки ещё есть надежда',
  };
}

export function getAdvisor(state: GameState): string {
  if (state.finished)
    return 'Выберите жителя и посмотрите, как изменилась его дорога за эту неделю.';
  const urgent = getTasks(state).find((t) => t.status === 'active');
  if (urgent) {
    if (urgent.id === 'fire-access') {
      const worst = allRoutes(state)
        .filter((r) => r.serviceId === 'fire')
        .sort((a, b) => (b.time ?? 999) - (a.time ?? 999))[0];
      return `${BUILDINGS.find((b) => b.id === worst.homeId)!.name}: ${worst.time === null ? 'нет проезда' : `${worst.time.toFixed(1)} усл. ед. до пожарной части`}. ${urgent.hint}`;
    }
    return urgent.hint;
  }
  return `Сегодняшняя цель достигнута. ${DAYS[state.day - 1].forecast}`;
}
