import { COSTS, INITIAL_BUDGET } from '../core/index.ts';

export const helpMarkup = (volume: number) => `
<h2>Как играть</h2>
<ol class="help-list">
  <li>Выберите инструмент внизу карты.</li>
  <li>Нажмите на клетку и проверьте цену.</li>
  <li>Нажмите «Строить». До конца дня работу можно отменить.</li>
  <li>Выполните задание справа и завершите день.</li>
</ol>
<p>Дороги соединяются сторонами клеток. Подведите дорогу к светлой метке у здания. На всю неделю — ${INITIAL_BUDGET} единиц бюджета.</p>
<details><summary>Цены и погода</summary><table class="cost-table"><tbody><tr><td>Грунтовка</td><td>${COSTS.dirt}</td></tr><tr><td>Асфальт: новый / улучшение</td><td>${COSTS.asphalt} / ${COSTS.upgrade}</td></tr><tr><td>Мост: деревянный / каменный</td><td>140 / 220</td></tr><tr><td>Ремонт: дорога / мост</td><td>${COSTS.repair} / ${COSTS.bridgeRepair}</td></tr><tr><td>Укрепление моста</td><td>${COSTS.reinforce}</td></tr></tbody></table><p>В дождь грунт вдвое медленнее. На пятый день паводок повредит деревянные мосты без укрепления. Каменный мост выдержит.</p></details>
<details><summary>Клавиши</summary><p>1–5 — инструменты. Стрелки — клетка. Enter — построить. Esc — снять выбор. Ctrl+Z — отменить. Колесо — масштаб, правая кнопка — двигать карту.</p></details>
<details><summary>Как получить высокий результат</summary><p>Откройте все 24 маршрута и выполните хотя бы 5 из 7 заданий. Итог зависит от доступных путей, скорости, выполненных заданий и оставшегося бюджета.</p><p>Время — условные игровые единицы. Грунт: 2 в сухую погоду, 4 в дождь. Асфальт и мост: 1. Цена перехода — полусумма весов клеток.</p></details>
<label class="sound-setting">Громкость <input id="dialog-volume" aria-label="Громкость" type="range" min="0" max="100" step="5" value="${volume * 100}"></label>
<button class="primary" data-close>Понятно</button>`;
