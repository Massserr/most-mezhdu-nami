import './style.css';
import {
  ACTION_LABELS,
  BUILDINGS,
  COSTS,
  DAYS,
  INITIAL_BUDGET,
  LEGACY_SAVE_KEY,
  SAVE_KEY,
  TASKS,
  activeBridges,
  applyAction,
  createGame,
  deserialize,
  endDay,
  explainRoute,
  getAdvisor,
  getEnding,
  getMetrics,
  getResidentViews,
  getRoute,
  getScore,
  getTasks,
  getTile,
  getWeather,
  previewAction,
  serialize,
  undo,
} from './core/index.ts';
import type { Action, GameState, Point } from './core/index.ts';
import { createMap } from './render/MapView.ts';
import { playCue, setVolume } from './audio.ts';
import { bridgeMark, icon, portrait } from './render/uiArt.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
let state = createGame(),
  playing = false,
  mode: Action | null = null;
let selected: Point | null = null,
  home = 'home-east-north',
  service = 'clinic';
let storageWarning = '',
  saveHint = '',
  panel: 'today' | 'people' = 'today',
  residentId = 'misha';
let toastTimer: ReturnType<typeof setTimeout>;
let buildFeedback = '';
let volume = 0;
try {
  volume = Math.min(1, Math.max(0, Number(localStorage.getItem('berezovka-volume')) || 0));
} catch {}
setVolume(volume);

