import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { centralPlan } from '../tests/scenarios.ts';

const output = path.resolve(process.env.ARTIFACT_DIR ?? '../work/browser-check');
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['scripts/server.cjs', '--no-open'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try {
      const health = await fetch('http://127.0.0.1:4173/__most_health');
      if (health.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const external: string[] = [],
    errors: string[] = [],
    checks: string[] = [];
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('canvas').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, '01-menu.png') });
  assert.equal(await page.locator('#play-screen').evaluate((el) => el.inert), true);
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.id);
    assert.notEqual(id, 'end-day');
    assert.notEqual(id, 'home');
    assert.notEqual(id, 'undo');
  }
  checks.push('Menu traps keyboard outside the inert game screen');
  await page.locator('#new-game').click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#routes-panel').isVisible(), false);
  await page.locator('#tab-routes').click();
  assert.equal(await page.locator('#home').isVisible(), true);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#tab-people').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tab-routes').getAttribute('aria-selected'), 'true');
  await page.locator('#tab-today').click();
  checks.push('Task, residents and route tabs switch with mouse and keyboard');
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('berezovka-save-v1')!));
  const cell = async (x: number, y: number) => {
    const box = await page.locator('canvas').boundingBox();
    assert.ok(box);
    await page.mouse.click(
      box.x + ((x + 0.5) * box.width) / 24,
      box.y + ((y + 0.5) * box.height) / 16,
    );
  };
  const build = async (action: string, x: number, y: number) => {
    if (
      !(await page
        .locator(`[data-tool="${action}"]`)
        .evaluate((el) => el.classList.contains('active')))
    )
      await page.locator(`[data-tool="${action}"]`).click();
    await cell(x, y);
    assert.equal(await page.locator('#build').isEnabled(), true, `${action} ${x}:${y}`);
    await page.locator('#build').click();
  };
  const layouts: unknown[] = [];
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('canvas')?.getBoundingClientRect();
        const map = document.querySelector('#map')?.getBoundingClientRect();
        return (
          canvas &&
          map &&
          Math.abs(canvas.width - map.width) < 2 &&
          Math.abs(canvas.height - map.height) < 2
        );
      },
      undefined,
      { timeout: 15000 },
    );
    const layout = await page.evaluate(() => {
      const rect = (s: string) => {
        const b = document.querySelector(s)!.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height, bottom: b.bottom };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        canvas: rect('canvas'),
        map: rect('#map'),
        tools: rect('#tools'),
        end: rect('#end-day'),
        bodyHeight: document.documentElement.scrollHeight,
        bodyWidth: document.documentElement.scrollWidth,
      };
    });
    layouts.push(layout);
    assert.equal(layout.bodyWidth, width, 'No horizontal overflow');
    assert.equal(layout.bodyHeight, height, 'Desktop controls fit the viewport');
    assert.ok(layout.canvas.width >= (width === 1366 ? 600 : 900), 'Map stays readable');
    assert.ok(Math.abs(layout.canvas.width - layout.map.width) < 2, 'No wide letterbox gutters');
    assert.ok(layout.tools.bottom <= height && layout.end.bottom <= height);
    await page.screenshot({ path: path.join(output, `02-game-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(100);
  await page.locator('[data-tool="asphalt"]').click();
  await cell(17, 3);
  assert.ok(
    await page.locator('#selection > svg').evaluate((el) => el.getBoundingClientRect().width <= 48),
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollHeight),
    768,
    'Construction preview fits the viewport',
  );
  assert.equal((await saved()).budget, 700);
  await page.locator('#build').click();
  assert.equal((await saved()).budget, 666);
  assert.match(await page.locator('#selection').innerText(), /Работа выполнена/);
  assert.equal(await page.locator('#build').count(), 0);
  checks.push('Successful construction shows confirmation without a false placement error');
  await page.locator('#undo').click();
  assert.equal((await saved()).budget, 700);
  checks.push('Preview is free, build charges correct cost, undo refunds');
  await page.locator('canvas').focus();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  assert.equal((await saved()).budget, 682);
  assert.match((await page.locator('#selection .sr-only').textContent()) ?? '', /Клетка 18:4/);
  await page.keyboard.press('Control+z');
  assert.equal((await saved()).budget, 700);
  await page.keyboard.press('Escape');
  checks.push('Keyboard tool selection, Enter construction, Ctrl+Z and Escape');
  for (let day = 1; day <= 7; day++) {
    console.log(`Browser: day ${day}`);
    for (const [action, x, y] of centralPlan[day] ?? []) await build(action, x, y);
    assert.match((await page.locator('#goal').getAttribute('class')) ?? '', /ready/);
    if (day === 2) {
      const budget = (await saved()).budget;
      await page.reload();
      await page.locator('#continue').click();
      assert.equal((await saved()).budget, budget);
      checks.push('Reload restores campaign, budget and objectives');
      await page.locator('#tab-people').click();
      await page.locator('[data-person="misha"]').click();
      assert.match(await page.locator('#resident-story').innerText(), /Миша/);
      await page.screenshot({ path: path.join(output, '03-misha.png') });
      await page.locator('#tab-today').click();
    }
    if ([3, 5, 6, 7].includes(day))
      await page.screenshot({ path: path.join(output, `04-day-${day}.png`), fullPage: true });
    await page.locator('#end-day').click();
    await page.locator('#confirm-day').click();
    if (day < 7) await page.locator('[data-close]').click();
  }
  assert.equal((await saved()).completedTasks.length, 7);
  assert.equal((await saved()).budget, 132);
  assert.match(await page.locator('#dialog').innerText(), /Берёзовка стала ближе/);
  await page.screenshot({ path: path.join(output, '05-final.png') });
  checks.push('Full seven-day campaign, 7/7 promises, 132 budget, high ending');
  await page.locator('[data-close]').click();
  await page.locator('#zoom-in').click();
  await page.locator('#zoom-reset').click();
  await page.locator('#tab-people').click();
  await page.locator('[data-person="anna"]').click();
  await page.locator('#resident-route').click();
  checks.push('Completed village remains inspectable, zoom resets');
  await page.locator('#menu-button').click();
  await page.locator('#continue').click();
  assert.match(await page.locator('#dialog').innerText(), /Берёзовка стала ближе/);
  await page.locator('#again').click();
  assert.equal((await saved()).budget, 700);
  checks.push('Finished save reopens final screen, restart creates clean campaign');
  const broken = await browser.newContext();
  const b = await broken.newPage();
  await b.goto('http://127.0.0.1:4173/');
  await b.evaluate(() => localStorage.setItem('berezovka-save-v1', '{broken'));
  await b.reload();
  assert.equal(await b.locator('#continue').isVisible(), false);
  assert.match(await b.locator('#save-hint').innerText(), /повреждено/);
  await b.locator('#new-game').click();
  checks.push('Corrupt saves produce explanation and allow new game');
  const denied = await browser.newContext();
  await denied.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  const d = await denied.newPage();
  await d.goto('http://127.0.0.1:4173/');
  await d.locator('#new-game').click();
  assert.match(await d.locator('#save-status').innerText(), /недоступно/);
  checks.push('Blocked storage leaves game playable with warning');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const result = { checks, layouts, errors, externalRequests: external };
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
