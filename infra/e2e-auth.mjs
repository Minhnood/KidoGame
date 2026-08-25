/**
 * Kiểm tra end-to-end phần đăng nhập / phân quyền (M2).
 *
 * Cần app server đang chạy. Tự tạo tài khoản mới với email ngẫu nhiên nên chạy
 * lại nhiều lần được mà không dọn DB.
 *
 * Chạy:
 *   node infra/e2e-auth.mjs
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const FIXTURE = process.env.SB3_FIXTURE ?? '';

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-${suffix}@kidogame.test`;
const PARENT_PASS = 'matkhau-dai-1234';
const CHILD_USER = `e2e${suffix}`;
const CHILD_PASS = 'be1234';

const results = [];
/*
 * LƯU Ý: luôn khoanh click submit vào đúng form. Thanh điều hướng có nút "Đăng
 * xuất" cũng là <button type=submit>, nên `click('button[type=submit]')` sẽ bấm
 * trúng nút đó và đăng xuất giữa bài test — biểu hiện là test đổ ở chỗ khác hẳn.
 */
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

/** Mỗi context là một "trình duyệt" riêng -> phiên không lẫn vào nhau. */
const newSession = () => browser.newContext({ viewport: { width: 1100, height: 950 } });

// ---------- Chưa đăng nhập thì không vào được trang cần quyền ----------
{
  const ctx = await newSession();
  const p = await ctx.newPage();

  await p.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  check('Chưa đăng nhập: /upload chuyển sang trang đăng nhập của bé', /be-dang-nhap/.test(p.url()), p.url());

  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  check('Chưa đăng nhập: /phu-huynh chuyển sang trang đăng nhập', /dang-nhap/.test(p.url()), p.url());

  // API phải tự bảo vệ, không dựa vào việc UI đã chặn.
  const status = await p.evaluate(async (app) => {
    const fd = new FormData();
    fd.set('title', 'Không được phép');
    fd.set('file', new File([new Uint8Array([1, 2, 3])], 'x.sb3'));
    const r = await fetch(`${app}/api/upload`, { method: 'POST', body: fd });
    return r.status;
  }, APP);
  check('Chưa đăng nhập: POST /api/upload trả 401', status === 401, `HTTP ${status}`);

  await ctx.close();
}

// ---------- Phụ huynh đăng ký rồi tạo tài khoản cho con ----------
const parentCtx = await newSession();
{
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PARENT_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  check('Phụ huynh đăng ký xong vào được trang quản lý', /phu-huynh/.test(p.url()), p.url());

  // Mật khẩu quá ngắn phải bị từ chối.
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  await p.fill('#displayName', 'Bé Test');
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', '123');
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForTimeout(1500);
  const shortPassBlocked =
    (await p.locator('form [role=alert]').count()) > 0 ||
    (await p.locator('#password:invalid').count()) > 0;
  check('Mật khẩu quá ngắn của bé bị từ chối', shortPassBlocked);

  // Tạo thật.
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  await p.fill('#displayName', 'Bé Test');
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', CHILD_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForTimeout(2500);
  await p.reload({ waitUntil: 'networkidle' });
  check(
    'Tạo được tài khoản cho bé',
    (await p.locator(`text=${CHILD_USER}`).count()) > 0,
    CHILD_USER
  );

  // Phụ huynh KHÔNG được đăng game hộ con.
  await p.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  const parentUploadBlocked =
    (await p.locator('input[type=file]').count()) === 0 &&
    (await p.locator('text=tài khoản của bé').count()) > 0;
  check('Phụ huynh không thấy form đăng game, có hướng dẫn thay thế', parentUploadBlocked);
}

// ---------- Bé đăng nhập và đăng game ----------
const childCtx = await newSession();
let gameUrl = '';
{
  const p = await childCtx.newPage();
  await p.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });

  // Sai mật khẩu trước.
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', 'sai-mat-khau');
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForSelector('form [role=alert]', { timeout: 15000 }).catch(() => {});
  const wrongMsg = await p.locator('form [role=alert]').first().innerText().catch(() => '');
  check('Sai mật khẩu bị từ chối, không tiết lộ tài khoản có tồn tại', /không đúng/i.test(wrongMsg), wrongMsg.replace(/\n/g, ' '));

  // Đúng mật khẩu.
  await p.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', CHILD_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});
  check('Bé đăng nhập được', !/be-dang-nhap/.test(p.url()), p.url());
  check(
    'Thanh điều hướng hiện tên bé',
    (await p.locator('text=Bé Test').count()) > 0 || (await p.locator('text=Đăng game').count()) > 0
  );

  // Kiểm THUỘC TÍNH của cookie phiên thật. Đây là nền của việc tách origin:
  // nếu cookie có `domain` thì nó sẽ lọt sang player origin và toàn bộ lớp cách
  // ly sụp, mà không có biểu hiện gì trên giao diện.
  const cookies = await childCtx.cookies();
  const session = cookies.find((c) => c.name === 'kidogame_session');
  check('Cookie phiên tồn tại', !!session);
  if (session) {
    check('Cookie phiên là host-only (domain không có dấu chấm đầu)', !session.domain.startsWith('.'), session.domain);
    check('Cookie phiên httpOnly (JS không đọc được)', session.httpOnly === true);
    check('Cookie phiên sameSite=Lax (chặn POST từ site khác)', session.sameSite === 'Lax', String(session.sameSite));
    const visibleToJs = await p.evaluate(() => document.cookie);
    check('document.cookie không chứa token phiên', !visibleToJs.includes('kidogame_session'), visibleToJs || '(rỗng)');
  }

  if (FIXTURE) {
    await p.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
    await p.fill('#title', `Game của bé ${suffix}`);
    await p.setInputFiles('#file', FIXTURE);
    await p.click('[data-testid=upload-form] button[type=submit]');
    await p.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
    gameUrl = p.url();
    check('Bé đăng game thành công', /\/game\//.test(gameUrl), gameUrl);

    const credit = await p.locator('[data-testid=page-lead]').first().innerText().catch(() => '');
    check('Game ghi công đúng tên bé', /Bé Test/.test(credit), credit);
  }
}

// ---------- Phụ huynh ẩn game của con ----------
if (gameUrl) {
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  await p.locator('button:has-text("Ẩn game")').first().click();
  await p.waitForTimeout(2500);

  const anon = await browser.newContext();
  const guest = await anon.newPage();
  const res = await guest.goto(gameUrl, { waitUntil: 'networkidle' });
  check('Game bị ẩn thì khách vào trả 404', res?.status() === 404, `HTTP ${res?.status()}`);
  await anon.close();
}

// ---------- Khoá tài khoản là thu hồi phiên đang mở ----------
if (gameUrl) {
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  await p.locator('button:has-text("Tạm khoá tài khoản")').first().click();
  await p.waitForTimeout(2500);

  // Dùng lại đúng context của bé — phiên cũ phải mất hiệu lực NGAY.
  const childPage = await childCtx.newPage();
  await childPage.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  check(
    'Khoá tài khoản: phiên đang mở của bé mất hiệu lực ngay',
    /be-dang-nhap/.test(childPage.url()),
    childPage.url()
  );
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
