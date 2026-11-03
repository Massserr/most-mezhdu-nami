import type { Building, GameState, Tile } from './types.ts';
export const MAP_WIDTH = 24;
export const MAP_HEIGHT = 16;
export const INITIAL_BUDGET = 700;
export const BRIDGE_ROWS = [3, 8, 13] as const;
export const BRIDGE_COLUMNS = [11, 12] as const;
export const BUILDINGS: Building[] = [
  {
    id: 'home-west-north',
    name: 'Сосновая улица',
    kind: 'home',
    x: 3,
    y: 2,
    entrance: { x: 3, y: 3 },
    residents: 32,
  },
  {
    id: 'home-school',
    name: 'Школьный переулок',
    kind: 'home',
    x: 7,
    y: 2,
    entrance: { x: 7, y: 3 },
    residents: 24,
  },
  {
    id: 'home-east-north',
    name: 'Северная слобода',
    kind: 'home',
    x: 19,
    y: 2,
    entrance: { x: 19, y: 3 },
    residents: 40,
  },
  {
    id: 'home-west',
    name: 'Луговая улица',
    kind: 'home',
    x: 3,
    y: 9,
    entrance: { x: 3, y: 8 },
    residents: 28,
  },
  {
    id: 'home-east',
    name: 'Заречная улица',
    kind: 'home',
    x: 19,
    y: 9,
    entrance: { x: 19, y: 8 },
    residents: 36,
  },
  {
    id: 'home-south',
    name: 'Садовая улица',
    kind: 'home',
    x: 20,
    y: 12,
    entrance: { x: 20, y: 13 },
    residents: 20,
  },
  { id: 'school', name: 'Берёзовская школа', kind: 'school', x: 5, y: 7, entrance: { x: 5, y: 8 } },
  {
    id: 'clinic',
    name: 'Медицинский пункт',
    kind: 'clinic',
    x: 18,
    y: 7,
    entrance: { x: 18, y: 8 },
  },
  { id: 'fire', name: 'Пожарная часть', kind: 'fire', x: 6, y: 12, entrance: { x: 6, y: 13 } },
  {
    id: 'workshop',
    name: 'Общая мастерская',
    kind: 'work',
    x: 6,
    y: 11,
    entrance: { x: 6, y: 10 },
    opensDay: 6,
  },
];
export function createTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (let y = 0; y < MAP_HEIGHT; y++)
    for (let x = 0; x < MAP_WIDTH; x++) {
      const water = x === 11 || x === 12;
      const horizontal = [3, 8, 13].includes(y) && x >= 3 && x <= 20;
      const vertical = [8, 15].includes(x) && y >= 3 && y <= 13;
      let road: Tile['road'] =
        !water && (horizontal || vertical) ? (y === 8 || y === 13 ? 'asphalt' : 'dirt') : null;
      if (water && y === 13) road = 'bridge';
      if (x === 17 && y === 3) road = null;
      tiles.push({
        x,
        y,
        terrain: water ? 'water' : 'grass',
        road,
        damaged: false,
        bridgeSite: water && BRIDGE_ROWS.includes(y as 3 | 8 | 13),
        reinforced: false,
      });
    }
  for (const [x, y] of [
    [1, 4],
    [1, 5],
    [21, 5],
    [22, 5],
    [9, 1],
    [16, 14],
    [2, 11],
    [22, 10],
  ])
    tiles[y * MAP_WIDTH + x].terrain = 'obstacle';
  return tiles;
}
export function getTile(state: Pick<GameState, 'tiles'>, x: number, y: number): Tile | undefined {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= MAP_WIDTH ||
    y >= MAP_HEIGHT
  )
    return undefined;
  return state.tiles[y * MAP_WIDTH + x];
}
export function isBuilding(x: number, y: number): boolean {
  return BUILDINGS.some((b) => b.x === x && b.y === y);
}
