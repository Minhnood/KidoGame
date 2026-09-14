/**
 * Kiểm Umami trên BẢN ĐANG CHẠY THẬT: có đếm được, và không mở ra thứ gì không nên mở.
 *
 * VÌ SAO có bộ riêng: Umami chỉ tồn tại trong stack Docker, máy dev không có. Mọi lời
 * hứa của nó nằm ở ba tầng khác nhau — Caddy (mở đường nào), layout (chèn thẻ nào,
 * ở đâu), và chính Umami (mật khẩu, bộ lọc) — và hỏng ở tầng nào cũng không làm web
 * đỏ: trang vẫn 200, chỉ là đếm sai, hoặc tệ hơn, trang quản trị Umami lộ ra app domain.
 *
 * KHÔNG LÀM BẨN SỐ LIỆU: không gửi lượt xem nào bằng tên trình duyệt thật. Phép kiểm
 * gửi dùng tên `HeadlessChrome`, thứ Umami nhận lịch sự bằng `{"beep":"boop"}` rồi bỏ.
 * Đã đo 14/9: Playwright headless KHÔNG BAO GIỜ được đếm vì đúng lý do này — nên đừng
 * dùng Playwright mặc định để hỏi "Umami có ghi không", nó luôn trả lời "không".
 *
 * Chạy (từ máy Mac, cần mạng):
 *   node infra/umami-check.mjs
 *
 * Đổi đích:  APP=https://app.kidogame.vn STATS=https://stats.kidogame.vn ADMIN=https://admin.kidogame.vn node infra/umami-check.mjs
 */
const APP = process.env.APP ?? 'https://app.37-60-251-95.sslip.io';
const STATS = process.env.STATS ?? 'https://stats.37-60-251-95.sslip.io';
const ADMIN = process.env.ADMIN ?? 'https://admin.37-60-251-95.sslip.io';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const lay = async (url, init) => {
  try {
    const r = await fetch(url, { redirect: 'manual', ...init });
    return { status: r.status, type: r.headers.get('content-type') ?? '', csp: r.headers.get('content-security-policy') ?? '', text: await r.text() };
  } catch (e) {
    return { status: 0, type: '', csp: '', text: String(e) };
  }
};

console.log('\n── App domain chỉ mở đúng hai đường ────────────────────────');
{
  const s = await lay(`${APP}/_stats/script.js`);
  check('/_stats/script.js trả JavaScript', s.status === 200 && /javascript/.test(s.type), `${s.status} ${s.type}`);

  /*
   * Caddy chỉ proxy `script.js` và `api/send`. Mọi đường khác dưới `/_stats` phải
   * rơi xuống Next và 404 — nếu ai đổi Caddyfile thành proxy nguyên `/_stats/*` thì
   * trang đăng nhập và API quản trị của Umami nằm chung origin với trẻ em.
   */
  for (const d of ['/_stats/api/auth/login', '/_stats/api/websites', '/_stats/api/me', '/_stats/api/heartbeat', '/_stats/login']) {
    const r = await lay(`${APP}${d}`, { method: d.includes('login') && d.includes('api') ? 'POST' : 'GET' });
    check(`${d} KHÔNG tới được Umami trên app domain`, r.status === 404, `${r.status}`);
  }
}

console.log('\n── Thẻ script trong trang ──────────────────────────────────');
{
  const home = await lay(`${APP}/`);
  const the = home.text.match(/<script[^>]*_stats\/script\.js[^>]*>/)?.[0] ?? '';
  /* Đếm THẺ, không đếm chuỗi: HTML của Next còn nhúng dữ liệu RSC, trong đó props của
     thẻ này xuất hiện lần nữa dưới dạng JSON — bản đầu đếm chuỗi và đỏ oan ở 2. */
  const soThe = (home.text.match(/<script[^>]*_stats\/script\.js/g) ?? []).length;
  check('Trang chủ có đúng một thẻ script Umami', soThe === 1, `${soThe} thẻ`);
  /* strict-dynamic bỏ qua 'self': thiếu nonce là thẻ bị chặn dù file cùng domain. */
  check('… mang nonce', /\snonce="[^"]+"/.test(the));
  check('… KHÔNG ghi query string (chữ trẻ gõ vào ô tìm kiếm)', /data-exclude-search="true"/.test(the));
  check('… tôn trọng Do Not Track', /data-do-not-track="true"/.test(the));
  /* Thiếu host-url thì tracker gửi về `/api/send` của Next — 404, và không đếm được gì. */
  check('… gửi về /_stats trên chính app domain', the.includes(`data-host-url="${APP}/_stats"`), the.match(/data-host-url="[^"]*"/)?.[0] ?? 'không có');
  check(
    'CSP của app vẫn chỉ connect-src \'self\' (không mở host nào cho analytics)',
    /connect-src 'self'(;|$)/.test(home.csp),
    home.csp.match(/connect-src[^;]*/)?.[0] ?? 'không có CSP'
  );

  const adm = await lay(`${ADMIN}/admin/dang-nhap`);
  check('Khu quản trị KHÔNG có script Umami', adm.status === 200 && !adm.text.includes('_stats/script.js'), `${adm.status}`);
}

console.log('\n── Dashboard ───────────────────────────────────────────────');
{
  const hb = await lay(`${STATS}/api/heartbeat`);
  check('Dashboard sống', hb.status === 200, `${hb.status} ${hb.text.slice(0, 20)}`);

  /*
   * Mật khẩu mặc định `admin` / `umami` phải hết hiệu lực. Tên miền dashboard nằm
   * trong nhật ký cấp chứng chỉ công khai, và máy dò tới trong vòng một phút sau khi
   * Caddy xin chứng chỉ — đã thấy trong log ngày 14/9.
   */
  const dn = await lay(`${STATS}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'umami' }),
  });
  check('Mật khẩu mặc định admin/umami KHÔNG vào được', dn.status === 401 || dn.status === 400 || dn.status === 403, `${dn.status}`);
}

console.log('\n── Gửi lượt xem (bằng tên trình duyệt bot — không làm bẩn số liệu) ──');
{
  const id = (await lay(`${APP}/`)).text.match(/data-website-id="([^"]+)"/)?.[1] ?? '';
  const r = await lay(`${APP}/_stats/api/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({ type: 'event', payload: { website: id, hostname: new URL(APP).hostname, url: '/umami-check', title: 'umami-check', language: 'vi', screen: '1x1' } }),
  });
  /* 200 + beep/boop nghĩa là đường gửi thông suốt tới tận Umami, và Umami đã nhận ra bot. */
  check('/_stats/api/send tới được Umami', r.status === 200 && /beep/.test(r.text), `${r.status} ${r.text.slice(0, 30)}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