$('app').innerHTML = `
<div id="play-screen" inert>
  <header class="topbar">
    <button id="brand" class="brand" title="Открыть главное меню"><span class="brand-mark">${bridgeMark}</span><span>Мост между нами<small>Берёзовка · дороги, которые нас связывают</small></span></button>
    <div class="top-actions"><span id="save-status" role="status"></span><button id="sound" class="quiet" aria-label="Включить звук"></button><label class="volume" title="Громкость звуков">Громкость<input id="volume" aria-label="Громкость звуков" type="range" min="0" max="100" step="5" value="${volume * 100}"></label><button id="help" class="quiet">Правила</button><button id="menu-button" class="quiet">Меню</button></div>
  </header>
  <main class="layout">
    <section class="world" aria-label="Карта и строительство">
      <div class="stats" id="stats"></div>
      <div class="map-header"><span>ПЛАН БЕРЁЗОВКИ <i> / река Сосновка</i></span><span id="weather"></span></div>
      <div class="map-frame"><div id="map"></div><div class="map-controls"><button id="zoom-out" title="Отдалить карту" aria-label="Отдалить карту">−</button><button id="zoom-reset" title="Показать всю карту">Вся карта</button><button id="zoom-in" title="Приблизить карту" aria-label="Приблизить карту">+</button></div></div>
      <div class="map-caption"><span id="hover-note">Светлая метка — вход · красный участок — нужен ремонт</span><span>Стрелки · выбор клетки / Enter · действие</span></div>
      <div class="build-heading"><span>Строительство</span><button id="undo" class="text-button">↶ Отменить <kbd>Ctrl Z</kbd></button></div>
      <div class="tools" id="tools">${(Object.keys(ACTION_LABELS) as Action[]).map((a, i) => `<button class="tool" data-tool="${a}" title="${ACTION_LABELS[a]} · клавиша ${i + 1}">${icon(a)}<span>${['Грунт', 'Асфальт', 'Мост', 'Ремонт', 'Укрепить'][i]}<small>${['18', '24 / 34', '140 / 220', '16 / 58', '52'][i]} ед.</small></span><kbd>${i + 1}</kbd></button>`).join('')}</div>
      <div id="selection" class="selection" aria-live="polite"></div>
    </section>
    <aside class="sidebar">
      <div class="chapter"><span id="day-number" class="eyebrow"></span><h1 id="day-title"></h1><p id="day-subtitle"></p><div class="week" id="week"></div></div>
      <div class="side-tabs" role="tablist" aria-label="Сведения о поселении"><button id="tab-today" role="tab" aria-selected="true" aria-controls="today-panel">Сегодня</button><button id="tab-people" role="tab" aria-selected="false" aria-controls="people-panel">Жители</button></div>
      <div class="side-scroll">
        <div id="today-panel" role="tabpanel" aria-labelledby="tab-today"><div id="tutorial" class="tutorial"></div><p id="day-story" class="day-story"></p><section id="goal" class="goal"></section><details class="forecast"><summary>Что будет завтра</summary><p id="forecast"></p></details><details class="journal"><summary>Дневник недели <span id="task-count"></span></summary><div id="journal"></div></details></div>
        <div id="people-panel" class="hidden" role="tabpanel" aria-labelledby="tab-people"><div id="people-list" class="people-list"></div><div id="resident-story"></div></div>
        <section class="route-panel"><div class="section-label">Проверить путь</div><label for="home">Жилой квартал</label><select id="home">${BUILDINGS.filter(
          (b) => b.kind === 'home',
        )
          .map((b) => `<option value="${b.id}">${b.name}</option>`)
          .join('')}</select><div class="service-tabs" id="services">${BUILDINGS.filter(
          (b) => b.kind !== 'home',
        )
          .map(
            (b) =>
              `<button data-service="${b.id}" title="${b.name}">${{ school: 'Школа', clinic: 'Медпункт', fire: 'Пожарная', work: 'Мастерская', home: '' }[b.kind]}</button>`,
          )
          .join(
            '',
          )}</div><div id="route-info"></div><p id="route-explanation" class="route-explanation"></p></section>
        <details class="advisor" open><summary>Совет дорожного инженера</summary><p id="advisor"></p></details>
      </div>
      <button id="end-day" class="primary end-day">Завершить день <span>→</span></button><p class="autosave">Автосохранение после каждого решения</p>
    </aside>
  </main>
</div>
<div id="menu" class="menu-overlay" role="dialog" aria-modal="true" aria-labelledby="menu-title">
  <div class="menu-landscape" aria-hidden="true"><span class="menu-location">БЕРЁЗОВКА<br><small>на реке Сосновке</small></span><div class="menu-note">Два берега.<br>Одна деревня.</div><span class="landscape-caption">ЛЕТО · НАЧАЛО НОВОЙ НЕДЕЛИ</span></div>
  <div class="menu-card"><div class="edition">НЕБОЛЬШАЯ СТРАТЕГИЯ О БОЛЬШОМ ОБЩЕМ ДЕЛЕ</div><span class="menu-symbol">${bridgeMark}</span><h1 id="menu-title">Мост<br>между нами</h1><p class="menu-lead">До школы, до дома,<br>друг до друга.</p><p class="menu-description">Река делит Берёзовку надвое. У вас семь дней, общий бюджет и соседи, которым нужна дорога. Каким будет их путь — решать вам.</p><div class="menu-feature-list"><span>7 дней</span><span>2 берега</span><span>4 истории</span></div><button id="new-game" class="primary">Начать неделю <span>→</span></button><button id="continue" class="secondary hidden">Продолжить неделю</button><div class="menu-links"><button id="menu-help" class="text-button">Как играть</button><button id="about" class="text-button">Об игре</button></div><p id="save-hint" class="save-hint"></p><div class="menu-foot">У каждой дороги — своя история.<small>Мост между нами · Берёзовка</small></div></div>
</div>
<dialog id="dialog"><div id="dialog-content"></div></dialog><div id="toast" role="status"></div>`;

const map = createMap($('map'), {
  onCell: selectCell,
  onHover: (x, y) => {
    if (!playing) return;
    const tile = getTile(state, x, y),
      building = BUILDINGS.find((b) => b.x === x && b.y === y);
    $('hover-note').textContent =
      `${x + 1}:${y + 1} · ${building?.name ?? (tile?.damaged ? 'нужен ремонт' : tile?.reinforced ? 'мост защищён от паводка' : tile?.road ? { dirt: 'грунт', asphalt: 'асфальт', bridge: 'деревянный мост' }[tile.road] : tile?.bridgeSite ? 'створ моста' : tile?.terrain === 'water' ? 'река' : tile?.terrain === 'obstacle' ? 'охраняемая зелёная зона' : 'можно проложить дорогу')}`;
  },
});

function readSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY);
    const result = raw ? deserialize(raw) : null;
    saveHint =
      raw && !result
        ? 'Сохранение повреждено или создано неизвестной версией. Начните новую историю.'
        : '';
    return result;
  } catch {
    saveHint = 'Хранилище браузера недоступно. Играть можно, но прогресс не сохранится.';
    return null;
  }
}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, serialize(state));
    storageWarning = '';
  } catch {
    storageWarning = 'Сохранение недоступно. Не закрывайте игру до конца недели.';
  }
}
function toast(message: string) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('show');
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4000);
}
function modal(content: string) {
  $('dialog-content').innerHTML = content;
  if (!$<HTMLDialogElement>('dialog').open) $<HTMLDialogElement>('dialog').showModal();
}
const closeDialog = () => $<HTMLDialogElement>('dialog').close();
function showMenu() {
  playing = false;
  document.body.classList.add('menu-open');
  $('play-screen').inert = true;
  $('menu').classList.remove('hidden');
  $('continue').classList.toggle('hidden', !readSave());
  $('save-hint').textContent = saveHint;
  render();
  (readSave() ? $('continue') : $('new-game')).focus();
}
function begin(next: GameState) {
  buildFeedback = '';
  document.body.classList.remove('menu-open');
  state = next;
  playing = true;
  mode = null;
  selected = null;
  panel = 'today';
  $('menu').classList.add('hidden');
  $('play-screen').inert = false;
  home = 'home-east-north';
  service = state.day === 1 ? 'clinic' : 'school';
  const notice = state.migrationNotice;
  delete state.migrationNotice;
  save();
  render();
  $('map').querySelector('canvas')?.focus();
  if (state.finished) finalScreen();
  else if (notice)
    modal(
      `<span class="eyebrow">Продолжить историю</span><h2>Берёзовка обновилась</h2><p>${esc(notice)}</p><button class="primary" data-close>К карте</button>`,
    );
}
function selectCell(x: number, y: number) {
  if (!playing) return;
  buildFeedback = '';
  selected = { x, y };
  const building = BUILDINGS.find((b) => b.x === x && b.y === y);
  if (building && !mode) {
    if (building.kind === 'home') home = building.id;
    else service = building.id;
  }
  if (mode && state.tutorialStep === 1) state.tutorialStep = 2;
  render();
}
function chooseTool(action: Action) {
  if (!playing || state.finished) return;
  buildFeedback = '';
  mode = mode === action ? null : action;
  if (mode && state.tutorialStep === 0) state.tutorialStep = 1;
  render();
}
function build() {
  if (!playing || state.finished || !mode || !selected) return;
  const result = applyAction(state, mode, selected.x, selected.y);
  buildFeedback = result.ok ? result.message : '';
  toast(result.message);
  if (result.ok) {
    state.tutorialStep = Math.max(state.tutorialStep, 3);
    playCue('build');
    map.animateBuild(selected);
    save();
  } else playCue('error');
  render();
}

