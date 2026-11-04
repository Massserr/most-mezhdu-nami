import { ACTION_LABELS, BUILDINGS, type Action } from '../core/index.ts';
import { bridgeMark, hudIcon, icon } from './uiArt.ts';

export const createLayout = (volume: number) => `
<div id="play-screen" inert>
  <header class="topbar">
    <button id="brand" class="brand" title="Главное меню"><span class="brand-mark">${bridgeMark}</span><span>Мост между нами</span></button>
    <div class="stats" id="stats"></div>
    <div class="top-actions">
      <span id="save-status" role="status"></span>
      <button id="sound" class="quiet" title="Звук" aria-label="Включить звук"></button>
      <button id="help" class="quiet" title="Правила" aria-label="Правила">?</button>
      <button id="menu-button" class="quiet" title="Меню" aria-label="Главное меню">Ⅱ</button>
      <label class="volume hidden">Громкость<input id="volume" aria-label="Громкость звуков" type="range" min="0" max="100" step="5" value="${volume * 100}"></label>
    </div>
  </header>
  <main class="layout">
    <section class="world" aria-label="Карта и строительство">
      <div class="map-header"><span>Берёзовка</span><span id="weather"></span></div>
      <div class="map-frame"><div id="map"></div><div class="map-controls"><button id="zoom-out" aria-label="Отдалить карту">−</button><button id="zoom-reset" title="Показать всю карту">${hudIcon('map')}</button><button id="zoom-in" aria-label="Приблизить карту">+</button></div><div class="map-caption"><span id="hover-note"></span></div></div>
      <div class="build-heading"><span>Стройка</span><button id="undo" class="text-button" title="Отменить работу · Ctrl Z">↶ Отменить</button></div>
      <div class="tools" id="tools">${(['dirt', 'asphalt', 'bridge', 'repair', 'reinforce'] as Action[]).map((a, i) => `<button class="tool" data-tool="${a}" title="${ACTION_LABELS[a]} · клавиша ${i + 1}">${icon(a)}<span>${['Грунт', 'Асфальт', 'Мост', 'Ремонт', 'Защита'][i]}<small>${['18', '24 / 34', '140 / 220', '16 / 58', '52'][i]} <i class="coin-dot" aria-label="единиц бюджета"></i></small></span><kbd>${i + 1}</kbd></button>`).join('')}</div>
      <div id="selection" class="selection" aria-live="polite"></div>
    </section>
    <aside class="sidebar">
      <div class="chapter"><div class="day-badge">${hudIcon('calendar')}<span id="day-number"></span></div><h1 id="day-title"></h1><div class="week" id="week" aria-label="Ход недели"></div></div>
      <div class="side-tabs" role="tablist" aria-label="Панель игры"><button id="tab-today" role="tab" aria-selected="true" aria-controls="today-panel">Задание</button><button id="tab-people" role="tab" aria-selected="false" aria-controls="people-panel">Жители</button><button id="tab-routes" role="tab" aria-selected="false" aria-controls="routes-panel">Пути</button></div>
      <div class="side-scroll">
        <div id="today-panel" role="tabpanel" aria-labelledby="tab-today">
          <section id="goal" class="goal"></section>
          <div id="tutorial" class="tutorial"></div>
          <details class="forecast"><summary>Завтра</summary><p id="forecast"></p></details>
          <details class="journal"><summary>Задания недели <span id="task-count"></span></summary><div id="journal"></div></details>
        </div>
        <div id="people-panel" class="hidden" role="tabpanel" aria-labelledby="tab-people"><div id="people-list" class="people-list"></div><div id="resident-story"></div></div>
        <div id="routes-panel" class="hidden" role="tabpanel" aria-labelledby="tab-routes">
          <section class="route-panel"><label for="home">Откуда</label><select id="home">${BUILDINGS.filter(
            (b) => b.kind === 'home',
          )
            .map((b) => `<option value="${b.id}">${b.name}</option>`)
            .join(
              '',
            )}</select><div class="section-label">Куда</div><div class="service-tabs" id="services">${BUILDINGS.filter(
            (b) => b.kind !== 'home',
          )
            .map(
              (b) =>
                `<button data-service="${b.id}" title="${b.name}">${{ school: 'Школа', clinic: 'Медпункт', fire: 'Пожарная', work: 'Мастерская', home: '' }[b.kind]}</button>`,
            )
            .join(
              '',
            )}</div><div id="route-info"></div><details class="route-detail"><summary>Почему такой путь?</summary><p id="route-explanation"></p><p id="advisor"></p></details></section>
        </div>
      </div>
      <button id="end-day" class="primary end-day">Завершить день <span>▶</span></button>
    </aside>
  </main>
</div>
<div id="menu" class="menu-overlay" role="dialog" aria-modal="true" aria-labelledby="menu-title">
  <div class="menu-landscape" aria-hidden="true"></div>
  <div class="menu-card">
    <div class="title-sign"><span class="title-bridge" aria-hidden="true">${bridgeMark}</span><h1 id="menu-title">Мост<br><span>между нами</span></h1></div>
    <div class="menu-buttons"><button id="continue" class="primary hidden">${hudIcon('play')}<span>Продолжить</span></button><button id="new-game" class="primary">${hudIcon('new')}<span>Новая игра</span></button></div>
    <div class="menu-links"><button id="menu-help" class="secondary">Правила</button><button id="about" class="secondary">Об игре</button></div>
    <p id="save-hint" class="save-hint"></p>
  </div>
</div>
<dialog id="dialog"><div id="dialog-content"></div></dialog><div id="toast" role="status"></div>`;
