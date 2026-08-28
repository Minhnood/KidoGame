/**
 * Quét mọi trang trên BẢN PRODUCTION: lỗi JS, vi phạm CSP, lệch hydration, 4xx/5xx.
 *
 * VÌ SAO cần bộ riêng cho production: CSP ở dev có `'unsafe-eval'`, ở production
 * thì không. Nghĩa là cả một lớp lỗi — thư viện nào đó gọi `eval`, một inline
 * script nào đó lọt lưới nonce — chạy êm ru ở dev và chỉ sập khi lên thật. Bản dev
 * không chỉ *không bắt được* loại lỗi này, nó còn tích cực che đi.
 *
 * Cùng lý do với `e2e-prod-cookie.mjs`, nhưng rộng hơn: bộ kia soi kỹ một luồng,
 * bộ này soi nông toàn bộ bề mặt. Cả hai đều cần stack Docker.
 *
 * Chạy:
 *   cd infra && docker compose up -d --build
 *   docker compose run --rm web pnpm --filter @kidogame/web db:deploy
 *   node infra/e2e-prod-routes.mjs
 *
 * Đổi đích:  APP=https://app.kidogame.vn node infra/e2e-prod-routes.mjs
 */
import { chromium } from 'playwright';

const APP = process.env.APP ?? 'https://app.localhost';
const PARENT_EMAIL = process.env.DEMO_EMAIL ?? 'demo@kidogame.local';
const PARENT_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo1234ab';
const CHILD_USER = process.env.DEMO_CHILD ?? 'beminh';
const CHILD_PASSWORD = process.env.DEMO_CHILD_PASSWORD ?? 'be1234';

const browser = await chromium.launch({ channel: 'chrome' });

/** Đăng nhập sẵn một context cho mỗi vai. Trang chỉ khách xem thì dùng context trắng. */
async function contextFor(role) {
  // ignoreHTTPSErrors: với app.localhost thì Caddy cấp chứng chỉ bằng CA nội bộ.
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  if (role === 'khách') return ctx;

  const page = await ctx.newPage();
  if (role === 'phụ huynh') {
    await page.goto(`${APP}/dang-nhap`, { waitUntil: 'networkidle' });
    await page.fill('input[name=email]', PARENT_EMAIL);
    await page.fill('input[name=password]', PARENT_PASSWORD);
  } else {
    await page.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
    await page.fill('input[name=username]', CHILD_USER);
    await page.fill('input[name=password]', CHILD_PASSWORD);
  }
  /*
   * `main button[type=submit]` chứ không phải `button[type=submit]`.
   *
   * Thanh điều hướng có form Đăng xuất, nên nút submit ĐẦU TIÊN của trang là nút
   * đăng xuất chứ không phải nút của form đang xem. Đã vấp: bấm nhầm nút đó thì
   * script treo tới hết timeout mà không có lỗi nào dễ hiểu.
   */
  await page.locator('main button[type=submit]').first().click();
  await page
    .waitForURL((u) => !u.pathname.includes('dang-nhap'), { timeout: 15000 })
    .catch(() => {});
  await page.close();
  return ctx;
}

const ctxs = {
  'khách': await contextFor('khách'),
  'phụ huynh': await contextFor('phụ huynh'),
  'bé': await contextFor('bé'),
};

// Lấy một game có thật từ trang chủ thay vì bắt người chạy tự truyền id vào.
let gameId = null;
{
  const page = await ctxs['khách'].newPage();
  await page.goto(APP, { waitUntil: 'networkidle' });
  const href = await page
    .locator('a[href^="/game/"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  gameId = href?.split('/game/')[1] ?? null;
  await page.close();
}

const ROUTES = [
  { path: '/', as: 'khách' },
  { path: '/dang-nhap', as: 'khách' },
  { path: '/dang-ky', as: 'khách' },
  { path: '/be-dang-nhap', as: 'khách' },
  { path: '/quen-mat-khau', as: 'khách' },
  { path: '/dieu-khoan', as: 'khách' },
  { path: '/bao-cao-ban-quyen', as: 'khách' },
  // Bộ lọc và tìm kiếm đi qua nhánh render khác hẳn trang chủ trống.
  { path: '/?q=meo&tag=phieu-luu&age=8-10', as: 'khách' },
  // Token sai phải ra trang lỗi tử tế, không phải trang trắng hay 500.
  { path: '/xac-minh-email?token=sai', as: 'khách' },
  { path: '/dat-lai-mat-khau?token=sai', as: 'khách' },
  { path: '/phu-huynh', as: 'phụ huynh' },
  { path: '/admin', as: 'phụ huynh' },
  { path: '/upload', as: 'bé' },
  ...(gameId ? [{ path: `/game/${gameId}`, as: 'khách' }] : []),
];

let bad = 0;

for (const route of ROUTES) {
  const page = await ctxs[route.as].newPage();
  const jsErrors = [];
  const cspViolations = [];
  const httpErrors = [];

  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error') {
      // Vi phạm CSP tới console dưới dạng "Refused to ...".
      if (/Content Security Policy|Refused to/i.test(text)) cspViolations.push(text.slice(0, 110));
      else jsErrors.push(text.slice(0, 110));
    }
    // Lệch hydration là warning, không phải error — phải bắt riêng.
    if (/hydrat/i.test(text)) jsErrors.push('HYDRATION: ' + text.slice(0, 100));
  });
  page.on('pageerror', (e) => jsErrors.push('PAGEERROR: ' + String(e.message).slice(0, 110)));
  page.on('response', (res) => {
    if (res.status() >= 400 && new URL(res.url()).host === new URL(APP).host) {
      httpErrors.push(`${res.status()} ${new URL(res.url()).pathname}`);
    }
  });

  const resp = await page
    .goto(APP + route.path, { waitUntil: 'networkidle' })
    .catch((e) => ({ status: () => 'ERR ' + String(e.message).slice(0, 40) }));
  await page.waitForTimeout(1200);

  const status = typeof resp?.status === 'function' ? resp.status() : '?';
  const body = await page.locator('body').innerText().catch(() => '');

  const problems = [
    status >= 400 ? `HTTP ${status}` : null,
    // Trang render ra gần như rỗng thường là lỗi CSP đã chặn mất bundle.
    body.trim().length < 40 ? 'trang gần như rỗng' : null,
    cspViolations.length ? `CSP: ${cspViolations[0]}` : null,
    jsErrors.length ? `JS: ${jsErrors[0]}` : null,
    httpErrors.length ? `tài nguyên phụ: ${httpErrors.join(', ')}` : null,
  ].filter(Boolean);

  if (problems.length) bad++;
  console.log(`${problems.length ? '❌' : '✅'} [${route.as}] ${route.path}${problems.length ? '  ' + problems.join(' | ') : ''}`);
  await page.close();
}

if (!gameId) console.log('⚠️  Không có game nào công khai nên BỎ QUA trang /game/<id>.');

await browser.close();
console.log(`\n${ROUTES.length - bad}/${ROUTES.length} route sạch`);
process.exit(bad ? 1 : 0);