function render() {
  const m = getMetrics(state),
    day = DAYS[state.day - 1],
    tasks = getTasks(state);
  const goal = tasks.find((t) => t.startDay === state.day)!;
  const route = getRoute(state, home, service);
  $('day-number').textContent = `ДЕНЬ ${String(state.day).padStart(2, '0')} / 07`;
  $('day-title').textContent = day.title;
  $('day-subtitle').textContent = day.subtitle;
  $('week').innerHTML = DAYS.map(
    (d, i) =>
      `<span title="День ${i + 1}: ${d.title}" class="${i + 1 === state.day ? 'current' : i + 1 < state.day ? 'past' : ''}">${i + 1}</span>`,
  ).join('');
  $('stats').innerHTML =
    `<div class="stat budget"><span>Бюджет деревни</span><strong>${state.budget}<small> / ${INITIAL_BUDGET}</small></strong></div><div class="stat" title="Доля кварталов, связанных с каждым открытым учреждением"><span>Доступные пути</span><strong>${m.connected}<small> / ${m.total}</small></strong></div><div class="stat" title="Среднее по существующим маршрутам; недоступные пары видны в соседнем показателе"><span>Средний путь</span><strong>${m.averageTime?.toFixed(1) ?? '—'}<small> усл. ед.</small></strong></div><div class="stat" title="55% доступность + 30% скорость + 15% выполненные обещания"><span>Благополучие</span><strong>${m.wellbeing}<small> / 100</small></strong></div>`;
  $('weather').textContent =
    `${getWeather(state) === 'rain' ? '☂ Дождь · грунт медленнее' : '☀ Ясно'} · мостов ${activeBridges(state)}`;
  $('day-story').textContent = day.story;
  $('forecast').textContent = day.forecast;
  $('goal').className = `goal ${goal.status}`;
  $('goal').innerHTML =
    `<div class="section-label">${goal.status === 'ready' ? '✓ Можно завершать день' : goal.status === 'completed' ? '✓ Обещание выполнено' : goal.status === 'failed' ? 'Срок пропущен' : 'Обещание на сегодня'}</div><h2>${goal.title}</h2><p>${goal.description}</p><div class="goal-progress">${esc(goal.progress)}</div><button id="focus-goal" class="text-button">Показать нужный маршрут →</button>`;
  $('task-count').textContent = `${state.completedTasks.length} / 7`;
  $('journal').innerHTML = tasks
    .map(
      (t) =>
        `<article class="journal-task ${t.status}"><span>${t.status === 'completed' ? '✓' : t.status === 'failed' ? '!' : t.startDay}</span><div><b>${t.title}</b><small>${t.progress}</small></div></article>`,
    )
    .join('');
  $('tab-today').setAttribute('aria-selected', String(panel === 'today'));
  $('tab-people').setAttribute('aria-selected', String(panel === 'people'));
  $('today-panel').classList.toggle('hidden', panel !== 'today');
  $('people-panel').classList.toggle('hidden', panel !== 'people');
  const residents = getResidentViews(state),
    person = residents.find((p) => p.id === residentId)!;
  $('people-list').innerHTML = residents
    .map(
      (p) =>
        `<button class="person-tab ${p.id === residentId ? 'active' : ''}" data-person="${p.id}" title="${p.name} · ${p.statusText}">${portrait(p.id, p.color)}<span>${p.name.split(' ')[0]}</span></button>`,
    )
    .join('');
  $('resident-story').innerHTML =
    `<div class="resident-heading">${portrait(person.id, person.color)}<div><h2>${person.name}</h2><span>${person.role}</span></div></div><p class="resident-quote">«${person.quote}»</p><div class="resident-status ${person.status}">${person.statusText}${person.time !== null ? ` · ${person.time.toFixed(1)} усл. ед.` : ''}</div><button class="text-button" id="resident-route">Показать путь ${person.name === 'Анна Петровна' ? 'Анны Петровны' : person.name === 'Миша' ? 'Миши' : person.name === 'Илья' ? 'Ильи' : 'Нины Михайловны'} →</button>`;
  $<HTMLSelectElement>('home').value = home;
  $('services')
    .querySelectorAll<HTMLButtonElement>('[data-service]')
    .forEach((b) => {
      b.classList.toggle('active', b.dataset.service === service);
      b.disabled =
        Number(BUILDINGS.find((x) => x.id === b.dataset.service)?.opensDay ?? 1) > state.day;
    });
  $('route-info').innerHTML =
    `<b>${route.time === null ? 'Пока нет проезда' : `${route.time.toFixed(1)} <small>усл. ед. времени</small>`}</b><span>${route.path.length ? `${route.path.length - 1} клеток пути` : ''}</span>`;
  $('route-explanation').textContent = explainRoute(state, home, service);
  $('advisor').textContent = getAdvisor(state);
  $('save-status').textContent = storageWarning || 'Сохранено';
  $('save-status').classList.toggle('warning', !!storageWarning);
  $<HTMLButtonElement>('undo').disabled = !playing || !state.history.length || state.finished;
  $<HTMLButtonElement>('end-day').disabled = !playing || state.finished;
  $('end-day').innerHTML = state.finished
    ? 'Неделя завершена'
    : `${state.day === 7 ? 'Подвести итог' : 'Завершить день'} <span>→</span>`;
  $('tools')
    .querySelectorAll<HTMLButtonElement>('[data-tool]')
    .forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === mode);
      b.disabled = !playing || state.finished;
    });
  const preview = selected && mode ? previewAction(state, mode, selected.x, selected.y) : null;
  if (preview && mode && selected && buildFeedback) {
    $('selection').className = 'selection valid';
    $('selection').innerHTML =
      `<div><b class="positive">✓ Работа выполнена · ${selected.x + 1}:${selected.y + 1}</b><p>${esc(buildFeedback)} Выберите следующий участок или отмените действие.</p></div>`;
  } else if (preview && mode && selected) {
    const delta = preview.metrics ? preview.metrics.connected - m.connected : 0;
    const timeGain =
      preview.metrics?.averageTime !== null &&
      preview.metrics?.averageTime !== undefined &&
      m.averageTime !== null
        ? m.averageTime - preview.metrics.averageTime
        : 0;
    $('selection').className = `selection ${preview.valid ? 'valid' : 'invalid'}`;
    $('selection').innerHTML =
      `<div><b>${ACTION_LABELS[mode]} · ${selected.x + 1}:${selected.y + 1}</b><p>${esc(preview.reason)}${preview.valid ? ` · ${delta > 0 ? `+${delta} доступных путей` : timeGain > 0.01 ? `среднее время −${timeGain.toFixed(1)}` : 'Связность и время пока не изменятся'}` : ''}</p>${preview.tasksReady.length ? `<small class="positive">Станет готово: ${preview.tasksReady.map(esc).join(', ')}</small>` : ''}</div><button id="build" class="primary compact" ${preview.valid ? '' : 'disabled'}>${preview.valid ? `${mode === 'reinforce' ? 'Укрепить' : mode === 'repair' ? 'Починить' : 'Строить'} · ${preview.cost}` : 'Недоступно'}</button>`;
  } else {
    const building = selected
      ? BUILDINGS.find((b) => b.x === selected!.x && b.y === selected!.y)
      : null;
    $('selection').className = 'selection';
    $('selection').innerHTML =
      `<div><b>${building?.name ?? (mode ? ACTION_LABELS[mode] : 'Выберите инструмент и участок')}</b><p>${building ? `Вход: ${building.entrance.x + 1}:${building.entrance.y + 1}. ${building.residents ? `Жителей: ${building.residents}.` : ''}` : mode ? 'Сначала прогноз и стоимость, затем подтверждение. Деньги списываются только после него.' : 'Клик по дому показывает путь. Клавиши 1–5 выбирают инструмент. Esc снимает выбор.'}</p></div>`;
  }
  const tutorials = [
    '1 / 4 · Выберите «Грунт» или «Асфальт». Нужно вернуть проезд Северной слободе.',
    '2 / 4 · Нажмите на разрыв дороги у Северной слободы: участок 18:4 отмечен золотым.',
    '3 / 4 · Посмотрите стоимость и прогноз. Подтвердите работу кнопкой «Строить».',
    '4 / 4 · Проверьте путь и цель справа. Стройку можно отменить до конца дня. Когда готовы — завершите день.',
  ];
  $('tutorial').classList.toggle('hidden', state.tutorialStep >= 4 || state.finished);
  $('tutorial').innerHTML =
    state.tutorialStep < 4
      ? `<span>${tutorials[state.tutorialStep]}</span><button id="skip-tutorial" class="text-button">Понятно</button>`
      : '';
  map.update(
    state,
    playing ? route.path : [],
    selected,
    preview && selected && !buildFeedback ? { ...selected, valid: preview.valid } : null,
    playing && state.tutorialStep < 3 ? { x: 17, y: 3 } : null,
  );
}

