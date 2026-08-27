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
// Tài khoản bé do `pnpm db:seed` tạo — cần để thử luồng đăng game.
const CHILD_USERNAME = process.env.CHILD_USERNAME ?? 'beminh';
const CHILD_PASSWORD = process.env.CHILD_PASSWORD ?? 'be1234';

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

// Giữ lại để lát nữa soi header. Trang game không có thumbnail nên phải lấy ở đây.
const thumbUrl = await page.locator('[data-testid=game-card] img').first().getAttribute('src');

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

// ---------- Header của player origin ----------
/*
 * Soi thẳng bằng fetch, không qua trình duyệt.
 *
 * Đây là phần bảo mật KHÔNG có gì khác bắt được. Toàn bộ mô hình an toàn của
 * KidoGame dựa trên một câu: file do người lạ upload được phát từ một origin khác,
 * và KHÔNG BAO GIỜ được trình duyệt hiểu là HTML để chạy trên đó. Nếu ai sửa cấu
 * hình làm `.sb3` trả về `text/html`, mọi phép kiểm còn lại trong bộ này vẫn xanh —
 * game vẫn chạy, thumbnail vẫn hiện — trong khi vừa mở ra một lỗ thực thi mã.
 *
 * Đọc header chứ không tin file cấu hình: `infra/player-server.mjs` (dev) và
 * `infra/Caddyfile` (production) là HAI file phải giữ cùng một bộ header, và không
 * gì buộc chúng khớp nhau ngoài việc có người nhớ. Bộ e2e chỉ chạm được bản dev,
 * nên khi sửa một bên thì phải sửa cả bên kia — chính vì thế các phép kiểm dưới đây
 * viết theo TÍNH CHẤT cần có, để copy sang soi production bằng `curl -I` là xong.
 */
{
  const sb3Url = await page.locator('a[download]').first().getAttribute('href');

  /** Lấy header bằng HEAD — không cần tải cả file .sb3 về chỉ để đọc vài dòng. */
  const head = async (url) => {
    const res = await fetch(url, { method: 'HEAD' });
    const h = {};
    res.headers.forEach((v, k) => {
      h[k] = v;
    });
    return { status: res.status, h };
  };

  const sb3 = await head(sb3Url);
  const html = await head(frameSrc);
  const thumb = await head(thumbUrl);

  check('Ba loại file trên player origin đều phát được', [sb3, html, thumb].every((r) => r.status === 200), `sb3 ${sb3.status} · html ${html.status} · thumb ${thumb.status}`);

  /*
   * Phép kiểm QUAN TRỌNG NHẤT của cả bộ này.
   * .sb3 là file do người lạ upload. Trả về text/html là biến nó thành trang web
   * chạy được trên player origin — nơi đang phát HTML game thật, tức cùng origin
   * với chúng, tức đọc được mọi thứ của chúng.
   */
  check(
    '.sb3 KHÔNG được trả về dạng HTML',
    !/text\/html/i.test(sb3.h['content-type'] ?? ''),
    sb3.h['content-type'] ?? '(thiếu content-type)'
  );
  check(
    '.sb3 trả về application/octet-stream',
    /application\/octet-stream/i.test(sb3.h['content-type'] ?? ''),
    sb3.h['content-type'] ?? '(thiếu)'
  );
  check(
    '.sb3 có Content-Disposition attachment (tải về chứ không mở)',
    /attachment/i.test(sb3.h['content-disposition'] ?? ''),
    sb3.h['content-disposition'] ?? '(thiếu)'
  );

  // nosniff: thiếu nó thì trình duyệt tự đoán kiểu file theo nội dung, và mọi
  // khẳng định về Content-Type ở trên trở thành vô nghĩa.
  for (const [name, res] of [['.sb3', sb3], ['HTML game', html], ['thumbnail', thumb]]) {
    check(
      `${name} có X-Content-Type-Options: nosniff`,
      (res.h['x-content-type-options'] ?? '').toLowerCase() === 'nosniff',
      res.h['x-content-type-options'] ?? '(thiếu)'
    );
  }

  // scratch-vm fetch .sb3 cross-origin từ trong iframe. Thiếu CORS là game không
  // tải được project, và triệu chứng không hề chỉ vào header.
  check(
    '.sb3 có Access-Control-Allow-Origin (scratch-vm fetch cross-origin)',
    sb3.h['access-control-allow-origin'] === '*',
    sb3.h['access-control-allow-origin'] ?? '(thiếu)'
  );
  check(
    'thumbnail có Access-Control-Allow-Origin',
    thumb.h['access-control-allow-origin'] === '*',
    thumb.h['access-control-allow-origin'] ?? '(thiếu)'
  );
  check(
    'thumbnail trả về image/webp',
    /image\/webp/i.test(thumb.h['content-type'] ?? ''),
    thumb.h['content-type'] ?? '(thiếu)'
  );

  /*
   * frame-ancestors phải khớp ĐÚNG app origin.
   *
   * Đây là cái bẫy đã vấp nhiều lần: chạy e2e ở cổng khác 3000 mà quên đổi player
   * server thì iframe bị chặn, và triệu chứng là "game không boot" / "stage 0x0" —
   * nhìn y hệt lỗi đóng gói, dẫn người ta đi lục packages/sb3 hàng giờ. Phép kiểm
   * này biến cả chuỗi đó thành một dòng đỏ nói thẳng chỗ sai.
   */
  const csp = html.h['content-security-policy'] ?? '';
  check(
    'HTML game có Content-Security-Policy từ header',
    csp.length > 0,
    csp ? `${csp.slice(0, 60)}…` : '(thiếu)'
  );
  check(
    `CSP frame-ancestors khớp app origin (${APP})`,
    new RegExp(`frame-ancestors\\s+${APP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|;|$)`).test(csp),
    csp.match(/frame-ancestors[^;]*/)?.[0] ?? '(không có frame-ancestors)'
  );
  check(
    "CSP khoá connect-src để game không gửi dữ liệu ra ngoài",
    /connect-src 'self'/.test(csp),
    csp.match(/connect-src[^;]*/)?.[0] ?? '(không có connect-src)'
  );

  /*
   * Player origin chỉ được phát đúng dạng `/<bucket>/<2 ký tự đầu>/<sha256><ext>`.
   * Mọi thứ khác phải 404, kể cả khi file có thật ở đó. Ba dạng dưới đây thử đúng
   * ba mắt xích của bộ lọc: tên bucket, khuôn tên file, và phần mở rộng.
   */
  const sha = sb3Url.match(/([0-9a-f]{64})/)?.[1] ?? '0'.repeat(64);
  const badPaths = [
    ['ngoài mọi bucket', `${PLAYER}/package.json`],
    ['tên file không phải sha256', `${PLAYER}/html/aa/khong-phai-hash.html`],
    // Cùng một file có thật, chỉ đổi phần mở rộng: nếu lọt thì .sb3 phát ra dưới
    // dạng .html, đúng cái kịch bản mà toàn bộ mục này tồn tại để chặn.
    ['đúng hash nhưng sai phần mở rộng', `${PLAYER}/sb3/${sha.slice(0, 2)}/${sha}.html`],
  ];
  for (const [label, url] of badPaths) {
    const code = await fetch(url).then((r) => r.status).catch(() => 0);
    check(`Đường dẫn ${label} bị 404`, code === 404, `HTTP ${code}`);
  }
}

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
  // Từ M2, đăng game cần phiên của bé. Dùng tài khoản do `pnpm db:seed` tạo.
  await page.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await page.fill('#username', CHILD_USERNAME);
  await page.fill('#password', CHILD_PASSWORD);
  await page.click('[data-testid=auth-form] button[type=submit]');
  await page.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});
  check('Bé đăng nhập được bằng tài khoản seed', !/be-dang-nhap/.test(page.url()), page.url());

  await page.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await page.fill('#title', 'Game kiểm thử e2e');
  await page.fill('#description', 'Do infra/e2e-check.mjs tạo ra.');
  await page.setInputFiles('#file', FIXTURE);
  await page.click('[data-testid=upload-form] button[type=submit]');
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
  await page.click('[data-testid=upload-form] button[type=submit]');
  // Hộp lỗi có role=alert. PHẢI khoanh trong form: Next tự render một
  // route-announcer rỗng cũng mang role=alert, .first() sẽ bắt trúng cái đó.
  await page.waitForSelector('form [role=alert]', { timeout: 30000 }).catch(() => {});

  const errText = await page.locator('form [role=alert]').first().innerText().catch(() => '');
  /*
   * Khẳng định ĐÚNG thông báo, không chỉ "có lỗi nào đó".
   * Bản trước chỉ kiểm errText.length > 0 nên khi bé dính giới hạn 10 game/ngày,
   * phép kiểm vẫn báo xanh dù file độc hại chưa hề bị chặn vì lý do đúng.
   */
  check(
    'File HTML đổi tên .sb3 bị từ chối vì không phải file Scratch',
    /không phải file Scratch/i.test(errText) && !/\/game\//.test(page.url()),
    errText.replace(/\n/g, ' ')
  );
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
