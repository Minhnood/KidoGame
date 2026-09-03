/**
 * Đi trọn con đường mà một phụ huynh thật phải đi, bằng một hòm thư thật.
 *
 * ĐÂY LÀ MỐC "XONG" CỦA CẢ DỰ ÁN. Không phải lúc deploy chạy, không phải lúc
 * `mail-check.mjs` xanh hết. Là lúc: đăng ký bằng hòm thư có thật → thư tới →
 * BẤM ĐƯỢC link → tạo được tài khoản cho con → con đăng nhập được.
 *
 * Vì sao phải có bước bấm tay: `mail-check.mjs --send` chỉ chứng minh Resend nhận
 * thư. Nó KHÔNG chứng minh thư tới hòm thư, không chứng minh thư thoát khỏi Spam,
 * và không chứng minh cái link trong thư trỏ đúng chỗ. Ba thứ đó chỉ có một con
 * người mở hòm thư ra mới trả lời được.
 *
 * Chạy:
 *   node infra/mail-journey.mjs --email ban@gmail.com
 *
 * Với Resend chưa xác minh domain thì CHỈ gửi được tới đúng hòm thư đã đăng ký
 * tài khoản Resend. Truyền đúng địa chỉ đó.
 *
 * Script sẽ dừng lại chờ bạn bấm link, rồi tự đi tiếp. Ctrl+C để bỏ giữa chừng.
 */
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const emailIdx = args.indexOf('--email');
const EMAIL = emailIdx >= 0 ? args[emailIdx + 1] : null;
const APP = process.env.APP ?? 'https://app.localhost';
// Chờ tối đa bao lâu cho người ta mở hòm thư và bấm link.
const WAIT_MINUTES = Number(process.env.WAIT_MINUTES ?? 10);

if (!EMAIL) {
  console.error('Thiếu --email. Ví dụ: node infra/mail-journey.mjs --email ban@gmail.com');
  process.exit(2);
}

// Mật khẩu dùng một lần cho tài khoản thử. Đủ dài để qua rule của app.
const PASSWORD = 'ThuNghiem' + Math.floor(Date.now() / 1000);
const CHILD_USER = 'bethu' + Math.floor(Math.random() * 100000);
const CHILD_PASSWORD = 'bethu1234';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();

console.log(`\nĐăng ký phụ huynh ${EMAIL} trên ${APP}\n`);

await page.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
await page.fill('input[name=email]', EMAIL);
await page.fill('input[name=password]', PASSWORD);
// `main button[type=submit]` — nút submit đầu tiên của TRANG là nút đăng xuất
// trên thanh điều hướng, không phải nút của form.
/*
 * Chờ ĐỔI URL, không chờ `networkidle`.
 *
 * Đăng ký là server action: nó trả 303 rồi trình duyệt mới điều hướng, nên
 * `networkidle` bắn lúc trang cũ còn nguyên và nút còn đang "Đang đăng ký…".
 * Đọc URL lúc đó thì thấy vẫn ở /dang-ky và tưởng là đăng ký lỗi. Đã vấp đúng
 * bẫy này hai lần — xem cả `e2e-prod-cookie.mjs`.
 */
await page.locator('main button[type=submit]').first().click();
await page
  .waitForURL((u) => !u.pathname.startsWith('/dang-ky'), { timeout: 30000 })
  .catch(() => {});
await page.waitForLoadState('networkidle');

const afterSignup = page.url();
check('Đăng ký không báo lỗi', !afterSignup.includes('/dang-ky'), afterSignup);

if (afterSignup.includes('/dang-ky')) {
  const err = await page.locator('main').innerText();
  console.log('\nTrang đăng ký nói:\n' + err.split('\n').filter(Boolean).slice(0, 8).join('\n'));
  console.log(
    '\nNếu là "email đã được dùng" thì tài khoản có sẵn từ lần thử trước — xoá đi rồi chạy lại:\n' +
      `  docker compose exec -T db psql -U kidogame -d kidogame -c "delete from \\"Parent\\" where email='${EMAIL}';"`
  );
  await browser.close();
  process.exit(1);
}

/** Khung tạo tài khoản con chỉ hiện khi email đã xác minh. Đó là cái cổng ta đang thử. */
async function coKhungTaoCon() {
  await page.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  return (await page.locator('input[name=username]').count()) > 0;
}

