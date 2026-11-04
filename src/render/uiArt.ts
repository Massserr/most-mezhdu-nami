import type { Action } from '../core/index.ts';

// All interface art uses the same square pixel grid as the village.
const tools: Record<Action, string> = {
  dirt: '<path d="M15 1h8v6h-3v3h-3v4h-3v4H9v4H3v-2H1v-6h4v-3h4v-3h3V4h3z" fill="#513b32"/><path d="M16 3h5v3h-5z" fill="#c48a4b"/><path d="M14 7h3v5h-3v3h-3v3H8v-3h3v-3h3z" fill="#d8a05e"/><path d="M3 15h5v3h3v2H5v-2H3z" fill="#93b5bc"/><path d="M3 15h3v2H3z" fill="#e8ebd0"/><path d="M12 20h10v3H10v-2h2z" fill="#9d6236"/>',
  asphalt:
    '<path d="M5 1h14v4h1v6h1v6h2v6H1v-6h2v-6h1V5h1z" fill="#394858"/><path d="M7 2h2v4H8v6H7v6H6v5H3v-5h2v-6h1V6h1zm9 0h2v4h1v6h1v6h1v5h-3v-5h-1v-6h-1V6h-1z" fill="#8b9b9c"/><path d="M11 3h2v4h-2zm0 7h2v4h-2zm0 8h2v5h-2z" fill="#f7d879"/>',
  bridge:
    '<path d="M1 19h22v4H1z" fill="#3289b0"/><path d="M1 21h8v1H1zm12 0h10v1H13z" fill="#8ce0db"/><path d="M1 4h4v17H1zm18 0h4v17h-4zM4 10h16v8H4z" fill="#6c412c"/><path d="M2 3h3v6H2zm18 0h3v6h-3zM5 11h3v5H5zm4 0h3v5H9zm4 0h3v5h-3zm4 0h3v5h-3z" fill="#d29a50"/><path d="M4 7h16v3H4z" fill="#e7b96f"/>',
  repair:
    '<path d="M14 1h7v3h-5v4h4V4h3v7h-3v3h-6L7 22H2v-5l9-8V4h3z" fill="#3d4854"/><path d="M14 3h5v1h-4v6h6v1h-3v2h-5v-3h-1V5h2z" fill="#adced1"/><path d="M11 13h3l-8 8H3v-3z" fill="#d4513d"/><path d="m5 17 5-5h2l-6 7H4v-2z" fill="#f18e58"/>',
  reinforce:
    '<path d="M3 3h6V1h6v2h6v12h-2v4h-3v3h-3v2h-2v-2H8v-3H5v-4H3z" fill="#374a63"/><path d="M5 5h5V3h4v2h5v10h-2v3h-3v3h-3v-3H8v-3H5z" fill="#6297ba"/><path d="M6 5h4V4h4v2H8v8H6z" fill="#b9d9d6"/><path d="M8 10h3v4h2v-3h2V8h3v5h-2v3h-2v3h-4v-3H8z" fill="#304f38"/><path d="M8 10h2v3h3v-3h2V8h2v4h-2v3h-2v2h-2v-2H8z" fill="#c2e27a"/>',
};

export const icon = (action: Action) =>
  `<svg viewBox="0 0 24 24" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${tools[action]}</svg>`;

const hud = {
  coin: '<path d="M6 2h12v3h3v14h-3v3H6v-3H3V5h3z" fill="#83502a"/><path d="M7 2h10v3h3v12h-3v3H7v-3H4V5h3z" fill="#edb63e"/><path d="M7 4h9v2H8v10H6V6h1z" fill="#fff0a2"/><path d="M11 7h5v2h-3v6h3v2h-6V7z" fill="#b77527"/>',
  routes:
    '<path d="M2 3h7v7H2zm13 11h7v8h-7z" fill="#f8d9a0"/><path d="M1 3h9V1H4v1H1zm13 11h9v-2h-3v-2h-3v2h-3z" fill="#c4533d"/><path d="M5 8h3v3h3v3h6v3h-3v-1H8v-3H5z" fill="#48566b"/><path d="M6 9h1v3h2v1h7v2H9v-1H6z" fill="#f5d471"/>',
  heart:
    '<path d="M2 5h3V2h5v3h4V2h5v3h3v9h-3v3h-3v3h-3v3h-3v-3H7v-3H4v-3H2z" fill="#843f3c"/><path d="M4 5h5v3h6V5h4v3h2v5h-3v3h-3v3h-3v2h-1v-3H8v-3H5v-3H4z" fill="#d96652"/><path d="M5 6h3v3H5zM4 9h2v3H4z" fill="#ffa779"/>',
  calendar:
    '<path d="M2 4h20v19H2z" fill="#704631"/><path d="M4 7h16v13H4z" fill="#ffe7ac"/><path d="M3 3h18v5H3z" fill="#bd4f3b"/><path d="M6 1h3v5H6zm9 0h3v5h-3z" fill="#a6c0c1"/><path d="M7 11h3v3H7zm6 0h3v3h-3zm-6 5h3v3H7zm6 0h3v3h-3z" fill="#9a7949"/>',
  map: '<path d="M1 3h7V1h8v2h7v19h-7v2H8v-2H1z" fill="#6d4c31"/><path d="M3 5h5V3h8v2h5v15h-5v2H8v-2H3z" fill="#e9c78b"/><path d="M12 3h3v5h-3v5h3v5h-3v4H9v-5h3v-3H9V7h3z" fill="#459dbb"/><path d="M4 7h3v3H4zm13 8h3v3h-3z" fill="#769b48"/>',
  play: '<path d="M5 2h4v3h4v3h4v3h4v3h-4v3h-4v3H9v3H5z" fill="#2e573e"/><path d="M7 4h2v3h4v3h4v4h-4v3H9v3H7z" fill="#bde884"/>',
  new: '<path d="M3 2h15v3h4v18H3z" fill="#744b33"/><path d="M5 4h11v4h4v13H5z" fill="#ffdf9b"/><path d="M10 8h4v4h4v4h-4v4h-4v-4H6v-4h4z" fill="#5c9858"/>',
  sun: '<path d="M10 1h4v4h-4zm0 18h4v4h-4zM1 10h4v4H1zm18 0h4v4h-4zM4 4h3v3H4zm13 13h3v3h-3zM4 17h3v3H4zm13-13h3v3h-3z" fill="#efb238"/><path d="M8 6h8v2h2v8h-2v2H8v-2H6V8h2z" fill="#ffe285"/>',
  rain: '<path d="M4 7h3V3h9v3h4v3h3v7H1V9h3z" fill="#5e87ab"/><path d="M4 9h5V5h6v3h4v3h2v3H3v-3h1z" fill="#adcdd5"/><path d="M5 18h2v5H4v-3h1zm7 0h2v5h-3v-3h1zm7 0h2v5h-3v-3h1z" fill="#6ebcf0"/>',
} as const;

export const hudIcon = (kind: keyof typeof hud) =>
  `<svg class="hud-icon" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true">${hud[kind]}</svg>`;

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
