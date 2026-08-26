/**
 * Kiểm tra end-to-end phần báo cáo + tự ẩn + trang admin (M4).
 *
 * Cần:
 *   - app server đang chạy
 *   - đã chạy `pnpm db:seed` (bài test dùng tài khoản admin demo)
 *   - một file .sb3 hợp lệ để bé đăng game
 *
 * Chạy:
 *   SB3_FIXTURE=/tmp/meo-phieu-luu.sb3 node infra/e2e-moderation.mjs
 *
 * LƯU Ý VỀ NGƯỜI BÁO CÁO TRÙNG: khoá chống trùng tính theo DANH TÍNH nếu đã đăng
 * nhập, chỉ khách vãng lai mới tính theo IP. Ở máy dev không có header
 * `x-forwarded-for` nên MỌI khách vãng lai dùng chung một khoá — vì vậy bài test
 * chỉ lấy được đúng 1 lượt báo cáo ẩn danh, các lượt còn lại phải là tài khoản
 * đăng nhập. Trên production sau Caddy thì mỗi IP là một khoá riêng.
 *
 * Cũng vì khoá đó tính cả báo cáo đã bị bác bỏ (ràng buộc unique không phân biệt
 * `status`), một người đã báo cáo thì không báo lại được nữa dù admin đã bỏ qua
 * báo cáo cũ. Nên vòng hai của bài test phải dùng ba danh tính KHÁC vòng một.
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const FIXTURE = process.env.SB3_FIXTURE ?? '';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'demo@kidogame.local';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'demo1234ab';

const suffix = randomBytes(4).toString('hex');
const PARENT_PASS = 'matkhau-dai-1234';
const CHILD_USER = `emod${suffix}`;
const CHILD_PASS = 'be1234';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!FIXTURE) {
  console.error('Cần SB3_FIXTURE=<đường dẫn .sb3> để bé có game mà báo cáo.');
  process.exit(1);
}

const browser = await chromium.launch({ channel: 'chrome' });
const newSession = () => browser.newContext({ viewport: { width: 1300, height: 1000 } });

async function registerParent(ctx, email) {
  const p = await ctx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', email);
  await p.fill('#password', PARENT_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  return p;
}

/**
 * Mở hộp báo cáo rồi gửi một lý do.
 *
 * Bấm vào <summary> chứ không set thuộc tính `open`: phải chắc là người dùng mở được
 * nó bằng thao tác thật, không phải chỉ mở được bằng script.
 */
async function submitReport(page, gameUrl, reason = 'KHONG_PHU_HOP') {
  await page.goto(gameUrl, { waitUntil: 'networkidle' });
  if ((await page.locator('[data-testid=report-box]').count()) === 0) return 'khong-thay-nut';

  await page.locator('[data-testid=report-box] summary').click();
  await page.locator(`[data-testid=report-form] input[value=${reason}]`).check();
  await page.click('[data-testid=report-form] button[type=submit]');
  await page.waitForSelector('[data-testid=report-done]', { timeout: 20000 }).catch(() => {});
  return (await page.locator('[data-testid=report-done]').count()) > 0 ? 'cam-on' : 'khong-phan-hoi';
}

/** Bấm một nút hai nhịp trên trang admin: bấm mở, rồi bấm xác nhận. */
async function confirmClick(row, testId) {
  await row.locator(`[data-testid=${testId}]`).click();
  await row.locator(`[data-testid=${testId}-confirm]`).click();
  await row.page().waitForTimeout(2500);
}

const status = async (ctx, url) => {
  const p = await ctx.newPage();
  const res = await p.goto(url, { waitUntil: 'networkidle' });
  const code = res?.status();
  await p.close();
  return code;
};

// ---------- Dựng dữ liệu: phụ huynh -> bé -> game ----------
const parentCtx = await newSession();
const parentBCtx = await newSession();
const childCtx = await newSession();
const anonCtx = await newSession();
let gameUrl = '';
let gameId = '';

{
  const p = await registerParent(parentCtx, `e2e-mod-${suffix}@kidogame.test`);
  await p.fill('#displayName', 'Bé Kiểm Duyệt');
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', CHILD_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForTimeout(2500);

  await registerParent(parentBCtx, `e2e-mod-b-${suffix}@kidogame.test`);

  const c = await childCtx.newPage();
  await c.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c.fill('#username', CHILD_USER);
  await c.fill('#password', CHILD_PASS);
  await c.click('[data-testid=auth-form] button[type=submit]');
  await c.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});

  await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await c.fill('#title', `Game kiểm duyệt ${suffix}`);
  await c.setInputFiles('#file', FIXTURE);
  await c.click('[data-testid=upload-form] button[type=submit]');
  await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
  gameUrl = c.url();
  gameId = gameUrl.split('/game/')[1] ?? '';
  check('Dựng được game để kiểm duyệt', /\/game\//.test(gameUrl), gameUrl);
}

