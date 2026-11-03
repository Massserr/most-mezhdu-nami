import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { centralPlan } from '../tests/scenarios.ts';
import { getScore, type GameState } from '../src/core/index.ts';

const output = path.resolve(process.env.DEMO_DIR ?? '../work/demo-recording');
const timings = JSON.parse(
  await readFile(process.env.DEMO_TIMINGS ?? '../work/voice-timings.json', 'utf8'),
) as number[];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome',
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    recordVideo: { dir: output, size: { width: 1366, height: 768 } },
  });
  const recordingStarted = Date.now();
  // Browser regression tests use normal actionability checks. Capture may drop
  // animation frames, so filming clicks skip stability waits without changing game state.
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('canvas').waitFor();
  const leadInSeconds = (Date.now() - recordingStarted) / 1000;
  const video = page.video()!;
  const recorded: { scene: number; duration: number; voiceDuration: number }[] = [];
  const cell = async (x: number, y: number) => {
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('Map unavailable');
    await page.mouse.move(
      box.x + ((x + 0.5) * box.width) / 24,
      box.y + ((y + 0.5) * box.height) / 16,
      { steps: 8 },
    );
    await page.mouse.click(
      box.x + ((x + 0.5) * box.width) / 24,
      box.y + ((y + 0.5) * box.height) / 16,
    );
    await page.waitForTimeout(300);
  };
  const advance = async () => {
    await page.locator('#end-day').click({ force: true });
    await page.waitForTimeout(400);
    await page.locator('#confirm-day').click({ force: true });
    await page.waitForTimeout(600);
  };
  for (let scene = 1; scene <= 7; scene++) {
    const started = Date.now();
    console.log(`Recording scene ${scene}`);
    if (scene === 1) {
      await page.waitForTimeout(3500);
      await page.locator('#new-game').click({ force: true });
      await page.waitForTimeout(700);
    } else await page.locator('[data-close]').click({ force: true });
    await page.locator('#focus-goal').click({ force: true });
    if (scene === 1) await page.screenshot({ path: path.join(output, 'game-1366.png') });
    for (const [action, x, y] of centralPlan[scene] ?? []) {
      if (
        !(await page
          .locator(`[data-tool="${action}"]`)
          .evaluate((el) => el.classList.contains('active')))
      )
        await page.locator(`[data-tool="${action}"]`).click({ force: true });
      await cell(x, y);
      await page.waitForTimeout(350);
      await page.locator('#build').click({ force: true });
      await page.waitForTimeout(550);
    }
    if (scene === 2 || scene === 6) {
      await page.locator('#tab-people').click({ force: true });
      await page
        .locator(`[data-person="${scene === 2 ? 'misha' : 'ilya'}"]`)
        .click({ force: true });
      await page.locator('#resident-route').click({ force: true });
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: path.join(output, scene === 2 ? 'misha.png' : 'workshop.png'),
      });
      await page.locator('#tab-today').click({ force: true });
    }
    if (scene === 4) {
      await page.locator('.forecast summary').click({ force: true });
      await page.waitForTimeout(1000);
    }
    if (scene === 5 || scene === 7) {
      await page.locator('#focus-goal').click({ force: true });
      await page.waitForTimeout(1000);
    }
    await advance();
    if (scene === 7) {
      await page.waitForTimeout(3000);
      await page.locator('#dialog').hover();
      await page.mouse.wheel(0, 320);
      await page.waitForTimeout(3000);
      await page.mouse.wheel(0, -500);
    }
    const elapsed = (Date.now() - started) / 1000;
    const duration = Math.max(timings[scene - 1] + 0.7, elapsed + 1.5);
    await page.waitForTimeout(Math.max(0, (duration - elapsed) * 1000));
    recorded.push({ scene, duration, voiceDuration: timings[scene - 1] });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const finalState = (await page.evaluate(() =>
    JSON.parse(localStorage.getItem('berezovka-save-v1')!),
  )) as GameState;
  if (
    !finalState.finished ||
    finalState.completedTasks.length !== 7 ||
    finalState.budget !== 132 ||
    !getScore(finalState).success
  ) {
    throw new Error('The recorded campaign must reach the verified successful ending.');
  }
  await writeFile(path.join(output, 'recorded-segments.json'), JSON.stringify(recorded, null, 2));
  await writeFile(
    path.join(output, 'video-metadata.json'),
    JSON.stringify(
      {
        leadInSeconds,
        finalScore: getScore(finalState),
        completed: finalState.completedTasks.length,
      },
      null,
      2,
    ),
  );
  await page.screenshot({ path: path.join(output, 'final-frame.png') });
  await context.close();
  await video.saveAs(path.join(output, 'gameplay.webm'));
  console.log(JSON.stringify(recorded));
} finally {
  await browser.close();
}
