import Phaser from 'phaser';
import { BUILDINGS, getWeather, type GameState } from '../core/index.ts';

type Point = { x: number; y: number };
type Preview = Point & { valid: boolean };
type Callbacks = {
  onCell: (x: number, y: number) => void;
  onHover: (x: number, y: number) => void;
};

const CELL = 32;
const WIDTH = 768;
const HEIGHT = 512;
const palette = {
  grass: [0x8faa68, 0x93ae6c, 0x91ab68, 0x8ca665],
  grassDark: 0x769452,
  grassLight: 0xadc17c,
  water: 0x5a9fba,
  waterDeep: 0x4a8fae,
  waterLight: 0x88c2ce,
  sand: 0xcac28b,
  road: 0x767e7d,
  dirt: 0xbfa378,
};

// Small deterministic integer hash: scenery never jumps after a building action.
const noise = (x: number, y: number, seed = 0) => {
  let n = Math.imul(x + 73, 374761393) ^ Math.imul(y + 17, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};

export function createMap(parent: HTMLElement, callbacks: Callbacks) {
  let current: GameState | null = null;
  let route: Point[] = [];
  let selected: Point | null = null;
  let preview: Preview | null = null;
  let hover: Point | null = null;
  let guide: Point | null = null;
  let ready = false;
  let destroyed = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const bursts: { x: number; y: number; time: number }[] = [];

  class VillageScene extends Phaser.Scene {
    ground!: Phaser.GameObjects.Graphics;
    detail!: Phaser.GameObjects.Graphics;
    overlay!: Phaser.GameObjects.Graphics;
    moving!: Phaser.GameObjects.Graphics;
    effects!: Phaser.GameObjects.Graphics;
    groundImage?: Phaser.GameObjects.Image;
    detailImage?: Phaser.GameObjects.Image;
    labels: Phaser.GameObjects.Text[] = [];
    visualKey = '';
    constructor() {
      super('Berezovka');
    }
    create() {
      this.ground = this.add.graphics();
      this.detail = this.add.graphics();
      this.overlay = this.add.graphics().setDepth(2);
      this.moving = this.add.graphics().setDepth(3);
      this.effects = this.add.graphics().setDepth(10);
      this.game.canvas.setAttribute('role', 'img');
      this.game.canvas.setAttribute('tabindex', '0');
      this.game.canvas.setAttribute(
        'aria-label',
        'Интерактивная карта Берёзовки: дома, школа, медпункт и пожарная часть на двух берегах реки. Выберите инструмент строительства, затем клетку карты.',
      );
      this.game.canvas.setAttribute(
        'title',
        'Карта Берёзовки. Стрелки: клетка, Enter: действие, 1–5: инструмент.',
      );
      this.game.scale.setParentSize(parent.clientWidth, parent.clientHeight).refresh();
      this.cameras.main.setBounds(0, 0, WIDTH, HEIGHT);
      this.input.mouse?.disableContextMenu();
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        const camera = this.cameras.main;
        if (pointer.isDown && pointer.rightButtonDown()) {
          camera.scrollX -= (pointer.x - pointer.prevPosition.x) / camera.zoom;
          camera.scrollY -= (pointer.y - pointer.prevPosition.y) / camera.zoom;
          return;
        }
        const point = camera.getWorldPoint(pointer.x, pointer.y);
        const x = Math.floor(point.x / CELL),
          y = Math.floor(point.y / CELL);
        if (x < 0 || y < 0 || x >= 24 || y >= 16) return;
        if (hover?.x === x && hover?.y === y) return;
        hover = { x, y };
        callbacks.onHover(x, y);
        this.drawOverlay();
      });
      this.input.on('gameout', () => {
        hover = null;
        this.drawOverlay();
      });
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonDown()) return;
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const x = Math.floor(point.x / CELL),
          y = Math.floor(point.y / CELL);
        if (x >= 0 && y >= 0 && x < 24 && y < 16) callbacks.onCell(x, y);
      });
      this.input.on(
        'wheel',
        (_pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) =>
          changeZoom(dy < 0 ? 1 : -1),
      );
      ready = true;
      this.redraw();
    }
    rect(
      g: Phaser.GameObjects.Graphics,
      color: number,
      x: number,
      y: number,
      w: number,
      h: number,
      alpha = 1,
    ) {
      g.fillStyle(color, alpha).fillRect(
        Math.floor(x),
        Math.floor(y),
        Math.floor(w),
        Math.floor(h),
      );
    }
    tree(x: number, y: number, variant: number) {
      const g = this.detail;
      this.rect(g, 0x405c3a, x + 6, y + 24, 23, 5, 0.25);
      this.rect(g, 0x68563d, x + 14, y + 16, 4, 13);
      if (variant % 3 === 0) {
        // A recognizable silver birch with a layered, block-cut crown.
        this.rect(g, 0xe4dfbe, x + 14, y + 13, 4, 16);
        this.rect(g, 0x777655, x + 14, y + 20, 2, 2);
        this.rect(g, 0x777655, x + 16, y + 25, 2, 2);
        this.rect(g, 0x527747, x + 6, y + 7, 22, 12);
        this.rect(g, 0x648f4f, x + 3, y + 5, 22, 11);
        this.rect(g, 0x80a958, x + 8, y + 1, 15, 10);
        this.rect(g, 0x99b866, x + 10, y + 3, 7, 4);
      } else {
        this.rect(g, 0x3e6746, x + 4, y + 13, 24, 9);
        this.rect(g, 0x4c7c4c, x + 6, y + 7, 20, 13);
        this.rect(g, 0x5f9254, x + 10, y + 2, 12, 14);
        this.rect(g, 0x80a661, x + 11, y + 4, 6, 6);
        this.rect(g, 0x3e6746, x + 22, y + 15, 5, 5);
      }
    }
    garden(x: number, y: number, variant: number, fenced = false) {
      const g = this.ground;
      this.rect(g, 0x9d9d67, x + 2, y + 3, 28, 26);
      for (let row = 0; row < 4; row++) {
        this.rect(g, 0x9a865d, x + 4, y + 5 + row * 6, 24, 4);
        this.rect(g, 0xb2a578, x + 4, y + 9 + row * 6, 24, 1);
        for (let col = 0; col < 4; col++) {
          const cx = x + 6 + col * 6,
            cy = y + 5 + row * 6;
          this.rect(g, variant % 2 ? 0x6e8e50 : 0xc5bb79, cx, cy, 3, 3);
          this.rect(g, variant % 2 ? 0x94ad65 : 0xe0ce8d, cx, cy, 2, 1);
          if (variant % 3 === 0 && (row + col) % 3 === 0)
            this.rect(g, 0xc28b58, cx + 1, cy + 2, 1, 1);
        }
      }
      if (fenced) {
        // The yard is cosmetic: a road replaces it completely on this cell.
        this.rect(g, 0xc5b58a, x + 1, y + 2, 30, 2);
        this.rect(g, 0xa79770, x + 1, y + 28, 30, 2);
        this.rect(g, 0xb9a67b, x + 29, y + 2, 2, 28);
        for (let dx = 1; dx < 32; dx += 7) {
          this.rect(g, 0xe0d0a4, x + dx, y, 2, 6);
          this.rect(g, 0xd4c196, x + dx, y + 26, 2, 6);
        }
      }
    }
    shrub(x: number, y: number, variant: number) {
      const g = this.ground;
      this.rect(g, 0x6b894c, x + 2, y + 6, 15, 6, 0.7);
      this.rect(g, 0x71934e, x + 3, y + 3, 13, 7);
      this.rect(g, 0x86a65a, x + 5, y + 1, 8, 6);
      this.rect(g, 0x9fb76b, x + 6, y + 2, 4, 2);
      if (variant % 3 === 0) {
        this.rect(g, 0xcca07e, x + 5, y + 6, 2, 2);
        this.rect(g, 0xd9b399, x + 12, y + 4, 2, 2);
      }
    }
    drawBuilding(building: (typeof BUILDINGS)[number]) {
      const g = this.detail,
        x = building.x * CELL,
        y = building.y * CELL;
      const hash = noise(building.x, building.y);
      const house = building.kind === 'home';
      const wall = house
        ? hash % 2
          ? 0xd3bd8c
          : 0xc29470
        : building.kind === 'work'
          ? 0xc5ab7d
          : 0xe5d8b8;
      const roof = house
        ? hash % 2
          ? 0x95715b
          : 0x92715c
        : building.kind === 'school'
          ? 0x517b83
          : building.kind === 'clinic'
            ? 0x6c8a7a
            : building.kind === 'work'
              ? 0x8d8258
              : 0xb16b52;
      this.rect(g, 0x40563e, x + 5, y + 22, 27, 8, 0.28);
      this.rect(g, 0x68644f, x + 3, y + 25, 26, 4);
      this.rect(g, wall, x + 4, y + 10, 24, 16);
      this.rect(g, 0x8e7b61, x + 25, y + 11, 3, 15);
      if (house && hash % 2 === 0) {
        for (let dy = 13; dy < 25; dy += 4) this.rect(g, 0xa87c5c, x + 5, y + dy, 19, 1);
      }
      this.rect(g, 0x675a4b, x + 1, y + 10, 30, 3);
      this.rect(g, roof, x + 2, y + 6, 28, 6);
      this.rect(g, roof, x + 5, y + 3, 22, 6);
      this.rect(g, roof, x + 8, y + 1, 16, 5);
      this.rect(g, 0xffffff, x + 8, y + 2, 16, 1, 0.18);
      this.rect(g, 0x3d5357, x + 7, y + 16, 6, 7);
      this.rect(g, 0xf5dfa0, x + 8, y + 17, 4, 5);
      this.rect(g, 0xf2e6c6, x + 10, y + 17, 1, 5);
      this.rect(g, 0xe9e0bd, x + 6, y + 22, 8, 2);
      this.rect(g, 0x765e49, x + 19, y + 18, 5, 8);
      this.rect(g, 0xe0ca91, x + 20, y + 20, 1, 1);
      this.rect(g, 0x806f5a, x + 23, y, 4, 6);
      this.rect(g, 0xc8bba0, x + 22, y, 6, 2);
      if (building.kind === 'clinic') {
        this.rect(g, 0xf5efdb, x + 15, y + 12, 11, 7);
        this.rect(g, 0xbd6555, x + 19, y + 13, 3, 5);
        this.rect(g, 0xbd6555, x + 17, y + 15, 7, 2);
      }
      if (building.kind === 'fire') {
        this.rect(g, 0x62594d, x + 16, y + 16, 10, 10);
        this.rect(g, 0xb25343, x + 17, y + 19, 8, 6);
        this.rect(g, 0xe8be7b, x + 18, y + 18, 6, 2);
      }
      if (building.kind === 'school') {
        this.rect(g, 0xe5c061, x + 14, y + 4, 5, 5);
        this.rect(g, 0x476069, x + 16, y + 5, 1, 3);
      }
      if (building.kind === 'work') {
        this.rect(g, 0x74664e, x + 16, y + 17, 10, 9);
        this.rect(g, 0xd9c58c, x + 17, y + 18, 8, 2);
        if ((current?.day ?? 1) < 6) this.rect(g, 0x4d5a46, x + 15, y + 16, 12, 11, 0.5);
      }
      // The exact network attachment is visible as a short cream footpath.
      const ex = building.entrance.x * CELL + 16,
        ey = building.entrance.y * CELL + 16;
      g.lineStyle(4, 0xd6caa3, 0.85);
      const sx = x + 16 + Math.sign(ex - x - 16) * 15;
      const sy = y + 16 + Math.sign(ey - y - 16) * 15;
      g.lineBetween(sx, sy, ex, ey);
      this.rect(g, 0xf2dfaa, ex - 2, ey - 2, 4, 4);
      if (!house) {
        const text =
          building.kind === 'school'
            ? 'ШКОЛА'
            : building.kind === 'clinic'
              ? 'МЕДПУНКТ'
              : building.kind === 'work'
                ? (current?.day ?? 1) < 6
                  ? 'МАСТЕРСКАЯ · ДЕНЬ 6'
                  : 'МАСТЕРСКАЯ'
                : 'ПОЖАРНАЯ';
        // The workshop has a north entrance: keep its caption away from that tile.
        if (building.kind === 'work') {
          g.lineStyle(1, 0x344f47, 0.65).lineBetween(x - CELL, y - 12, x + 4, y + 4);
        }
        const label = this.add
          .text(building.kind === 'work' ? x - 3 * CELL : x + 16, y - 6, text, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#f9f4df',
            backgroundColor: '#344f47',
            padding: { x: 4, y: 3 },
          })
          .setOrigin(0.5, 1)
          .setDepth(5);
        this.labels.push(label);
      }
    }
    redraw() {
      if (!ready || !current) return;
      const nextKey =
        `${current.day}:` +
        current.tiles
          .map(
            (tile) => `${tile.road ?? '-'}${tile.damaged ? '!' : ''}${tile.reinforced ? 'R' : ''}`,
          )
          .join(',');
      if (this.visualKey === nextKey) {
        this.drawOverlay();
        return;
      }
      this.visualKey = nextKey;
      this.ground.clear();
      this.detail.clear();
      this.labels.forEach((label) => label.destroy());
      this.labels = [];
      const g = this.ground;
      const tiles = new Map(current.tiles.map((t) => [`${t.x},${t.y}`, t]));
      const roadAt = (x: number, y: number) => Boolean(tiles.get(`${x},${y}`)?.road);
      const occupied = new Set(BUILDINGS.map((b) => `${b.x},${b.y}`));
      const entrances = new Set(BUILDINGS.map((b) => `${b.entrance.x},${b.entrance.y}`));
      for (const tile of current.tiles) {
        const x = tile.x * CELL,
          y = tile.y * CELL,
          hash = noise(tile.x, tile.y);
        this.rect(g, palette.grass[hash % 4], x, y, CELL, CELL);
        if (tile.terrain === 'water') {
          this.rect(g, palette.water, x, y, CELL, CELL);
          this.rect(g, palette.waterDeep, x + 5, y + (hash % 20), 21, 5, 0.45);
          this.rect(g, palette.waterLight, x + 4 + (hash % 9), y + 8, 11, 2, 0.6);
          this.rect(g, palette.waterLight, x + 16, y + 23, 9, 1, 0.55);
          if (tile.x === 11) {
            this.rect(g, 0x729b7c, x, y, 4, CELL);
            this.rect(g, 0xb4bc89, x, y, 2, CELL);
          } else if (tile.x === 12) {
            this.rect(g, 0x729b7c, x + 28, y, 4, CELL);
            this.rect(g, 0xb4bc89, x + 30, y, 2, CELL);
          }
          if (tile.bridgeSite && !tile.road) {
            for (let dx = 7; dx < 32; dx += 8) this.rect(g, 0xf7e3a9, x + dx, y + 15, 4, 2, 0.65);
            this.rect(g, 0xf7e3a9, x + 14, y + 11, 2, 10, 0.7);
          }
        } else {
          for (let i = 0; i < 3; i++) {
            const hx = 3 + (noise(tile.x, tile.y, i + 1) % 26);
            const hy = 3 + (noise(tile.y, tile.x, i + 17) % 26);
            this.rect(
              g,
              i % 2 ? palette.grassDark : palette.grassLight,
              x + hx,
              y + hy,
              3,
              1,
              0.65,
            );
          }
          if (tile.x === 10 || tile.x === 13) {
            const dx = tile.x === 10 ? 29 : 0;
            this.rect(g, palette.sand, x + dx, y, 3, CELL);
            if (hash % 3 === 0) {
              this.rect(g, 0x69854f, x + dx, y + 7, 1, 7);
              this.rect(g, 0x69854f, x + dx + 2, y + 9, 1, 6);
            }
          }
        }
        if (tile.road === 'bridge') {
          this.rect(g, 0x355963, x, y + 10, CELL, 19, 0.35);
          this.rect(g, 0x836a4c, x, y + 7, CELL, 20);
          this.rect(g, 0xc6a577, x, y + 9, CELL, 15);
          for (let dx = 1; dx < CELL; dx += 5) this.rect(g, 0xa6865f, x + dx, y + 9, 1, 15);
          this.rect(g, 0xe1c190, x, y + 6, CELL, 3);
          this.rect(g, 0x775c40, x, y + 24, CELL, 3);
          for (let dx = 1; dx < CELL; dx += 14) {
            this.rect(g, 0x6c573d, x + dx, y + 4, 3, 6);
            this.rect(g, 0x6c573d, x + dx, y + 23, 3, 6);
          }
          if (tile.reinforced) {
            this.rect(g, 0xb7b7a1, x, y + 6, 32, 4);
            this.rect(g, 0x888d80, x, y + 24, 32, 4);
            for (let dx = 3; dx < 32; dx += 15) {
              this.rect(g, 0xe0d8b5, x + dx, y + 3, 5, 7);
              this.rect(g, 0x737f77, x + dx, y + 24, 5, 7);
            }
          }
        } else if (tile.road) {
          const dirt = tile.road === 'dirt';
          const color = dirt ? palette.dirt : palette.road;
          const edge = dirt ? 0xa98e68 : 0x626d68;
          const left = roadAt(tile.x - 1, tile.y),
            right = roadAt(tile.x + 1, tile.y);
          const up = roadAt(tile.x, tile.y - 1),
            down = roadAt(tile.x, tile.y + 1);
          this.rect(g, edge, x + 5, y + 5, 22, 22);
          this.rect(g, color, x + 7, y + 7, 18, 18);
          if (left) {
            this.rect(g, edge, x, y + 5, 16, 22);
            this.rect(g, color, x, y + 7, 17, 18);
          }
          if (right) {
            this.rect(g, edge, x + 16, y + 5, 16, 22);
            this.rect(g, color, x + 15, y + 7, 17, 18);
          }
          if (up) {
            this.rect(g, edge, x + 5, y, 22, 16);
            this.rect(g, color, x + 7, y, 18, 17);
          }
          if (down) {
            this.rect(g, edge, x + 5, y + 16, 22, 16);
            this.rect(g, color, x + 7, y + 15, 18, 17);
          }
          if (!dirt) {
            if (left || right) this.rect(g, 0xd3c9a7, x + 12, y + 15, 8, 2, 0.75);
            if (up || down) this.rect(g, 0xd3c9a7, x + 15, y + 12, 2, 8, 0.75);
          } else {
            if (left || right) {
              this.rect(g, 0xab8c63, x, y + 11, 32, 1, 0.55);
              this.rect(g, 0xd0b78a, x, y + 21, 32, 1, 0.7);
            }
            if (up || down) {
              this.rect(g, 0xab8c63, x + 11, y, 1, 32, 0.55);
              this.rect(g, 0xd0b78a, x + 21, y, 1, 32, 0.7);
            }
            if (getWeather(current) === 'rain') this.rect(g, 0x7d9590, x + 9, y + 18, 9, 4, 0.75);
          }
        }
        if (tile.damaged) {
          this.rect(g, 0x514e43, x + 10, y + 10, 13, 12);
          this.rect(g, 0x7e594a, x + 7, y + 16, 18, 6);
          this.rect(g, 0xead197, x + 6, y + 11, 21, 4);
          for (let dx = 8; dx < 27; dx += 7) this.rect(g, 0xae5d45, x + dx, y + 11, 3, 4);
        }
        if (tile.terrain === 'obstacle') this.tree(x, y, hash);
        // Scenic flowers and tufts are ground details, never false obstacles.
        if (
          tile.terrain === 'grass' &&
          !tile.road &&
          !occupied.has(`${tile.x},${tile.y}`) &&
          !entrances.has(`${tile.x},${tile.y}`)
        ) {
          const yard = BUILDINGS.some(
            (b) => b.kind === 'home' && tile.x === b.x + 1 && tile.y === b.y,
          );
          const field =
            (tile.x >= 2 && tile.x <= 5 && tile.y >= 5 && tile.y <= 6) ||
            (tile.x >= 17 && tile.x <= 18 && tile.y >= 10 && tile.y <= 11) ||
            (tile.x >= 3 && tile.x <= 6 && tile.y === 14) ||
            (tile.x >= 21 && tile.x <= 22 && tile.y >= 1 && tile.y <= 2);
          if (yard) this.garden(x, y, hash, true);
          else if (field) this.garden(x, y, tile.x < 11 ? 2 : 3);
          else if ((tile.x === 0 || tile.x === 23 || tile.y === 15) && hash % 3 !== 0) {
            this.shrub(x + 1, y + 5, hash);
            this.shrub(x + 12, y + 16, hash + 1);
          } else if ((tile.x === 9 || tile.x === 14) && [5, 10, 11].includes(tile.y)) {
            this.shrub(x + 8, y + 9, hash);
          }
          if (hash % 11 === 0) {
            this.rect(g, 0xf1e0a0, x + 10, y + 15, 2, 2);
            this.rect(g, 0xdbc6b1, x + 22, y + 22, 2, 2);
          }
          if (tile.y === 0 || tile.y === 15) {
            this.rect(g, 0x799853, x + 4, y + 10, 20, 1, 0.4);
            this.rect(g, 0x799853, x + 4, y + 14, 20, 1, 0.4);
          }
        }
      }
      BUILDINGS.forEach((building) => this.drawBuilding(building));
      // Bake thousands of static brush strokes once per map change, rather than
      // drawing them again on every animation frame. Clear also makes undo exact.
      for (const [key, graphics] of [
        ['village-ground', this.ground],
        ['village-detail', this.detail],
      ] as const) {
        if (this.textures.exists(key)) {
          (this.textures.get(key) as Phaser.Textures.CanvasTexture)
            .getContext()
            .clearRect(0, 0, WIDTH, HEIGHT);
        }
        graphics.generateTexture(key, WIDTH, HEIGHT);
        graphics.setVisible(false);
      }
      this.groundImage ??= this.add.image(0, 0, 'village-ground').setOrigin(0).setDepth(0);
      this.detailImage ??= this.add.image(0, 0, 'village-detail').setOrigin(0).setDepth(1);
      // Quiet map captions, kept away from the transport network.
      const addCaption = (x: number, y: number, text: string) => {
        this.labels.push(
          this.add
            .text(x, y, text, {
              fontFamily: 'Arial, sans-serif',
              fontSize: '11px',
              color: '#3f6047',
              fontStyle: 'bold',
              letterSpacing: 2,
            })
            .setAlpha(0.7),
        );
      };
      addCaption(34, 26, 'БЕРЁЗОВКА');
      addCaption(553, 467, 'ПРАВЫЙ БЕРЕГ');
      this.drawOverlay();
    }
    drawOverlay() {
      if (!ready) return;
      const g = this.overlay;
      g.clear();
      if (route.length > 0) {
        g.lineStyle(7, 0x2b5657, 0.6);
        g.beginPath();
        route.forEach((p, i) =>
          i === 0
            ? g.moveTo(p.x * CELL + 16, p.y * CELL + 16)
            : g.lineTo(p.x * CELL + 16, p.y * CELL + 16),
        );
        g.strokePath();
        g.lineStyle(3, 0xffdf85, 1);
        g.beginPath();
        route.forEach((p, i) =>
          i === 0
            ? g.moveTo(p.x * CELL + 16, p.y * CELL + 16)
            : g.lineTo(p.x * CELL + 16, p.y * CELL + 16),
        );
        g.strokePath();
        for (const p of [route[0], route[route.length - 1]]) {
          this.rect(g, 0x3a5a4f, p.x * CELL + 11, p.y * CELL + 11, 10, 10);
          this.rect(g, 0xffdf85, p.x * CELL + 13, p.y * CELL + 13, 6, 6);
        }
      }
      if (selected) {
        const x = selected.x * CELL,
          y = selected.y * CELL;
        g.lineStyle(2, 0xfff0b9, 1).strokeRect(x + 1, y + 1, 30, 30);
        const corners = [
          [x, y],
          [x + 26, y],
          [x, y + 26],
          [x + 26, y + 26],
        ];
        for (const [cx, cy] of corners) this.rect(g, 0xfff0b9, cx, cy, 6, 6);
      }
      if (guide) {
        g.lineStyle(3, 0xffdf85, 1).strokeRect(guide.x * CELL - 2, guide.y * CELL - 2, 36, 36);
        this.rect(g, 0xffdf85, guide.x * CELL + 12, guide.y * CELL - 7, 8, 4);
      }
      const p = preview ?? hover;
      if (p) {
        const color = preview ? (preview.valid ? 0xe8f5b5 : 0xf29b7b) : 0xf8edc6;
        g.fillStyle(color, 0.2).fillRect(p.x * CELL + 1, p.y * CELL + 1, 30, 30);
        g.lineStyle(2, color, 0.95).strokeRect(p.x * CELL + 2, p.y * CELL + 2, 28, 28);
      }
    }
    update(time: number) {
      if (!current || !ready) return;
      const g = this.moving;
      g.clear();
      this.effects.clear();
      if (reducedMotion.matches) return;
      for (let i = bursts.length - 1; i >= 0; i--) {
        const burst = bursts[i],
          progress = (time - burst.time) / 750;
        if (progress >= 1) {
          bursts.splice(i, 1);
          continue;
        }
        const size = 32 + progress * 22;
        this.effects
          .lineStyle(3, 0xffe7a2, 1 - progress)
          .strokeRect(burst.x * CELL + 16 - size / 2, burst.y * CELL + 16 - size / 2, size, size);
      }
      if (route.length > 1) {
        const pos = (time / 450) % (route.length - 1),
          i = Math.floor(pos),
          f = pos - i;
        const a = route[i],
          b = route[i + 1];
        const x = (a.x + (b.x - a.x) * f) * CELL + 14;
        const y = (a.y + (b.y - a.y) * f) * CELL + 14;
        this.rect(g, 0x354f48, x, y + 2, 5, 5);
        this.rect(g, 0xe8cf95, x + 1, y, 3, 3);
      }
      if (getWeather(current) === 'rain') {
        for (let i = 0; i < 32; i++) {
          const x = ((noise(i, 5) % WIDTH) + Math.floor(time / 60)) % WIDTH;
          const y = ((noise(i, 12) % HEIGHT) + Math.floor(time / 19)) % HEIGHT;
          this.rect(g, 0xd9e8d9, x, y, 1, 5, 0.28);
        }
      }
    }
  }

  const scene = new VillageScene();
  function changeZoom(direction: number) {
    if (!ready) return;
    const camera = scene.cameras.main;
    const center = camera.getWorldPoint(WIDTH / 2, HEIGHT / 2);
    camera.setZoom(Phaser.Math.Clamp(camera.zoom + direction * 0.25, 1, 2.5));
    camera.centerOn(center.x, center.y);
  }
  const game = new Phaser.Game({
    // The map is entirely 2D. Canvas avoids GPU readback stalls on modest laptops.
    type: Phaser.CANVAS,
    parent,
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#8faa68',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: WIDTH,
      height: HEIGHT,
    },
    scene: [scene],
    banner: false,
    audio: { noAudio: true },
    fps: { target: 30, forceSetTimeOut: true },
    render: { pixelArt: true, roundPixels: true, antialias: false },
  });
  const resizeObserver = new ResizeObserver(() => {
    if (!destroyed && parent.clientWidth > 0 && parent.clientHeight > 0) {
      game.scale.setParentSize(parent.clientWidth, parent.clientHeight).refresh();
    }
  });
  resizeObserver.observe(parent);
  return {
    update(
      state: GameState,
      nextRoute: Point[] = [],
      nextSelected: Point | null = null,
      nextPreview: Preview | null = null,
      nextGuide: Point | null = null,
    ) {
      if (destroyed) return;
      current = state;
      route = nextRoute;
      selected = nextSelected;
      preview = nextPreview;
      guide = nextGuide;
      if (ready) scene.redraw();
    },
    animateBuild(point: Point) {
      if (ready && !reducedMotion.matches) bursts.push({ ...point, time: game.loop.time });
    },
    zoom: changeZoom,
    resetView() {
      if (ready) {
        scene.cameras.main.setZoom(1);
        scene.cameras.main.centerOn(WIDTH / 2, HEIGHT / 2);
      }
    },
    reveal(point: Point) {
      if (ready && scene.cameras.main.zoom > 1)
        scene.cameras.main.centerOn(point.x * CELL + 16, point.y * CELL + 16);
    },
    destroy() {
      destroyed = true;
      resizeObserver.disconnect();
      game.destroy(true);
    },
  };
}
