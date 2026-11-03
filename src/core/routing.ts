import { BUILDINGS, getTile, MAP_WIDTH } from './map.ts';
import { DAYS } from './scenario.ts';
import type { GameState, Route, Tile } from './types.ts';

export function getWeather(state: Pick<GameState, 'day'>): 'dry' | 'rain' {
  return DAYS[state.day - 1]?.weather ?? 'dry';
}
export const availableServices = (state: Pick<GameState, 'day'>) =>
  BUILDINGS.filter((b) => b.kind !== 'home' && (b.opensDay ?? 1) <= state.day);
const weight = (tile: Tile, rain: boolean) => (tile.road === 'dirt' ? (rain ? 4 : 2) : 1);

// Binary min-heap: the same weighted graph supports every route and every preview.
class Queue {
  values: [number, number][] = [];
  push(node: number, cost: number) {
    const entry: [number, number] = [node, cost];
    let i = this.values.length;
    this.values.push(entry);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.values[parent][1] <= cost) break;
      this.values[i] = this.values[parent];
      i = parent;
    }
    this.values[i] = entry;
  }
  pop() {
    const first = this.values[0],
      last = this.values.pop()!;
    if (this.values.length) {
      let i = 0;
      while (i * 2 + 1 < this.values.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.values.length && this.values[child + 1][1] < this.values[child][1])
          child++;
        if (this.values[child][1] >= last[1]) break;
        this.values[i] = this.values[child];
        i = child;
      }
      this.values[i] = last;
    }
    return first;
  }
}

export function getRoute(state: GameState, homeId: string, serviceId: string): Route {
  const home = BUILDINGS.find((b) => b.id === homeId);
  const service = BUILDINGS.find((b) => b.id === serviceId);
  if (!home || !service || (service.opensDay ?? 1) > state.day) return { path: [], time: null };
  const from = getTile(state, home.entrance.x, home.entrance.y);
  const to = getTile(state, service.entrance.x, service.entrance.y);
  if (!from?.road || from.damaged || !to?.road || to.damaged) return { path: [], time: null };
  const start = from.y * MAP_WIDTH + from.x,
    end = to.y * MAP_WIDTH + to.x;
  const dist = new Float64Array(state.tiles.length).fill(Infinity);
  const prev = new Int32Array(state.tiles.length).fill(-1);
  const queue = new Queue(),
    rain = getWeather(state) === 'rain';
  dist[start] = 0;
  queue.push(start, 0);
  while (queue.values.length) {
    const [u, cost] = queue.pop();
    if (cost !== dist[u]) continue;
    if (u === end) break;
    const tile = state.tiles[u];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = getTile(state, tile.x + dx, tile.y + dy);
      if (!next?.road || next.damaged) continue;
      const v = next.y * MAP_WIDTH + next.x;
      const nextCost = cost + (weight(tile, rain) + weight(next, rain)) / 2;
      if (nextCost < dist[v]) {
        dist[v] = nextCost;
        prev[v] = u;
        queue.push(v, nextCost);
      }
    }
  }
  if (!Number.isFinite(dist[end])) return { path: [], time: null };
  const path = [];
  for (let u = end; u !== -1; u = prev[u]) {
    path.push({ x: state.tiles[u].x, y: state.tiles[u].y });
    if (u === start) break;
  }
  return { path: path.reverse(), time: dist[end] };
}

export function allRoutes(state: GameState) {
  return BUILDINGS.filter((b) => b.kind === 'home').flatMap((home) =>
    availableServices(state).map((service) => ({
      homeId: home.id,
      serviceId: service.id,
      ...getRoute(state, home.id, service.id),
    })),
  );
}

export function explainRoute(state: GameState, homeId: string, serviceId: string): string {
  const service = BUILDINGS.find((b) => b.id === serviceId);
  if ((service?.opensDay ?? 1) > state.day)
    return 'Мастерская откроется в день 6. Подъезд можно подготовить заранее.';
  const route = getRoute(state, homeId, serviceId);
  if (route.time === null) {
    const buildings = [BUILDINGS.find((b) => b.id === homeId), service];
    for (const b of buildings) {
      if (!b) continue;
      const t = getTile(state, b.entrance.x, b.entrance.y)!;
      if (!t.road || t.damaged)
        return `Нет проезда у входа: ${b.name}, участок ${t.x + 1}:${t.y + 1}. ${t.damaged ? 'Нужен ремонт.' : 'Подведите дорогу к светлой отметке входа.'}`;
    }
    return 'Входы подключены, но сеть между ними разорвана. Проверьте мосты и отмеченные красным повреждения.';
  }
  const dirt = route.path.filter((p) => getTile(state, p.x, p.y)?.road === 'dirt').length;
  return `${route.path.length - 1} переходов между клетками. ${dirt ? `Грунтовых участков: ${dirt}. ${getWeather(state) === 'rain' ? 'В дождь грунт вдвое медленнее.' : 'Асфальт сократит время.'}` : 'Весь путь проходит по устойчивому покрытию.'}`;
}
