/**
 * Kiểm cookie phiên trên BẢN PRODUCTION (stack Docker), không phải bản dev.
 *
 * VÌ SAO phải có bộ riêng: cookie phiên đổi hình dạng theo môi trường. Ở
 * production nó mang tiền tố `__Host-` và cờ `Secure`; ở dev thì không, vì
 * `dev-lan` chạy HTTP trần và cookie `Secure` sẽ không bao giờ được đặt. Nghĩa là
 * bảy bộ e2e còn lại — tất cả đều chạy ở dev — KHÔNG đi qua nhánh production lấy
 * một lần nào. Cả một nửa của cơ chế đăng nhập không có ai canh.
 *
 * Đó không phải lo xa. Ngay lần chạy đầu tiên bộ này đã bắt được một lỗi thật:
 * `jar.delete()` sinh cookie xoá KHÔNG kèm `Secure`, mà cookie `__Host-` thiếu
 * `Secure` thì trình duyệt từ chối cả lệnh xoá — nên đăng xuất không dọn được
 * cookie. Bản dev không thể nào thấy được điều đó.
 *
 * Chạy (cần stack Docker đang lên và đã seed):
 *   cd infra && docker compose up -d --build
 *   docker compose run --rm web pnpm --filter @kidogame/web db:deploy
 *   node infra/e2e-prod-cookie.mjs
 *
 * Đổi đích:  APP=https://app.kidogame.vn node infra/e2e-prod-cookie.mjs
 */
import { chromium } from 'playwright';

const APP = process.env.APP ?? 'https://app.localhost';
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@kidogame.local';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo1234ab';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ignoreHTTPSErrors: với app.localhost thì Caddy cấp chứng chỉ bằng CA nội bộ.
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();

// Bắt Set-Cookie thô. Cần đọc chuỗi thật chứ không chỉ trạng thái cookie cuối
// cùng: lỗi xoá-không-kèm-Secure chỉ nhìn thấy được ở đây.
const setCookieLines = [];
page.on('response', async (r) => {
  try {
    const h = await r.allHeaders();
    if (h['set-cookie']) setCookieLines.push(h['set-cookie']);
  } catch {
    /* response đã biến mất, bỏ qua */
  }
});

await page.goto(`${APP}/dang-nhap`, { waitUntil: 'networkidle' });
await page.fill('input[name=email]', EMAIL);
await page.fill('input[name=password]', PASSWORD);

/*
 * KHÔNG dùng Promise.all([waitForLoadState, click]).
 *
 * Đăng nhập là server action: nó trả 303 rồi trình duyệt mới điều hướng, nên
 * `networkidle` bắn lúc trang cũ còn nguyên đó. Viết theo kiểu ấy thì bộ kiểm báo
 * "đăng nhập bị đá về trang đăng nhập" và "không có cookie" trong khi sản phẩm
 * chạy đúng — một dương tính giả rất tốn thời gian.
 */
await page.click('button[type=submit]');
await page
  .waitForURL((u) => !u.pathname.startsWith('/dang-nhap'), { timeout: 15000 })
  .catch(() => {});
await page.waitForLoadState('networkidle');

check('Đăng nhập KHÔNG bị đá ngược về trang đăng nhập', !page.url().includes('/dang-nhap'), page.url());

const cookies = await ctx.cookies();
const session = cookies.find((c) => c.name.endsWith('kidogame_session'));
check('Có cookie phiên', !!session, session?.name ?? 'không thấy');

if (session) {
  check('Tên mang tiền tố __Host-', session.name === '__Host-kidogame_session', session.name);
  check('Cookie Secure', session.secure === true, String(session.secure));
  check('Cookie httpOnly', session.httpOnly === true, String(session.httpOnly));
  check('Cookie path là /', session.path === '/', session.path);
  // `__Host-` cấm thuộc tính Domain. Playwright trả host trần khi cookie là
  // host-only; dấu chấm ở đầu mới là dấu hiệu có Domain.
  check('Host-only (không có Domain)', !session.domain.startsWith('.'), session.domain);
}

// Cookie đúng hình dạng chưa đủ — phiên phải dùng được thật.
await page.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
check('Phiên dùng được: vào thẳng trang phụ huynh', !page.url().includes('/dang-nhap'), page.url());

// --- Đăng xuất ---
setCookieLines.length = 0;
const logout = page.locator('button:has-text("Đăng xuất")').first();
if (await logout.count()) {
  await logout.click();
  await page.waitForTimeout(3000);

  const after = (await ctx.cookies()).find((c) => c.name.endsWith('kidogame_session'));
  check('Đăng xuất xoá được cookie khỏi trình duyệt', !after, after ? 'vẫn còn' : 'đã sạch');

  // Kiểm thẳng chuỗi Set-Cookie: đây là chỗ lỗi thật đã nấp. Thiếu `Secure` thì
  // trình duyệt từ chối cả lệnh xoá, và cookie cũ ở lại vĩnh viễn.
  const del = setCookieLines.find((l) => l.includes('kidogame_session='));
  check(
    'Lệnh xoá cookie có kèm Secure',
    !!del && /Secure/i.test(del),
    del ? del.split(';').slice(1).join(';').trim().slice(0, 90) : 'không thấy Set-Cookie nào'
  );
} else {
  check('Tìm thấy nút Đăng xuất', false, 'không thấy nút');
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
