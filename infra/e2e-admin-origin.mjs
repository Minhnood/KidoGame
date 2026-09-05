/**
 * Khu quản trị nằm trên ORIGIN RIÊNG với phiên riêng — kiểm rằng nó thật sự tách.
 *
 * VÌ SAO CẦN MỘT BỘ KIỂM RIÊNG. Cơ chế này hỏng im lặng và hỏng theo hướng an toàn
 * giả: nếu `requireAdmin` lỡ quay về đọc cookie phiên site, hoặc middleware ngừng
 * chặn theo host, thì mọi thứ vẫn CHẠY ĐÚNG với người dùng thật — admin vẫn vào
 * được, vẫn ẩn được game. Chỉ có lớp phòng thủ là mất. Không phép kiểm nào khác
 * trong repo nhìn thấy điều đó.
 *
 * Điều đang bảo vệ: app origin render tên game và mô tả do TRẺ EM nhập, nên đó là
 * đường XSS đáng lo nhất của dự án. Trước khi tách, một lỗ XSS ở đó đọc được phiên
 * quản trị và POST được tới tám server action ẩn game, gỡ hẳn, khoá tài khoản.
 *
 * Chạy:
 *   ADMIN_ORIGIN=http://admin.localhost:3000 node infra/e2e-admin-origin.mjs
 *
 * Cần `db:seed` đã chạy (tài khoản demo có isAdmin), và cần ADMIN_ORIGIN được đặt
 * cho CẢ server dev — không đặt thì middleware giữ hành vi cũ và bộ này báo đỏ đúng.
 */
import { chromium } from 'playwright';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const ADMIN = process.env.ADMIN_ORIGIN ?? 'http://admin.localhost:3000';
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@kidogame.local';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo1234ab';

