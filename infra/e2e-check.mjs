/**
 * Kiểm tra end-to-end trên hai server đang chạy thật (app + player origin).
 *
 * Selector ở đây CHỈ dùng data-testid hoặc thuộc tính ngữ nghĩa (role, class
 * .stage-frame là CSS thật). Đừng bám vào class trang trí — đổi giao diện là
 * test vỡ hàng loạt, đúng như lần chuyển sang Tailwind.
 *
 * Chạy:
 *   pnpm --filter @kidogame/web dev        # cửa sổ 1
 *   node infra/player-server.mjs           # cửa sổ 2
 *   node infra/e2e-check.mjs               # cửa sổ 3
 */
import { chromium } from 'playwright';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const PLAYER = process.env.PLAYER_ORIGIN ?? 'http://127.0.0.1:3001';
// Đường dẫn tới một file .sb3 thật để thử luồng upload. Bỏ trống thì bỏ qua phần đó.
const FIXTURE = process.env.SB3_FIXTURE ?? '';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });

// Giả lập một phiên đăng nhập trên app origin để thử rò rỉ cookie.
await context.addCookies([
  {
    name: 'kidogame_session',
    value: 'SECRET-SESSION-TOKEN',
    domain: 'localhost',
    path: '/',
    httpOnly: true,
  },
]);

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// Bắt mọi request để soi cookie gửi đi đâu.
const cookieLeaks = [];
page.on('request', (req) => {
  const cookie = req.headers()['cookie'] ?? '';
  if (req.url().startsWith(PLAYER) && cookie.includes('SECRET-SESSION-TOKEN')) {
    cookieLeaks.push(req.url());
  }
});

// ---------- Trang chủ ----------
await page.goto(APP, { waitUntil: 'networkidle' });
const cards = await page.locator('[data-testid=game-card]').count();
check('Trang chủ hiện danh sách game', cards > 0, `${cards} game`);

const thumbOk = await page.locator('[data-testid=game-card] img').first().evaluate((img) => {
  const el = img instanceof HTMLImageElement ? img : null;
  return !!el && el.naturalWidth > 0 && el.naturalHeight > 0;
});
check('Thumbnail tải được từ player origin', thumbOk);

// ---------- Trang chơi game ----------
await page.locator('[data-testid=game-card]').first().click();
await page.waitForLoadState('networkidle');

const frameEl = await page.locator('iframe.stage-frame').elementHandle();
check('Trang game có iframe player', !!frameEl);

const frameSrc = frameEl ? await frameEl.getAttribute('src') : '';
check('iframe trỏ tới player origin, không phải app origin', !!frameSrc?.startsWith(PLAYER), frameSrc ?? '');

const sandbox = frameEl ? await frameEl.getAttribute('sandbox') : '';
check(
  'iframe có sandbox và KHÔNG cho top-navigation',
  !!sandbox?.includes('allow-scripts') && !sandbox.includes('allow-top-navigation'),
  sandbox ?? ''
);

// ---------- Game thật sự chạy ----------
const frame = await frameEl.contentFrame();
await page.waitForTimeout(2500);
await frame.click('#launch', { force: true }).catch(() => {});
await page.waitForTimeout(2500);

const stage = await frame.evaluate(() => {
  const c = document.querySelector('canvas');
  const err = document.querySelector('#error');
  return {
    hasCanvas: !!c,
    size: c ? `${c.width}x${c.height}` : null,
    width: c ? c.width : 0,
    height: c ? c.height : 0,
    errorShown: err ? !err.hidden : false,
    greenFlag: !!document.querySelector('.green-flag-button'),
  };
});
check('Game boot và render trong iframe', stage.hasCanvas && !stage.errorShown, stage.size ?? '');
// Chốt kích thước: khung bị sập (vd. lỗi calc trong CSS) vẫn "render" nhưng
// canvas chỉ còn vài chục pixel — phải bắt được trường hợp đó.
check(
  'Stage đủ lớn để chơi',
  (stage.width ?? 0) >= 480,
  `${stage.width}x${stage.height}`
);
check('Thanh điều khiển hiện đủ nút', stage.greenFlag);
check('Không có lỗi JS trên trang', pageErrors.length === 0, pageErrors.join('; '));

// ---------- Cách ly cookie ----------
check(
  'Cookie phiên KHÔNG rò sang player origin',
  cookieLeaks.length === 0,
  cookieLeaks.length ? cookieLeaks.join(', ') : 'không có request nào mang cookie'
);

// ---------- Đếm lượt chơi ----------
await page.waitForTimeout(800);
await page.reload({ waitUntil: 'networkidle' });
const playText = await page.locator('[data-testid=page-lead]').first().innerText();
check('Lượt chơi được ghi nhận', /[1-9]\d* lượt chơi/.test(playText), playText);

await page.screenshot({ path: '/tmp/kidogame-game.png' });
await page.goto(APP, { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/kidogame-home.png' });

// ---------- Upload qua form: đường chấp nhận ----------
if (FIXTURE) {
  await page.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await page.fill('#title', 'Game kiểm thử e2e');
  await page.fill('#description', 'Do infra/e2e-check.mjs tạo ra.');
  await page.setInputFiles('#file', FIXTURE);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
  check('Upload .sb3 hợp lệ qua form thành công', /\/game\//.test(page.url()), page.url());

  // ---------- Upload qua form: đường từ chối ----------
  // File HTML đổi tên thành .sb3 phải bị chặn và hiện thông báo thân thiện.
  const fakePath = '/tmp/kidogame-fake.sb3';
  const { writeFileSync } = await import('node:fs');
  writeFileSync(fakePath, '<!DOCTYPE html><script>fetch("https://evil.example")</script>');

  await page.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await page.fill('#title', 'File giả mạo');
  await page.setInputFiles('#file', fakePath);
  await page.click('button[type=submit]');
  // Hộp lỗi có role=alert. PHẢI khoanh trong form: Next tự render một
  // route-announcer rỗng cũng mang role=alert, .first() sẽ bắt trúng cái đó.
  await page.waitForSelector('form [role=alert]', { timeout: 30000 }).catch(() => {});

  const errText = await page.locator('form [role=alert]').first().innerText().catch(() => '');
  check(
    'File HTML đổi tên .sb3 bị từ chối, có thông báo cho bé',
    errText.length > 0 && !/\/game\//.test(page.url()),
    errText
  );
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
