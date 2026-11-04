import type { Action } from '../core/index.ts';

// All interface art uses the same square pixel grid as the village.
const tools: Record<Action, string> = {
  dirt: '<path d="M5 2h3v5H7v10H6v5H3v-5h1V7h1zm11 0h3v5h1v10h1v5h-3v-5h-1V7h-1zM11 4h2v3h-2zm0 6h2v3h-2zm0 6h2v3h-2z"/>',
  asphalt:
    '<path d="M5 2h14v5h1v10h1v5H3v-5h1V7h1z"/><path d="M11 3h2v4h-2zm0 7h2v4h-2zm0 7h2v4h-2z" fill="var(--paper, #f1e7c7)"/>',
  bridge:
    '<path d="M2 5h3v4h3v2h8V9h3V5h3v14h-3v-4h-3v4h-2v-4h-4v4H8v-4H5v4H2zm3 6v2h14v-2h-3v2H8v-2zM1 21h7v2H1zm9 0h6v2h-6zm8 0h5v2h-5z"/>',
  repair: '<path d="M15 2h5v3h-4v4h4V5h3v6h-3v3h-6L6 22H2v-4l9-9V5h4zM4 18v2h2v-2z"/>',
  reinforce:
    '<path d="M4 3h5V1h6v2h5v12h-2v3h-3v3h-2v2h-2v-2H9v-3H6v-3H4z"/><path d="M7 10h3v3h2v-3h2V7h3v5h-2v3h-2v3h-3v-3H7z" fill="var(--paper, #f1e7c7)"/>',
};

export const icon = (action: Action) =>
  `<svg viewBox="0 0 24 24" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${tools[action]}</svg>`;

export const bridgeMark = `<svg viewBox="0 0 32 32" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 7h4v8h3v-3h3v-2h6v2h3v3h3V7h4v18h-4v-5H7v5H3zm10 8h6v-2h-6zM2 27h8v2H2zm12 0h6v2h-6zm10 0h6v2h-6z"/></svg>`;

export const portrait = (id: string, color: string) => {
  const rect = (x: number, y: number, w: number, h: number, fill: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
  const boy = id === 'misha',
    granny = id === 'anna',
    librarian = id === 'nina';
  const hair = granny ? '#c5c5b0' : librarian ? '#67544b' : boy ? '#7a4e32' : '#493e33';
  const shirt = boy ? '#d7ad56' : granny ? '#8c6870' : librarian ? '#687e69' : '#6c9293';
  const skin = '#e4b98c',
    shade = '#c58d68',
    ink = '#354039';
  let art = rect(0, 0, 32, 32, color) + rect(2, 2, 28, 28, '#e5d8b1');
  art += rect(3, 23, 26, 7, '#d1c59f') + rect(7, 26, 18, 6, shirt) + rect(5, 29, 22, 3, shirt);
  art += rect(13, 22, 6, 5, shade) + rect(10, 7, 12, 17, hair);
  art += rect(8, 11, 16, 8, shade) + rect(10, 10, 12, 12, skin) + rect(12, 22, 8, 2, skin);
  art += rect(9, 7, 14, 6, hair) + rect(12, 5, 9, 3, hair);
  if (boy) {
    art += rect(9, 10, 5, 5, hair) + rect(18, 10, 4, 3, hair) + rect(11, 7, 6, 2, '#9b6942');
    art += rect(12, 27, 8, 2, '#f2d898') + rect(15, 29, 2, 3, '#967341');
  } else if (granny) {
    art += rect(7, 5, 6, 6, hair) + rect(9, 10, 3, 7, hair) + rect(20, 10, 3, 5, hair);
    art += rect(9, 27, 3, 5, '#d5b997') + rect(20, 27, 3, 5, '#d5b997');
  } else if (librarian) {
    art += rect(8, 10, 4, 14, hair) + rect(21, 10, 3, 15, hair) + rect(11, 8, 6, 4, '#88705a');
    art += rect(12, 27, 3, 3, '#e7d8b5') + rect(17, 27, 3, 3, '#e7d8b5');
  } else {
    art += rect(10, 20, 3, 3, hair) + rect(19, 20, 3, 3, hair) + rect(12, 23, 8, 2, hair);
    art += rect(10, 27, 3, 5, '#bda476') + rect(19, 27, 3, 5, '#bda476');
  }
  art += rect(12, 16, 2, 2, ink) + rect(19, 16, 2, 2, ink) + rect(16, 18, 2, 2, shade);
  art += rect(14, 21, 4, 1, '#a26551');
  if (granny || librarian)
    art += `<path d="M10 15h6v5h-6zm7 0h6v5h-6zm-1 1h1" fill="none" stroke="${ink}" stroke-width="1"/>`;
  return `<svg class="portrait" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">${art}</svg>`;
};
