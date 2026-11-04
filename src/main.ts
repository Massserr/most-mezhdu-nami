import './style.css';
import {
  ACTION_LABELS,
  BUILDINGS,
  DAYS,
  INITIAL_BUDGET,
  LEGACY_SAVE_KEY,
  SAVE_KEY,
  TASKS,
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
import { hudIcon, icon, portrait } from './render/uiArt.ts';
import { createLayout } from './render/layout.ts';
import { helpMarkup } from './render/help.ts';

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
  panel: 'today' | 'people' | 'routes' = 'today',
  residentId = 'misha';
let toastTimer: ReturnType<typeof setTimeout>;
let buildFeedback = '';
let volume = 0;
try {
  volume = Math.min(1, Math.max(0, Number(localStorage.getItem('berezovka-volume')) || 0));
} catch {}
setVolume(volume);

$('app').innerHTML = createLayout(volume);

const map = createMap($('map'), {
  onCell: selectCell,
  onHover: (x, y) => {
    if (!playing) return;
    const tile = getTile(state, x, y),
      building = BUILDINGS.find((b) => b.x === x && b.y === y);
    $('hover-note').textContent =
      building?.name ??
      (tile?.damaged
        ? 'Нужен ремонт'
        : tile?.reinforced
          ? 'Мост укреплён'
          : tile?.road
            ? { dirt: 'Грунтовка', asphalt: 'Асфальт', bridge: 'Мост' }[tile.road]
            : tile?.bridgeSite
              ? 'Место для моста'
              : tile?.terrain === 'water'
                ? 'Река'
                : tile?.terrain === 'obstacle'
                  ? 'Деревья'
                  : 'Трава');
  },
});
$('map').addEventListener('pointerleave', () => {
  $('hover-note').textContent = '';
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
    panel = 'routes';
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
  if (!result.ok) toast(result.message);
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
  const residents = getResidentViews(state);
  const person = residents.find((p) => p.id === residentId)!;
  const requester = residents.find(
    (p) => p.id === ['misha', 'misha', 'anna', 'nina', 'nina', 'ilya', 'nina'][state.day - 1],
  )!;
  const dayNames = [
    'Починить дорогу',
    'Мост к школе',
    'Дорога к врачу',
    'Второй мост',
    'Паводок',
    'Открыть мастерскую',
    'Последняя проверка',
  ];
  const requests = [
    'Верните проезд к медпункту.',
    'Сократите путь Миши до школы.',
    'Сделайте короткий путь к врачу.',
    'Соедините берега двумя мостами.',
    'Обеспечьте проезд пожарным.',
    'Подведите дорогу к мастерской.',
    'Проверьте всю дорожную сеть.',
  ];
  const limits = [
    'Северная слобода → медпункт',
    'Северная слобода → школа: до 32',
    'Садовая улица → медпункт: до 16',
    'Все пути открыты · 2 моста',
    'До каждого квартала: до 48',
    'Все пути открыты · путь Ильи до 26',
    '24 пути · 2 моста · среднее до 29',
  ];
  $('day-number').textContent = `День ${state.day} / 7`;
  $('day-title').textContent = dayNames[state.day - 1];
  $('week').innerHTML = DAYS.map(
    (d, i) =>
      `<span title="День ${i + 1}: ${d.title}" class="${i + 1 === state.day ? 'current' : i + 1 < state.day ? 'past' : ''}">${i + 1 < state.day ? '✓' : i + 1}</span>`,
  ).join('');
  $('stats').innerHTML =
    `<div class="stat budget" title="Остаток бюджета из ${INITIAL_BUDGET}">${hudIcon('coin')}<div><span>Бюджет</span><strong>${state.budget}</strong></div></div><div class="stat" title="Доступные маршруты">${hudIcon('routes')}<div><span>Пути</span><strong>${m.connected}<small>/${m.total}</small></strong></div></div><div class="stat" title="Благополучие деревни">${hudIcon('heart')}<div><span>Благополучие</span><strong>${m.wellbeing}<small>/100</small></strong></div></div>`;
  $('weather').innerHTML =
    `${hudIcon(getWeather(state) === 'rain' ? 'rain' : 'sun')}<span>${getWeather(state) === 'rain' ? 'Дождь' : 'Ясно'}</span>`;
  $('forecast').textContent = day.forecast;
  $('goal').className = `goal ${goal.status}`;
  const goalStatus =
    goal.status === 'ready'
      ? '✓ Задание выполнено!'
      : goal.status === 'completed'
        ? '✓ Выполнено'
        : goal.status === 'failed'
          ? 'Срок прошёл'
          : goal.progress.replace(
              /^(\d+(?:\.\d+)?) усл\. ед\. \/ не больше (\d+)$/,
              'Время: $1 / $2',
            );
  $('goal').innerHTML =
    `<div class="quest-person">${portrait(requester.id, requester.color)}<div><b>${requester.name}</b></div></div><h2>${requests[state.day - 1]}</h2><p>${limits[state.day - 1]}</p><div class="goal-progress">${esc(goalStatus)}</div><button id="focus-goal" class="secondary">${hudIcon('map')} На карте</button>`;
  $('task-count').textContent = `${state.completedTasks.length}/7`;
  $('journal').innerHTML = tasks
    .map(
      (t) =>
        `<article class="journal-task ${t.status}"><span>${t.status === 'completed' ? '✓' : t.status === 'failed' ? '!' : t.startDay}</span><div><b>${t.title}</b><small>${t.progress}</small></div></article>`,
    )
    .join('');
  for (const tab of ['today', 'people', 'routes'] as const) {
    $(`tab-${tab}`).setAttribute('aria-selected', String(panel === tab));
    $(`tab-${tab}`).tabIndex = panel === tab ? 0 : -1;
    $(`${tab}-panel`).classList.toggle('hidden', panel !== tab);
  }
  $('people-list').innerHTML = residents
    .map(
      (p) =>
        `<button class="person-tab ${p.id === residentId ? 'active' : ''}" data-person="${p.id}" title="${p.name} · ${p.statusText}">${portrait(p.id, p.color)}<span>${p.name.split(' ')[0]}</span></button>`,
    )
    .join('');
  $('resident-story').innerHTML =
    `<div class="resident-heading">${portrait(person.id, person.color)}<div><h2>${person.name}</h2><span>${person.role}</span></div></div><p class="resident-quote">«${person.quote}»</p><div class="resident-status ${person.status}">${person.statusText}${person.time !== null ? ` · ${person.time.toFixed(1)}` : ''}</div><button class="secondary" id="resident-route">${hudIcon('map')} Показать путь</button>`;
  $<HTMLSelectElement>('home').value = home;
  $('services')
    .querySelectorAll<HTMLButtonElement>('[data-service]')
    .forEach((b) => {
      b.classList.toggle('active', b.dataset.service === service);
      b.disabled =
        Number(BUILDINGS.find((x) => x.id === b.dataset.service)?.opensDay ?? 1) > state.day;
    });
  $('route-info').innerHTML =
    `<b>${route.time === null ? 'Нет проезда' : route.time.toFixed(1)}</b><span>${route.path.length ? `Время пути · ${route.path.length - 1} клеток` : 'Соедините входы дорогой'}</span>`;
  $('route-explanation').textContent = explainRoute(state, home, service);
  $('advisor').textContent = getAdvisor(state);
  $('save-status').textContent = storageWarning;
  $('save-status').classList.toggle('warning', !!storageWarning);
  $<HTMLButtonElement>('undo').disabled = !playing || !state.history.length || state.finished;
  $<HTMLButtonElement>('end-day').disabled = !playing || state.finished;
  $('end-day').innerHTML = state.finished
    ? 'Неделя завершена'
    : `${state.day === 7 ? 'Итоги недели' : 'Завершить день'} <span>▶</span>`;
  $('tools')
    .querySelectorAll<HTMLButtonElement>('[data-tool]')
    .forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === mode);
      b.setAttribute('aria-pressed', String(b.dataset.tool === mode));
      b.disabled = !playing || state.finished;
    });
  const preview = selected && mode ? previewAction(state, mode, selected.x, selected.y) : null;
  if (preview && mode && selected && buildFeedback) {
    $('selection').className = 'selection valid';
    $('selection').innerHTML = '<b class="positive">✓ Работа выполнена</b>';
  } else if (preview && mode && selected) {
    const delta = preview.metrics ? preview.metrics.connected - m.connected : 0;
    const timeGain =
      preview.metrics?.averageTime != null && m.averageTime !== null
        ? m.averageTime - preview.metrics.averageTime
        : 0;
    const impact =
      delta > 0
        ? `+${delta} доступных путей`
        : timeGain > 0.01
          ? `Путь короче на ${timeGain.toFixed(1)}`
          : 'Новый участок';
    $('selection').className = `selection ${preview.valid ? 'valid' : 'invalid'}`;
    $('selection').innerHTML =
      `${icon(mode)}<div><b>${ACTION_LABELS[mode]}</b><p>${preview.valid ? impact + (preview.tasksReady.length ? ' · ✓ Цель дня' : '') : esc(preview.reason)}</p></div><button id="build" class="primary compact" ${preview.valid ? '' : 'disabled'}>${preview.valid ? `${mode === 'reinforce' ? 'Укрепить' : mode === 'repair' ? 'Починить' : 'Строить'} · ${preview.cost}` : 'Недоступно'}</button>`;
  } else {
    const building = selected
      ? BUILDINGS.find((b) => b.x === selected!.x && b.y === selected!.y)
      : null;
    $('selection').className = 'selection';
    $('selection').innerHTML =
      `<b>${building?.name ?? (mode ? ACTION_LABELS[mode] + ': выберите участок' : 'Выберите инструмент')}</b>`;
  }
  if (selected) {
    $('selection').insertAdjacentHTML(
      'beforeend',
      `<span class="sr-only">Клетка ${selected.x + 1}:${selected.y + 1}</span>`,
    );
  }
  const tutorials = [
    'Выберите дорогу внизу.',
    'Нажмите на отмеченный разрыв.',
    'Подтвердите: «Строить».',
    goal.status === 'ready' ? 'Задание выполнено. Завершите день.' : 'Проверьте задание справа.',
  ];
  $('tutorial').classList.toggle('hidden', state.tutorialStep >= 4 || state.finished);
  $('tutorial').innerHTML =
    state.tutorialStep < 4
      ? `<span>${tutorials[state.tutorialStep]}</span><button id="skip-tutorial" title="Скрыть подсказки" aria-label="Скрыть подсказки">×</button>`
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
  modal(helpMarkup(volume));
}
function finalScreen() {
  const score = getScore(state),
    m = getMetrics(state);
  modal(
    `<span class="eyebrow">Итоги недели</span><h2>${score.label}</h2><div class="final-score">${score.total}<span>/ 100</span></div><div class="result-grid"><div><b>${m.connected}/${m.total}</b><span>доступных путей</span></div><div><b>${state.completedTasks.length}/7</b><span>обещаний</span></div><div><b>${state.budget}</b><span>сохранено из ${INITIAL_BUDGET}</span></div></div><details class="ending-intro"><summary>Что стало с деревней</summary><p>${getEnding(state)[0]}</p></details><details class="ending-stories"><summary>Как изменилась жизнь жителей</summary>${getResidentViews(
      state,
    )
      .map(
        (p) =>
          `<div class="ending-person">${portrait(p.id, p.color)}<p><b>${p.name}</b><br>«${esc(p.quote)}»</p></div>`,
      )
      .join(
        '',
      )}</details><details class="score-breakdown"><summary>Подсчёт баллов</summary><p>Баллы: связь ${score.accessibility.toFixed(1)} · скорость ${score.speed.toFixed(1)} · обещания ${score.tasks.toFixed(1)} · экономия ${score.economy.toFixed(1)}.</p></details><button class="primary" id="again">Новая игра <span>→</span></button><button class="secondary" data-close>Карта</button>`,
  );
  playCue(score.success ? 'success' : 'day');
}
function confirmDay() {
  if (!playing || state.finished) return;
  const task = getTasks(state).find((t) => t.deadline === state.day)!;
  modal(
    `<span class="eyebrow">Берёзовка · день ${state.day}</span><h2>${state.day === 7 ? 'Завершить неделю?' : 'Завершить день?'}</h2><p class="${task.status === 'active' ? 'warning' : ''}">${task.status === 'ready' ? 'Сегодняшнее обещание выполнено:' : task.status === 'active' ? 'Цель пока не достигнута:' : ''} <b>${task.title}</b>.</p><p>${task.description} ${esc(task.progress)}</p><p>После перехода сегодняшнюю стройку нельзя отменить.</p><div class="forecast-callout">${DAYS[state.day - 1].forecast}</div><button id="confirm-day" class="primary">${state.day === 7 ? 'Подвести итог' : 'Завершить день'} <span>→</span></button><button class="secondary" data-close>Вернуться к карте</button>`,
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
    `<span class="eyebrow">День ${report.day} завершён</span><h2>${report.completed.length ? 'Задание выполнено' : 'Задание не выполнено'}</h2><p>${report.completed.length ? `${report.completed.join(', ')} — выполнено.` : `${report.failed.join(', ')} — срок пропущен. Последующие дни остаются открыты.`}</p><div class="result-grid"><div><b>${Math.round(report.after.accessibility)}%</b><span>доступность · было ${Math.round(report.before.accessibility)}%</span></div><div><b>${report.after.averageTime?.toFixed(1) ?? '—'}</b><span>путь · было ${report.before.averageTime?.toFixed(1) ?? '—'}</span></div></div><div class="next-chapter"><span class="eyebrow">ДЕНЬ ${state.day}</span><h3>${DAYS[state.day - 1].title}</h3>${report.events.map((e) => `<p>${esc(e)}</p>`).join('')}</div><button class="primary" data-close>Начать день ${state.day} <span>→</span></button>`,
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
  $('sound').textContent = value ? '♫' : '♪';
  $('sound').setAttribute('aria-pressed', String(value > 0));
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
          '<span class="eyebrow">Новая неделя</span><h2>Начать новую игру?</h2><p>Текущая партия будет заменена. Её можно продолжить из главного меню.</p><button id="confirm-new" class="primary">Начать заново</button><button class="secondary" data-close>Вернуться</button>',
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
        '<h2>Мост между нами</h2><p>Стройте дороги и мосты в Берёзовке. За семь дней помогите жителям добраться до школы, медпункта и мастерской.</p><details><summary>Авторы и лицензии</summary><p>Графика и звуки созданы для проекта. Шрифт Tiny5 — Stefan Schmidt, SIL Open Font License. Лицензии Tiny5, Phaser и EventEmitter3 включены в поставку.</p></details><button class="primary" data-close>Продолжить</button>',
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
        toast('Работа отменена');
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
    case 'tab-routes':
      panel = 'routes';
      render();
      break;
    case 'focus-goal':
      focusGoal();
      break;
    case 'resident-route': {
      const person = getResidentViews(state).find((p) => p.id === residentId)!;
      home = person.home;
      service = person.service;
      panel = 'routes';
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
document.addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'dialog-volume') setSound(Number(input.value) / 100);
});
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
    const tabs = ['today', 'people', 'routes'] as const;
    panel = tabs[(tabs.indexOf(panel) + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
    render();
    $(`tab-${panel}`).focus();
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
