/**
 * Verify thủ công: HTML do packageToHtml() sinh ra có thực sự boot và chạy
 * trong trình duyệt thật không, với đúng bộ options của KidoGame.
 *
 * Không chạy trong `pnpm test` vì cần Chrome. Chạy tay:
 *   pnpm --filter @kidogame/sb3 exec node test/e2e-browser.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { validateAndNormalize } from '../src/validate.js';
import { packageToHtml } from '../src/package.js';
import { validSb3 } from './fixtures.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidogame-e2e-'));
const htmlPath = path.join(tmp, 'game.html');

const { sb3, warnings } = await validateAndNormalize(await validSb3());
const out = await packageToHtml(sb3, { title: 'Game của bé' });
fs.writeFileSync(htmlPath, out.html);
console.log(`đóng gói: ${(out.html.length / 1024 / 1024).toFixed(2)} MB -> ${htmlPath}`);
console.log('warnings:', warnings);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 640, height: 520 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// Chặn mọi thứ không phải file/data/blob -> chứng minh game chơi được offline
// và không gọi bên thứ ba nào.
const external = [];
await page.route('**', (route) => {
  const u = route.request().url();
  if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
  external.push(u);
  return route.abort();
});

await page.goto('file://' + htmlPath);
await page.waitForTimeout(2500);
await page.click('#launch', { force: true }).catch(() => page.click('canvas'));
await page.waitForTimeout(2500);

const state = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const err = document.querySelector('#error');
  return {
    title: document.title,
    hasCanvas: !!c,
    canvas: c ? `${c.width}x${c.height}` : null,
    errorShown: err ? !err.hidden : false,
    // Các nút điều khiển ta bật trong package.ts phải hiện diện.
    // Packager render chúng thành <img class="control-button ...">, không phải <button>.
    controls: {
      greenFlag: !!document.querySelector('.green-flag-button'),
      stopAll: !!document.querySelector('.stop-all-button'),
      fullscreen: !!document.querySelector('.fullscreen-button'),
    },
  };
});

const shot = path.join(tmp, 'shot.png');
await page.screenshot({ path: shot });
await browser.close();

console.log('state:', state);
console.log('page errors:', errors.length ? errors : '(none)');
console.log('request ra ngoài:', external.length ? external : '(không có)');
console.log('ảnh chụp:', shot);

const ok =
  state.hasCanvas &&
  !state.errorShown &&
  errors.length === 0 &&
  external.length === 0 &&
  state.controls.greenFlag &&
  state.controls.stopAll &&
  state.controls.fullscreen;
console.log(ok ? '\n✅ PASS' : '\n❌ FAIL');
process.exit(ok ? 0 : 1);