if (!gameId) {
  console.error('Không đăng được game, dừng bài test.');
  await browser.close();
  process.exit(1);
}

// ---------- Khách vãng lai thấy và dùng được nút báo cáo ----------
{
  const g = await anonCtx.newPage();
  await g.goto(gameUrl, { waitUntil: 'networkidle' });
  check(
    'Khách chưa đăng nhập vẫn thấy nút báo cáo',
    (await g.locator('[data-testid=report-box]').count()) > 0
  );
  await g.close();
}

// ---------- Người thường không vào được trang kiểm duyệt ----------
{
  const p = await parentCtx.newPage();
  const res = await p.goto(`${APP}/admin`, { waitUntil: 'networkidle' });
  check(
    'Phụ huynh thường vào /admin nhận 404 (không xác nhận trang tồn tại)',
    res?.status() === 404,
    `HTTP ${res?.status()}`
  );
  check(
    'Phụ huynh thường không thấy link Kiểm duyệt trên nav',
    (await p.locator('[data-testid=nav-admin]').count()) === 0
  );
  await p.close();
}

// ---------- Vòng 1: một báo cáo, admin bác bỏ, game vẫn hiện ----------
const adminCtx = await newSession();
const admin = await adminCtx.newPage();
{
  const p = await parentCtx.newPage();
  check('Báo cáo lần đầu được ghi nhận', (await submitReport(p, gameUrl)) === 'cam-on');
  check('Báo cáo trùng vẫn thấy lời cảm ơn, không lộ là đã có người báo', (await submitReport(p, gameUrl)) === 'cam-on');
  await p.close();

  await admin.goto(`${APP}/dang-nhap`, { waitUntil: 'networkidle' });
  await admin.fill('#email', ADMIN_EMAIL);
  await admin.fill('#password', ADMIN_PASS);
  await admin.click('[data-testid=auth-form] button[type=submit]');
  await admin.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});

  const res = await admin.goto(`${APP}/admin`, { waitUntil: 'networkidle' });
  check('Admin vào được /admin', res?.status() === 200, `HTTP ${res?.status()}`);
  check('Admin thấy link Kiểm duyệt trên nav', (await admin.locator('[data-testid=nav-admin]').count()) > 0);

  const row = admin.locator(`[data-testid=admin-game][data-game-id="${gameId}"]`);
  const countText = await row.locator('[data-testid=admin-report-count]').innerText();
  check('Báo cáo trùng KHÔNG cộng thêm (vẫn 1 báo cáo)', /^1 báo cáo/.test(countText), countText);
  check(
    'Game còn đang hiện mà bị báo cáo thì có nút Bỏ qua báo cáo',
    (await row.locator('[data-testid=admin-dismiss]').count()) > 0
  );
  check('Trang admin hiện lý do báo cáo', (await row.locator('[data-testid=admin-reasons]').count()) > 0);

  await confirmClick(row, 'admin-dismiss');
  check('Bỏ qua báo cáo xong khách vẫn xem được game', (await status(anonCtx, gameUrl)) === 200);
}

// ---------- Vòng 2: đủ ba báo cáo thì tự ẩn ----------
{
  const c = await childCtx.newPage();
  check('Báo cáo mới #1 (tài khoản bé)', (await submitReport(c, gameUrl, 'DANG_SO')) === 'cam-on');
  await c.close();

  const g = await anonCtx.newPage();
  check('Báo cáo mới #2 (khách vãng lai)', (await submitReport(g, gameUrl, 'NOI_XAU')) === 'cam-on');
  await g.close();

  const b = await parentBCtx.newPage();
  check('Báo cáo mới #3 (phụ huynh khác)', (await submitReport(b, gameUrl, 'CHEP_BAI')) === 'cam-on');
  await b.close();

  check('Đủ 3 báo cáo thì game tự ẩn, khách vào trả 404', (await status(anonCtx, gameUrl)) === 404);
}

// ---------- Admin xem được game đã ẩn để còn phán xử ----------
{
  const res = await admin.goto(gameUrl, { waitUntil: 'networkidle' });
  check('Admin mở được game đã ẩn (không bị 404 như khách)', res?.status() === 200, `HTTP ${res?.status()}`);
  check(
    'Trang game cảnh báo rõ đây là chế độ xem của admin',
    (await admin.locator('[data-testid=admin-preview-banner]').count()) > 0
  );
  check(
    'Game đã ẩn thì không còn nút báo cáo',
    (await admin.locator('[data-testid=report-box]').count()) === 0
  );
}

