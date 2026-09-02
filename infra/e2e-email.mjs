/**
 * Kiểm tra end-to-end xác minh email và quên mật khẩu (M2.5).
 *
 * CÁCH LẤY LINK TRONG MAIL: khi không có `RESEND_API_KEY`, `src/lib/mail.ts` in
 * nguyên nội dung mail ra stdout của server thay vì gửi đi thật. Bài test đọc file
 * log của server để moi link ra. Nhờ vậy toàn bộ luồng kiểm được mà không cần API
 * key, không cần mạng, và không có nguy cơ gửi mail thật cho người thật.
 *
 * Chạy (server phải được khởi động với stdout đổ vào file):
 *   pnpm --filter @kidogame/web exec next dev -p 3000 > /tmp/kg-mail.log 2>&1 &
 *   MAIL_LOG=/tmp/kg-mail.log node infra/e2e-email.mjs
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const MAIL_LOG = process.env.MAIL_LOG;
/** Có thì kiểm thêm mail báo phụ huynh khi con đăng game. Không có thì bỏ qua phần đó. */
const FIXTURE = process.env.SB3_FIXTURE ?? '';

if (!MAIL_LOG || !fs.existsSync(MAIL_LOG)) {
  console.error(`Thiếu MAIL_LOG hoặc file không tồn tại: ${MAIL_LOG}`);
  console.error('Khởi động server với stdout đổ vào file rồi trỏ MAIL_LOG vào đó.');
  process.exit(2);
}

const suffix = randomBytes(4).toString('hex');
const EMAIL = `e2e-mail-${suffix}@kidogame.test`;
const PASS_OLD = 'matkhau-dai-1234';
const PASS_NEW = 'matkhau-moi-5678';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Link MỚI NHẤT khớp một đường dẫn, moi từ log server. */
function latestLink(path) {
  const log = fs.readFileSync(MAIL_LOG, 'utf8');
  const re = new RegExp(`https?://[^\\s│]+${path}\\?token=[A-Za-z0-9_-]+`, 'g');
  const all = log.match(re);
  return all ? all[all.length - 1] : null;
}

/**
 * Chờ một lá mail GỬI TỚI `to` mà nội dung khớp `re`.
 *
 * Cắt log theo từng khối mail rồi mới đối chiếu, chứ không grep cả file: grep cả
 * file thì "có email này ở đâu đó" và "có email này trong CÙNG lá thư đó" là một,
 * nên phép kiểm sẽ xanh cả khi mail gửi nhầm cho người khác.
 */
async function waitForMailTo(to, re, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const log = fs.readFileSync(MAIL_LOG, 'utf8');
    const found = log
      .split('┌─ MAIL')
      .slice(1)
      .some((block) => {
        const body = block.split('└─')[0] ?? '';
        const toLine = body.split('\n').find((line) => line.includes('tới:')) ?? '';
        return toLine.includes(to) && re.test(body);
      });
    if (found) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Log được ghi bất đồng bộ, nên chờ link xuất hiện thay vì đọc một phát. */
async function waitForLink(path, previous = null, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const link = latestLink(path);
    if (link && link !== previous) return link;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

const browser = await chromium.launch({ channel: 'chrome' });
const newSession = () => browser.newContext({ viewport: { width: 1100, height: 950 } });

async function login(ctx, email, password) {
  const p = await ctx.newPage();
  await p.goto(`${APP}/dang-nhap`, { waitUntil: 'networkidle' });
  await p.fill('#email', email);
  await p.fill('#password', password);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 15000 }).catch(() => {});
  const ok = /phu-huynh/.test(p.url());
  return { page: p, ok };
}

// ---------- Đăng ký -> tự gửi mail xác minh ----------
const parentCtx = await newSession();
let verifyLink = null;
{
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', EMAIL);
  await p.fill('#password', PASS_OLD);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  check('Đăng ký xong vào được trang quản lý', /phu-huynh/.test(p.url()), p.url());

  check(
    'Chưa xác minh thì trang quản lý có cảnh báo',
    (await p.locator('[data-testid=email-unverified]').count()) > 0
  );

  verifyLink = await waitForLink('/xac-minh-email');
  check('Đăng ký tự gửi mail xác minh', !!verifyLink, verifyLink ? 'có link' : 'không thấy link');
  await p.close();
}