function help() {
  modal(
    `<span class="eyebrow">Памятка руководителя</span><h2>Каждая дорога ведёт к людям</h2><ol class="help-list"><li>Каждый день даётся одно обещание. Его условия и прогресс видны справа. Срок — конец этого дня.</li><li>Выберите инструмент, затем клетку. Сравните стоимость и изменение маршрутов, подтвердите работу.</li><li>Дороги соединяются соседними сторонами. У каждого здания отмечен вход. Для моста доступны три створа.</li><li>Деревянные мосты стоят 140, каменный центральный — 220. Паводок дня 5 повреждает неукреплённые деревянные мосты. Укрепление — 52.</li><li>В дождь (дни 3, 5 и 7) грунт вдвое медленнее. Ремонт не улучшает покрытие. Асфальтирование грунта стоит 24, новый асфальт — 34.</li><li>На всю неделю ${INITIAL_BUDGET} единиц. Отменять можно только сегодняшнюю стройку. Прогноз предупреждает о следующем событии.</li></ol><details><summary>Формулы и условия успеха</summary><p>Маршруты вычисляет алгоритм Дейкстры. Вес грунтовой клетки: 2 в сухую погоду и 4 в дождь; асфальта и моста: 1. Цена перехода — полусумма весов соседних клеток. Это условные единицы, а не реальные минуты.</p><p>A — доля доступных путей; S — среднее max(0, 1 − время / 60), недоступный путь даёт 0. Q — доля выполненных задач. Благополучие: 55A + 30S + 15Q среди открытых задач. Итог: 35A + 20S + 40Q + 5 × бюджет / ${INITIAL_BUDGET}.</p><p>Успех: все 24 маршрута, минимум 5 из 7 обещаний, от 65 баллов. Высший итог: от 85 баллов и все 7 обещаний. Финальная цель отдельно требует два моста и среднее время до 29.</p></details><details><summary>Клавиатура и карта</summary><p>1–5: инструменты. Стрелки при фокусе карты: выбрать клетку. Enter на карте: подтвердить допустимую работу. Esc: снять инструмент. Ctrl/Cmd+Z: отменить работу. Колесо над картой или +/−: масштаб, перетаскивание правой кнопкой: перемещение, «Вся карта»: вернуть обзор.</p></details><button class="primary" data-close>К карте</button>`,
  );
}
function finalScreen() {
  const score = getScore(state),
    m = getMetrics(state);
  modal(
    `<span class="eyebrow">Семь дней, которые останутся с нами</span><h2>${score.label}</h2><div class="final-score">${score.total}<span>/ 100</span></div><div class="result-grid"><div><b>${m.connected}/${m.total}</b><span>доступных путей</span></div><div><b>${state.completedTasks.length}/7</b><span>обещаний</span></div><div><b>${state.budget}</b><span>сохранено из ${INITIAL_BUDGET}</span></div></div><p class="ending-intro">${getEnding(state)[0]}</p><details class="ending-stories" open><summary>Как изменилась жизнь жителей</summary>${getResidentViews(
      state,
    )
      .map(
        (p) =>
          `<div class="ending-person">${portrait(p.id, p.color)}<p><b>${p.name}</b><br>«${esc(p.quote)}»</p></div>`,
      )
      .join(
        '',
      )}</details><p>${getEnding(state).at(-1)}</p><p class="score-breakdown">Баллы: связь ${score.accessibility.toFixed(1)} · скорость ${score.speed.toFixed(1)} · обещания ${score.tasks.toFixed(1)} · экономия ${score.economy.toFixed(1)}.</p><button class="primary" id="again">Начать другую историю <span>→</span></button><button class="secondary" data-close>Посмотреть поселение</button>`,
  );
  playCue(score.success ? 'success' : 'day');
}
function confirmDay() {
  if (!playing || state.finished) return;
  const task = getTasks(state).find((t) => t.deadline === state.day)!;
  modal(
    `<span class="eyebrow">Берёзовка · день ${state.day}</span><h2>${state.day === 7 ? 'Завершить неделю?' : 'Завершить день?'}</h2><p class="${task.status === 'active' ? 'warning' : ''}">${task.status === 'ready' ? 'Сегодняшнее обещание выполнено:' : task.status === 'active' ? 'Цель пока не достигнута:' : ''} <b>${task.title}</b>.</p><p>${task.description} ${esc(task.progress)}</p><p>После перехода сегодняшнюю стройку нельзя отменить.</p><div class="forecast-callout">${DAYS[state.day - 1].forecast}</div><button id="confirm-day" class="primary">${state.day === 7 ? 'Подвести итог' : 'Завершить день'} <span>→</span></button><button class="secondary" data-close>Ещё поработать</button>`,
  );
}
function advanceDay() {
  if (!playing || state.finished) return;
  buildFeedback = '';
  const report = endDay(state);
  mode = null;
  selected = null;
  panel = 'today';
  save();
  render();
  playCue('day');
  if (report.finished) {
    finalScreen();
    return;
  }
  modal(
    `<span class="eyebrow">День ${report.day} завершён</span><h2>${report.completed.length ? 'Обещание стало делом' : 'Есть над чем поработать'}</h2><p>${report.completed.length ? `${report.completed.join(', ')} — выполнено.` : `${report.failed.join(', ')} — срок пропущен. Последующие дни остаются открыты.`}</p><div class="result-grid"><div><b>${Math.round(report.after.accessibility)}%</b><span>доступность · было ${Math.round(report.before.accessibility)}%</span></div><div><b>${report.after.averageTime?.toFixed(1) ?? '—'}</b><span>путь · было ${report.before.averageTime?.toFixed(1) ?? '—'}</span></div></div><div class="next-chapter"><span class="eyebrow">ДЕНЬ ${state.day}</span><h3>${DAYS[state.day - 1].title}</h3>${report.events.map((e) => `<p>${esc(e)}</p>`).join('')}</div><button class="primary" data-close>Начать день ${state.day} <span>→</span></button>`,
  );
}
function focusGoal() {
  const goal = TASKS.find((t) => t.startDay === state.day)!;
  home = goal.homeId;
  service = goal.serviceId;
  mode = null;
  render();
}
function setSound(value: number) {
  volume = value;
  setVolume(value);
  $<HTMLInputElement>('volume').value = String(value * 100);
  $('sound').textContent = value ? '♪ Звук' : '♪ Без звука';
  $('sound').setAttribute('aria-label', value ? 'Отключить звук' : 'Включить звук');
  try {
    localStorage.setItem('berezovka-volume', String(value));
  } catch {}
}