// ---------- Lịch sử kiểm duyệt và bộ lọc ----------
{
  await admin.goto(`${APP}/admin`, { waitUntil: 'networkidle' });
  const row = admin.locator(`[data-testid=admin-game][data-game-id="${gameId}"]`);
  await row.locator('[data-testid=admin-log] summary').click();
  const logText = await row.locator('[data-testid=admin-log]').innerText();
  check('Lịch sử kiểm duyệt ghi lại lần hệ thống tự ẩn', /Hệ thống tự ẩn/.test(logText));
  check('Lịch sử ghi lại lần admin bỏ qua báo cáo', /bỏ qua báo cáo/i.test(logText));
  check('Lịch sử hiện email admin chứ không phải id thô', logText.includes(ADMIN_EMAIL));

  /*
   * Đọc từng bộ lọc bằng cách đi thẳng URL, KHÔNG bấm tab rồi chờ `networkidle`.
   * Điều hướng của next/link là RSC phía client: `networkidle` trả về trước khi DOM
   * kịp đổi, nên đọc ngay sau đó là đọc trúng số của trang CŨ — phép kiểm sẽ xanh
   * giả vì đang so một con số với chính nó.
   */
  const num = (s) => Number(s.match(/^(\d+)/)?.[1] ?? -1);
  const totalOf = async (loc) => {
    await admin.goto(`${APP}/admin?loc=${loc}`, { waitUntil: 'networkidle' });
    const activeTab = await admin.locator('[aria-current=page]').innerText().catch(() => '');
    const total = num(await admin.locator('[data-testid=admin-total]').innerText());
    return { total, activeTab };
  };

  const canXem = await totalOf('can-xem');
  const tatCa = await totalOf('tat-ca');
  const dangHien = await totalOf('dang-hien');
  const daAn = await totalOf('da-an');
  const daGo = await totalOf('da-go');

  check('Tab đang chọn được đánh dấu aria-current', tatCa.activeTab === 'Tất cả', tatCa.activeTab);
  // Bất biến thật: ba trạng thái rời nhau phải cộng lại đúng bằng tổng.
  check(
    'Ba bộ lọc theo trạng thái cộng lại đúng bằng "Tất cả"',
    dangHien.total + daAn.total + daGo.total === tatCa.total && tatCa.total > 0,
    `${dangHien.total} hiện + ${daAn.total} ẩn + ${daGo.total} gỡ = ${tatCa.total}`
  );
  check(
    '"Cần xem" là tập con thực sự của "Tất cả"',
    canXem.total <= tatCa.total,
    `cần xem ${canXem.total} / tất cả ${tatCa.total}`
  );
  check('Game vừa bị tự ẩn nằm trong bộ lọc "Đang ẩn"', daAn.total >= 1, `${daAn.total} game đang ẩn`);
}

// ---------- Admin khoá thẳng tài khoản bé ----------
{
  await admin.goto(`${APP}/admin`, { waitUntil: 'networkidle' });
  const row = admin.locator(`[data-testid=admin-game][data-game-id="${gameId}"]`);
  await confirmClick(row, 'admin-child-lock');

  const c = await childCtx.newPage();
  await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  check('Admin khoá bé thì phiên đang mở của bé mất hiệu lực ngay', /be-dang-nhap/.test(c.url()), c.url());
  await c.close();

  /*
   * Khoá tài khoản là thao tác nặng nhất admin làm được, nên nó PHẢI để lại vết.
   * Trước đây không có vết, vì ModerationLog bắt buộc phải gắn với một gameId.
   *
   * Vết của tài khoản nằm ở danh sách RIÊNG, không lẫn vào lịch sử của game:
   * "gỡ một game" và "chặn một đứa trẻ đăng nhập" là hai mức độ khác nhau.
   */
  await admin.goto(`${APP}/admin`, { waitUntil: 'networkidle' });
  const afterLock = admin.locator(`[data-testid=admin-game][data-game-id="${gameId}"]`);
  await afterLock.locator('[data-testid=admin-child-log] summary').click();
  const childLog = await afterLock.locator('[data-testid=admin-child-log]').innerText();
  check('Khoá tài khoản để lại vết trong lịch sử tài khoản', /khoá tài khoản của bé/i.test(childLog));
  check('Vết khoá tài khoản ghi rõ admin nào làm', childLog.includes(ADMIN_EMAIL));

  await afterLock.locator('[data-testid=admin-log] summary').click();
  const gameLog = await afterLock.locator('[data-testid=admin-log]').innerText();
  check(
    'Vết khoá tài khoản KHÔNG lẫn vào lịch sử kiểm duyệt của game',
    !/khoá tài khoản/i.test(gameLog)
  );
}

// ---------- Admin cho hiện lại ----------
{
  await admin.goto(`${APP}/admin`, { waitUntil: 'networkidle' });
  const row = admin.locator(`[data-testid=admin-game][data-game-id="${gameId}"]`);
  await confirmClick(row, 'admin-restore');

  check('Admin cho hiện lại thì khách xem được game', (await status(anonCtx, gameUrl)) === 200);

  await admin.goto(`${APP}/admin`, { waitUntil: 'networkidle' });
  const stillListed = await admin
    .locator(`[data-testid=admin-game][data-game-id="${gameId}"]`)
    .count();
  check('Cho hiện lại đã xoá số đếm báo cáo (game rời khỏi mục Cần xem)', stillListed === 0);
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