// ---------- Bấm link xác minh ----------
if (verifyLink) {
  const p = await parentCtx.newPage();
  await p.goto(verifyLink, { waitUntil: 'networkidle' });
  const text = await p.locator('body').innerText();
  check('Bấm link xác minh thì báo thành công', /đã được xác minh/i.test(text));

  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  check(
    'Xác minh xong thì cảnh báo biến mất',
    (await p.locator('[data-testid=email-unverified]').count()) === 0
  );
  await p.close();

  // Token dùng một lần: bấm lại từ trình duyệt KHÁC (chưa đăng nhập) phải hỏng.
  const stranger = await newSession();
  const sp = await stranger.newPage();
  await sp.goto(verifyLink, { waitUntil: 'networkidle' });
  const strangerText = await sp.locator('body').innerText();
  check(
    'Link xác minh chỉ dùng được một lần',
    /không dùng được nữa/i.test(strangerText),
    strangerText.replace(/\n+/g, ' ').slice(0, 80)
  );
  await stranger.close();
}

// ---------- Con đăng game -> bố mẹ nhận mail ----------
/*
 * Phải chạy TRƯỚC phần đặt lại mật khẩu: việc đó thu hồi mọi phiên của phụ huynh,
 * nên `parentCtx` sau đó không tạo được tài khoản con nữa.
 *
 * Đây là lớp hậu kiểm ĐẦU TIÊN của cả sản phẩm. Game public ngay khi đăng, không
 * duyệt trước; nếu bố mẹ không được báo thì người phát hiện nội dung xấu đầu tiên
 * bắt buộc phải là một người lạ đã trót nhìn thấy nó.
 */