document.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button || button.disabled) return;
  if (button.hasAttribute('data-close')) {
    closeDialog();
    return;
  }
  if (button.dataset.tool) {
    chooseTool(button.dataset.tool as Action);
    return;
  }
  if (button.dataset.service && playing) {
    service = button.dataset.service;
    mode = null;
    render();
    return;
  }
  if (button.dataset.person && playing) {
    residentId = button.dataset.person;
    render();
    return;
  }
  switch (button.id) {
    case 'new-game':
      if (readSave())
        modal(
          '<span class="eyebrow">Новая неделя</span><h2>Начать другую историю?</h2><p>Текущая партия будет заменена. Её можно продолжить из главного меню.</p><button id="confirm-new" class="primary">Начать заново</button><button class="secondary" data-close>Вернуться</button>',
        );
      else begin(createGame());
      break;
    case 'confirm-new':
      closeDialog();
      begin(createGame());
      break;
    case 'continue': {
      const saved = readSave();
      if (saved) begin(saved);
      else toast(saveHint || 'Продолжение недоступно.');
      break;
    }
    case 'again':
      closeDialog();
      begin(createGame());
      break;
    case 'brand':
    case 'menu-button':
      showMenu();
      break;
    case 'help':
    case 'menu-help':
      help();
      break;
    case 'about':
      modal(
        '<span class="eyebrow">Мост между нами · версия 2</span><h2>Одна река. Общее дело.</h2><p>Авторская социальная стратегия о заботе, соседстве и сельской инфраструктуре. Берёзовка и её жители вымышлены.</p><p>У каждого жителя свой маршрут. Дороги, мосты и погода определяют, удастся ли попасть в школу, медпункт или мастерскую. Семь дней — семь обещаний деревне.</p><p>Вся графика и звуки созданы программно для игры. Внешние API, регистрация и интернет для прохождения не нужны. Лицензии Phaser и EventEmitter3 включены в поставку.</p><button class="primary" data-close>Продолжить</button>',
      );
      break;
    case 'build':
      build();
      break;
    case 'undo':
      if (playing && undo(state)) {
        buildFeedback = '';
        save();
        render();
        playCue('undo');
        toast('Работа отменена. Средства возвращены.');
      }
      break;
    case 'end-day':
      confirmDay();
      break;
    case 'confirm-day':
      advanceDay();
      break;
    case 'tab-today':
      panel = 'today';
      render();
      break;
    case 'tab-people':
      panel = 'people';
      render();
      break;
    case 'focus-goal':
      focusGoal();
      break;
    case 'resident-route': {
      const person = getResidentViews(state).find((p) => p.id === residentId)!;
      home = person.home;
      service = person.service;
      mode = null;
      render();
      break;
    }
    case 'skip-tutorial':
      state.tutorialStep = 4;
      save();
      render();
      break;
    case 'sound':
      setSound(volume ? 0 : 0.35);
      playCue('build');
      break;
    case 'zoom-in':
      map.zoom(1);
      break;
    case 'zoom-out':
      map.zoom(-1);
      break;
    case 'zoom-reset':
      map.resetView();
      break;
  }
});
$<HTMLSelectElement>('home').onchange = () => {
  if (!playing) return;
  home = $<HTMLSelectElement>('home').value;
  mode = null;
  render();
};
$<HTMLInputElement>('volume').oninput = () =>
  setSound(Number($<HTMLInputElement>('volume').value) / 100);