let pass = 0;
let fail = 0;
const check = (ten, ok, chiTiet = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '✅' : '❌'} ${ten}${chiTiet ? ` — ${chiTiet}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

/** Đăng nhập ở cửa site. Trả về true nếu vào được /phu-huynh. */
async function dangNhapSite(page) {
  await page.goto(`${APP}/dang-nhap`, { waitUntil: 'load' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/phu-huynh', { timeout: 30000 }).catch(() => {});
  return page.url().includes('/phu-huynh');
}

/** Đăng nhập ở cửa quản trị. Trả về true nếu vào được /admin. */
async function dangNhapAdmin(page) {
  await page.goto(`${ADMIN}/admin/dang-nhap`, { waitUntil: 'load' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname === '/admin', { timeout: 30000 }).catch(() => {});
  return new URL(page.url()).pathname === '/admin';
}

// ---------------------------------------------------------------------------
// 1. Mỗi origin chỉ phục vụ phần của nó
// ---------------------------------------------------------------------------
console.log('\n── Hai origin, hai phần việc ───────────────────────────────');
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();

  const status = async (url) => (await p.request.get(url, { maxRedirects: 0 })).status();

  check('App origin: trang chủ mở được', (await status(`${APP}/`)) === 200);
  /*
   * 404 chứ không 403 và không redirect. 403 là xác nhận trang có tồn tại và đáng
   * dò tiếp; redirect sang admin origin là công bố khu quản trị nằm ở đâu cho bất
   * cứ ai gõ thử `/admin`.
   */
  check('App origin: /admin KHÔNG tồn tại', (await status(`${APP}/admin`)) === 404);
  check('App origin: /admin/loi KHÔNG tồn tại', (await status(`${APP}/admin/loi`)) === 404);

  check('Admin origin: cửa đăng nhập mở được', (await status(`${ADMIN}/admin/dang-nhap`)) === 200);
  /*
   * Chiều này quan trọng ngang chiều trên: nếu admin origin cũng phục vụ được
   * `/game/<id>` thì nó cũng render tên game do trẻ nhập — tức đường XSS mà việc
   * tách origin tồn tại để dựng rào chắn khỏi nó lại có mặt ngay trên origin đang
   * giữ cookie quản trị.
   */
  check('Admin origin: trang chủ KHÔNG tồn tại', (await status(`${ADMIN}/`)) === 404);
  check('Admin origin: /game/<id> KHÔNG tồn tại', (await status(`${ADMIN}/game/abc`)) === 404);
  check('Admin origin: /dang-nhap của site KHÔNG tồn tại', (await status(`${ADMIN}/dang-nhap`)) === 404);

  await ctx.close();
}

// ---------------------------------------------------------------------------
// 2. Phiên site không mở được khu quản trị
// ---------------------------------------------------------------------------
console.log('\n── Phiên site không phải phiên quản trị ────────────────────');
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();

  check('Đăng nhập được ở cửa site bằng tài khoản có isAdmin', await dangNhapSite(p));

  /*
   * PHÉP KIỂM QUAN TRỌNG NHẤT CỦA CẢ BỘ. Cùng một con người, cùng mật khẩu, đang
   * có phiên site hợp lệ VÀ có cờ isAdmin — vẫn phải đăng nhập lại ở cửa này.
   *
   * Nếu phép kiểm này đỏ thì việc tách origin chỉ còn là hai cái tên miền: phiên
   * site mở được khu quản trị nghĩa là bất cứ thứ gì chiếm được phiên site cũng
   * chiếm được quyền quản trị.
   */
  await p.goto(`${ADMIN}/admin`, { waitUntil: 'load' });
  check(
    'Phiên site KHÔNG mở được /admin, bị đẩy về cửa đăng nhập quản trị',
    p.url().includes('/admin/dang-nhap'),
    p.url()
  );

  const ck = await ctx.cookies();
  const cookieSite = ck.find((c) => /kidogame_session$/.test(c.name));
  check('Cookie phiên site là host-only', cookieSite ? !cookieSite.domain.startsWith('.') : false,
    cookieSite ? `${cookieSite.name}@${cookieSite.domain}` : '(không có)');
  check('Chưa có cookie phiên quản trị', !ck.some((c) => /kidogame_admin$/.test(c.name)));

  await ctx.close();
}

// ---------------------------------------------------------------------------
// 3. Đăng nhập ở cửa quản trị, và hai phiên sống song song độc lập
// ---------------------------------------------------------------------------
console.log('\n── Hai phiên song song, độc lập ────────────────────────────');
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();

  await dangNhapSite(p);
  check('Vào được /admin sau khi đăng nhập ở cửa quản trị', await dangNhapAdmin(p));

  const ck = await ctx.cookies();
  const cookieAdmin = ck.find((c) => /kidogame_admin$/.test(c.name));
  check('Cookie quản trị được đặt', !!cookieAdmin, cookieAdmin ? `${cookieAdmin.name}@${cookieAdmin.domain}` : '');
  check(
    'Cookie quản trị host-only trên đúng host quản trị',
    cookieAdmin ? cookieAdmin.domain === new URL(ADMIN).hostname : false,
    cookieAdmin?.domain ?? ''
  );
  check(
    'Cookie quản trị có tên KHÁC cookie site',
    !!cookieAdmin && !ck.some((c) => c.name === cookieAdmin.name && c.domain !== cookieAdmin.domain)
  );

  const who = await p.locator('[data-testid=admin-who]').innerText().catch(() => '');
  check('Thanh quản trị hiện email người đang đăng nhập', who.includes(EMAIL), who);

  // Phiên site vẫn phải còn: đây là hai phiên khác nhau của cùng một người.
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'load' });
  check('Phiên site còn hiệu lực sau khi đăng nhập quản trị', p.url().includes('/phu-huynh'), p.url());

  /*
   * Đăng xuất khỏi khu quản trị KHÔNG được đăng xuất người đó khỏi site: họ có thể
   * đang mở tab bên cạnh với tư cách phụ huynh của chính con mình.
   */
  await p.goto(`${ADMIN}/admin`, { waitUntil: 'load' });
  await p.locator('[data-testid=admin-logout]').click();
  await p.waitForURL((u) => u.pathname === '/admin/dang-nhap', { timeout: 30000 }).catch(() => {});
  check('Đăng xuất quản trị đưa về cửa đăng nhập', p.url().includes('/admin/dang-nhap'), p.url());

  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'load' });
  check(
    'Đăng xuất quản trị KHÔNG phá phiên site',
    p.url().includes('/phu-huynh'),
    p.url()
  );

  await ctx.close();
}

// ---------------------------------------------------------------------------
// 4. Server action quản trị không gọi được từ app origin
// ---------------------------------------------------------------------------
console.log('\n── Server action quản trị chỉ nghe cookie quản trị ─────────');
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await dangNhapSite(p);

  /*
   * Đây là hình dạng thật của kịch bản XSS: mã chạy trên app origin, mang theo
   * cookie của app origin, POST tới một server action quản trị.
   *
   * Không dựng lại một lời gọi server action đúng chuẩn (nó cần Next-Action id sinh
   * lúc build) — thứ cần kiểm là chốt quyền, và chốt đó nằm trước mọi việc khác.
   * Điều phải thấy: KHÔNG có 2xx nào và KHÔNG có game nào bị ẩn.
   */
  const res = await p.request.post(`${APP}/admin`, {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: 'gameId=bat-ky',
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  check(
    'POST tới /admin trên app origin không được nhận',
    res.status() === 404 || res.status() >= 400,
    `HTTP ${res.status()}`
  );

  await ctx.close();
}

// ---------------------------------------------------------------------------
// 5. Khung của site không chảy sang khu quản trị
// ---------------------------------------------------------------------------
console.log('\n── Khu quản trị không mặc khung của site ───────────────────');
{
  /*
   * 390px, tức khổ điện thoại — bề rộng DUY NHẤT mà nền chuyển sắc bật (dưới
   * 1280px). Đo ở khổ mặc định thì cả hai khu đều "không có dải" và phép kiểm xanh
   * vĩnh viễn mà không canh gì cả.
   *
   * Ba thứ trang trí khác (link nhảy, tranh hai bên lề, thanh điều hướng) đã tự
   * vắng mặt vì chúng là phần tử React trong nhánh `!laKhuQuanTri`. Nền chuyển sắc
   * là thứ khác hẳn: một luật CSS toàn cục bám vào <html>, thẻ dùng chung của mọi
   * trang. Nó rò được vì nó không đi qua nhánh nào cả.
   */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const p = await ctx.newPage();
  await dangNhapAdmin(p);

  const doNen = () =>
    p.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return { khu: document.documentElement.dataset.khu ?? null, dai: s.backgroundImage !== 'none' };
    });

  const admin = await doNen();
  check('Khu quản trị: <html> mang data-khu="quan-tri"', admin.khu === 'quan-tri', `khu=${admin.khu}`);
  check('Khu quản trị ở 390px: nền là màu đặc, không có dải trời-đất', admin.dai === false);

  await p.goto(`${ADMIN}/admin/loi`, { waitUntil: 'load' });
  check('Tab Lỗi ở 390px: cũng không có dải', (await doNen()).dai === false);

  /*
   * Chiều ngược lại, và nó không thừa: mọi phép trên đây cũng xanh y hệt nếu ai đó
   * xoá hẳn nền chuyển sắc khỏi `globals.css`. Phép này bắt trường hợp đó — cùng bề
   * rộng, cùng phiên, chỉ khác khu.
   */
  await p.goto(`${APP}/`, { waitUntil: 'load' });
  const site = await doNen();
  check('Trang site ở cùng 390px thì VẪN có dải', site.dai === true, `khu=${site.khu}`);

  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n── Kết ─────────────────────────────────────────────────────');
console.log(`${pass}/${pass + fail} kiểm tra đạt`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