check('Chưa xác minh thì KHÔNG tạo được tài khoản con', !(await coKhungTaoCon()));

console.log(
  [
    '',
    '───────────────────────────────────────────────────────────',
    `  Mở hòm thư ${EMAIL} và BẤM link xác minh.`,
    '',
    '  Nhớ nhìn cả thư mục Spam. Thư vào Spam cũng tính là hỏng —',
    '  phụ huynh thật sẽ không đi tìm.',
    '',
    `  Link trỏ về ${APP}. Nếu đây là app.localhost thì phải bấm`,
    '  trên chính máy này, và chấp nhận cảnh báo chứng chỉ.',
    '',
    `  Đang chờ tối đa ${WAIT_MINUTES} phút…`,
    '───────────────────────────────────────────────────────────',
    '',
  ].join('\n')
);

const deadline = Date.now() + WAIT_MINUTES * 60_000;
let verified = false;
while (Date.now() < deadline) {
  if (await coKhungTaoCon()) {
    verified = true;
    break;
  }
  await page.waitForTimeout(5000);
  process.stdout.write('.');
}
console.log('');

check('Bấm link xong thì khung tạo tài khoản con hiện ra', verified, verified ? '' : 'hết giờ chờ');

if (verified) {
  /*
   * Dùng ID và `[data-testid=auth-form]`, TUYỆT ĐỐI không dùng
   * `input[name=password]`.
   *
   * Trên /phu-huynh, `input[name=password]` khớp BA phần tử: mỗi bé đã có mang
   * theo một form đổi mật khẩu, và những form đó đứng TRƯỚC form tạo con trong
   * DOM. Điền theo `name` là đi đổi mật khẩu của một đứa trẻ đang tồn tại thay vì
   * tạo bé mới. Đã đếm để chắc: `[data-testid=auth-form]`, `#username`,
   * `#password` đều duy nhất; `input[name=password]` thì 3 cái.
   *
   * Với tài khoản vừa đăng ký thì chưa có bé nào nên bẫy KHÔNG lộ ra — đúng kiểu
   * lỗi ngủ yên tới lúc ai đó chạy lại trên một tài khoản đã có con.
   *
   * Đây cũng chính là bộ selector mà `e2e-auth.mjs` đã dùng và đã chạy đúng.
   */
  await page.fill('#displayName', 'Bé Thử Nghiệm');
  await page.fill('#username', CHILD_USER);
  await page.fill('#password', CHILD_PASSWORD);
  const birthYear = page.locator('#birthYear');
  if (await birthYear.count()) await birthYear.fill('2016').catch(() => {});
  await page.click('[data-testid=auth-form] button[type=submit]');
  await page.waitForTimeout(2500);
  // PHẢI reload trước khi khẳng định: danh sách con render ở server, trang hiện
  // tại vẫn là bản trước khi thêm. Thiếu dòng này thì phép kiểm báo đỏ trong khi
  // tài khoản con đã tạo xong — đã vấp đúng vậy.
  await page.reload({ waitUntil: 'networkidle' });

  check(
    'Tạo được tài khoản con',
    (await page.locator(`text=${CHILD_USER}`).count()) > 0,
    CHILD_USER
  );

  // Con đăng nhập được mới là bằng chứng cuối: cả chuỗi đã thông.
  const childCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const childPage = await childCtx.newPage();
  await childPage.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  const loginForm = childPage.locator('form:has(input[name=username])');
  await loginForm.locator('input[name=username]').fill(CHILD_USER);
  await loginForm.locator('input[name=password]').fill(CHILD_PASSWORD);
  await loginForm.locator('button[type=submit]').first().click();
  await childPage
    .waitForURL((u) => !u.pathname.includes('be-dang-nhap'), { timeout: 15000 })
    .catch(() => {});
  check('Bé đăng nhập được', !childPage.url().includes('be-dang-nhap'), childPage.url());
  await childCtx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} bước đạt`);

if (!failed.length) {
  console.log(
    [
      '',
      'Đường mail đã thông từ đầu tới cuối: thư tới hòm thư thật, link bấm được,',
      'phụ huynh tạo được tài khoản cho con, và con đăng nhập được.',
      '',
      `Nhớ dọn tài khoản thử: xoá phụ huynh ${EMAIL} trong DB.`,
      '',
    ].join('\n')
  );
}

process.exit(failed.length === 0 ? 0 : 1);