$('dialog').addEventListener('close', () => {
  if (!playing) (readSave() ? $('continue') : $('new-game')).focus();
});
document.addEventListener('keydown', (event) => {
  if ($<HTMLDialogElement>('dialog').open) return;
  if (!playing) {
    if (event.key === 'Tab') {
      const buttons = Array.from($('menu').querySelectorAll<HTMLButtonElement>('button')).filter(
        (button) => !button.disabled && button.getClientRects().length > 0,
      );
      const edge = event.shiftKey ? buttons[0] : buttons.at(-1);
      if (document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus();
      }
    }
    return;
  }
  const target = event.target as HTMLElement;
  if (target.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    panel = panel === 'today' ? 'people' : 'today';
    render();
    $(panel === 'today' ? 'tab-today' : 'tab-people').focus();
    return;
  }
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
  if (event.key === 'Escape') {
    mode = null;
    selected = null;
    render();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (undo(state)) {
      buildFeedback = '';
      save();
      render();
      playCue('undo');
    }
    return;
  }
  if (!state.finished && /^[1-5]$/.test(event.key)) {
    event.preventDefault();
    chooseTool((Object.keys(ACTION_LABELS) as Action[])[Number(event.key) - 1]);
    $('map').querySelector('canvas')?.focus();
    return;
  }
  if (target.tagName === 'CANVAS') {
    const directions: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault();
      const point = selected ?? { x: 17, y: 3 };
      selectCell(
        Math.max(0, Math.min(23, point.x + direction.x)),
        Math.max(0, Math.min(15, point.y + direction.y)),
      );
      map.reveal(selected!);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (mode && selected) build();
      else selectCell(17, 3);
    }
  }
});
setSound(volume);
showMenu();