if (FIXTURE) {
  const CHILD_USER = `email${suffix}`;
  const CHILD_PASS = 'be1234';
  const GAME_TITLE = `Game bao bo me ${suffix}`;

  const p = await parentCtx.newPage();
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  await p.fill('#displayName', 'Bé Báo Tin');
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', CHILD_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForTimeout(2500);
  await p.close();

  const childCtx = await newSession();
  const c = await childCtx.newPage();
  await c.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c.fill('#username', CHILD_USER);
  await c.fill('#password', CHILD_PASS);
  await c.click('[data-testid=auth-form] button[type=submit]');
  await c.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});

  await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await c.fill('#title', GAME_TITLE);
  await c.fill('#description', 'Do infra/e2e-email.mjs tạo ra.');
  await c.setInputFiles('#file', FIXTURE);
  await c.click('[data-testid=upload-form] button[type=submit]');
  await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
  const gameUrl = c.url();
  check('Bé đăng được game', /\/game\//.test(gameUrl), gameUrl);
  await c.close();
  await childCtx.close();

  check(
    'Con đăng game thì bố mẹ nhận được mail báo',
    await waitForMailTo(EMAIL, new RegExp(GAME_TITLE))
  );
  check(
    'Mail báo có link tới đúng game vừa đăng',
    await waitForMailTo(EMAIL, new RegExp(gameUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
    gameUrl
  );
  /*
   * Lá thư phải chỉ ra LỐI ĐI, không chỉ đưa tin. Bố mẹ đọc xong mà thấy có gì
   * chưa ổn thì việc kế tiếp là ẩn game — nếu thư không nói ẩn ở đâu thì lớp hậu
   * kiểm dừng lại ngay ở chỗ nó vừa bắt đầu.
   */
  check(
    'Mail báo chỉ chỗ để bố mẹ tự ẩn game',
    await waitForMailTo(EMAIL, /\/phu-huynh/)
  );
} else {
  console.log('⏭  Bỏ qua phần mail báo phụ huynh (không có SB3_FIXTURE)');
}

// ---------- Quên mật khẩu: không được lộ email có tồn tại hay không ----------
{
  const anon = await newSession();
  const p = await anon.newPage();

  await p.goto(`${APP}/quen-mat-khau`, { waitUntil: 'networkidle' });
  await p.fill('#email', `khong-ton-tai-${suffix}@kidogame.test`);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForSelector('form [role=status]', { timeout: 15000 }).catch(() => {});
  const unknownMsg = await p.locator('form [role=status]').first().innerText().catch(() => '');

  await p.goto(`${APP}/quen-mat-khau`, { waitUntil: 'networkidle' });
  await p.fill('#email', EMAIL);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForSelector('form [role=status]', { timeout: 15000 }).catch(() => {});
  const knownMsg = await p.locator('form [role=status]').first().innerText().catch(() => '');

  check(
    'Email có thật và email không tồn tại nhận CÙNG một thông báo',
    unknownMsg.length > 0 && unknownMsg === knownMsg,
    unknownMsg.replace(/\n+/g, ' ').slice(0, 70)
  );
  await anon.close();
}

// ---------- Đặt lại mật khẩu ----------
const resetLink = await waitForLink('/dat-lai-mat-khau');
check('Yêu cầu đặt lại mật khẩu gửi được link', !!resetLink);

if (resetLink) {
  const anon = await newSession();
  const p = await anon.newPage();
  await p.goto(resetLink, { waitUntil: 'networkidle' });
  await p.fill('#password', PASS_NEW);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/dang-nhap/, { timeout: 20000 }).catch(() => {});
  check('Đổi mật khẩu xong bị đẩy về trang đăng nhập', /dang-nhap/.test(p.url()), p.url());
  await anon.close();

  // Mật khẩu cũ phải chết.
  const oldCtx = await newSession();
  const oldTry = await login(oldCtx, EMAIL, PASS_OLD);
  check('Mật khẩu cũ không đăng nhập được nữa', !oldTry.ok, oldTry.page.url());
  await oldCtx.close();

  // Mật khẩu mới phải dùng được.
  const newCtx = await newSession();
  const newTry = await login(newCtx, EMAIL, PASS_NEW);
  check('Mật khẩu mới đăng nhập được', newTry.ok, newTry.page.url());
  await newCtx.close();

  // Phiên cũ (mở từ lúc đăng ký) phải bị thu hồi.
  const stale = await parentCtx.newPage();
  await stale.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  check(
    'Đặt lại mật khẩu thu hồi phiên đang mở của phụ huynh',
    /dang-nhap/.test(stale.url()),
    stale.url()
  );
  await stale.close();

  // Link reset dùng lại lần hai phải hỏng.
  const again = await newSession();
  const ap = await again.newPage();
  await ap.goto(resetLink, { waitUntil: 'networkidle' });
  await ap.fill('#password', 'matkhau-khac-9999');
  await ap.click('[data-testid=auth-form] button[type=submit]');
  await ap.waitForSelector('form [role=alert]', { timeout: 15000 }).catch(() => {});
  const againMsg = await ap.locator('form [role=alert]').first().innerText().catch(() => '');
  check(
    'Link đặt lại mật khẩu chỉ dùng được một lần',
    /không dùng được nữa/i.test(againMsg),
    againMsg.replace(/\n+/g, ' ').slice(0, 70)
  );
  await again.close();
}

/* ---------- Hộp thư dev: /dev/thu ----------
 *
 * Trang này bày lại chính những lá thư mà transport `console` in ra log, và tách sẵn
 * link thành nút bấm được — để một CON NGƯỜI thử hoặc quay video được luồng "mở hòm
 * thư rồi bấm link", thay vì phải mò trong log của Next.
 *
 * Bài này kiểm nó ở CUỐI, sau khi mọi luồng mail đã chạy, nên hộp thư chắc chắn có
 * thư thật để soi.
 */
{
  const ctx = await newSession();
  const p = await ctx.newPage();
  await p.goto(`${APP}/dev/thu`, { waitUntil: 'networkidle' });

  check('Hộp thư dev mở được', p.url().includes('/dev/thu'), p.url());

  const soThu = await p.locator('[data-testid=dev-mail]').count();
  check('Hộp thư dev có thư của những luồng vừa chạy', soThu > 0, `${soThu} thư`);

  const tieuDe = await p.locator('[data-testid=dev-mail-subject]').allInnerTexts();
  check(
    'Hộp thư dev hiện cả thư xác minh và thư đặt lại mật khẩu',
    tieuDe.some((t) => /xác minh/i.test(t)) && tieuDe.some((t) => /mật khẩu/i.test(t)),
    tieuDe.slice(0, 3).join(' · ')
  );

  /*
   * Phép kiểm quan trọng nhất của mục này: link trong thư phải thành NÚT BẤM ĐƯỢC.
   * Đó là cả lý do trang tồn tại — token dài, đọc bằng mắt rồi gõ lại là không thể.
   */
  const link = await p.locator('[data-testid=dev-mail-link]').first().getAttribute('href');
  check(
    'Link trong thư thành nút bấm được, và không dính dấu câu ở đuôi',
    !!link && /^https?:\/\//.test(link) && !/[).,;:]$/.test(link),
    link ?? '(không có link nào)'
  );

  // Dọn: nút xoá là thứ dùng trước mỗi lần quay lại từ đầu.
  await p.locator('[data-testid=dev-mail-clear]').click();
  await p.waitForTimeout(1200);
  check(
    'Nút xoá dọn sạch hộp thư dev',
    (await p.locator('[data-testid=dev-mail]').count()) === 0,
    await p.locator('[data-testid=dev-mail-total]').innerText()
  );

  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
