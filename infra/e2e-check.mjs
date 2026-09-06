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

/*
 * Vi phạm CSP KHÔNG ném exception — trình duyệt chỉ ghi một dòng vào console rồi
 * lặng lẽ không chạy script đó. Nên `pageerror` ở trên không bắt được, mà hậu quả
 * lại đúng loại tệ nhất: trang vẫn hiện đủ, chỉ có mọi nút bấm không phản ứng.
 *
 * Đáng canh từ khi CSP chuyển sang dùng nonce (src/middleware.ts). Nonce sai một ly
 * là toàn bộ client component chết im lặng.
 */
const cspViolations = [];
page.on('console', (m) => {
  const text = m.text();
  if (/Content Security Policy/i.test(text)) cspViolations.push(text.slice(0, 200));
});

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

// Riêng iframe game bị chặn thì đã có phép kiểm "Game boot" bắt; ở đây quan tâm
// những vi phạm trên CHÍNH trang app, tức là nonce hỏng.
check(
  'Không có vi phạm CSP nào trên trang app',
  cspViolations.length === 0,
  cspViolations.join(' | ') || 'sạch'
);

/*
 * Nonce phải MỚI cho mỗi request. Dùng lại một nonce giữa các lần tải trang thì
 * kẻ tấn công chỉ cần đọc nonce một lần là dùng được cho lần sau, và cả cơ chế
 * thành vô nghĩa — mà từ bên ngoài nhìn vào mọi thứ vẫn chạy đúng.
 */
{
  const nonces = [];
  for (let i = 0; i < 3; i++) {
    const res = await fetch(APP, { headers: { 'cache-control': 'no-cache' } });
    nonces.push(res.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1] ?? '');
  }
  check(
    'CSP dùng nonce, KHÔNG dùng unsafe-inline cho script',
    nonces.every(Boolean),
    nonces[0] ? 'có nonce' : 'KHÔNG thấy nonce'
  );
  check(
    'Mỗi lần tải trang là một nonce khác nhau',
    new Set(nonces).size === nonces.length,
    nonces.map((n) => n.slice(0, 8)).join(', ')
  );
}

{
  const csp = (await fetch(APP)).headers.get('content-security-policy') ?? '';
  const scriptSrc = csp.match(/script-src[^;]*/)?.[0] ?? '';
  check(
    "script-src không còn 'unsafe-inline'",
    !scriptSrc.includes("'unsafe-inline'"),
    scriptSrc
  );
}

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

/* ---------- Runtime tách riêng: cân nặng của sản phẩm ----------
 *
 * Packager nhúng nguyên bộ scratch-vm vào TỪNG file HTML, nên trước bản tách thì
 * mọi game đều ~1800 KB — một đứa trẻ mở 5 game tải 5 lần cùng một thứ, ~19 giây
 * mỗi game trên 3G yếu. Runtime giờ là một file dùng chung, cache vĩnh viễn.
 *
 * Mục này canh đúng cái hỏng IM LẶNG: nếu runtime lặng lẽ quay vào HTML, hoặc URL
 * nhúng bị đổi thành có origin, hoặc cache-control mất `immutable` — thì mọi thứ
 * vẫn chạy, chỉ là chậm lại gấp ba mươi lần và không ai biết.
 */
{
  const htmlRes = await fetch(frameSrc);
  const htmlText = await htmlRes.text();

  /*
   * Đo bằng DẤU HIỆU NỘI DUNG, không bằng kích thước file. Bản đầu của phép kiểm này
   * viết `htmlText.length < 200_000` và nó SAI — đã trả giá hai lần bằng hai dòng đỏ
   * không tái hiện được, xem TODO.md.
   *
   * Lý do: HTML còn nhúng cả ASSET của game (ảnh, âm thanh, mã base85). Game
   * `siuuu` của chủ dự án nặng 9892 KB vì đúng lý do đó, và điều đó hoàn toàn ĐÚNG —
   * runtime đã tách rồi. Nên ngưỡng kích thước không đo cái nó tưởng nó đang đo, mà
   * đo xem game nào tình cờ đứng đầu trang chủ hôm ấy: một phép kiểm đỏ hay xanh
   * theo dữ liệu, tức tệ hơn không có phép kiểm.
   *
   * Chuỗi dưới đây là dòng đầu của khối runtime do packager sinh. Còn nó trong HTML
   * nghĩa là runtime vẫn nằm trong file, bất kể file nặng bao nhiêu.
   */
  const DAU_HIEU_RUNTIME = 'Parts of this script are from the TurboWarp Packager';
  check(
    'Runtime KHÔNG nằm trong file HTML',
    !htmlText.includes(DAU_HIEU_RUNTIME),
    `HTML ${(htmlText.length / 1024).toFixed(1)} KB (kích thước này là ASSET của game, không phải runtime)`
  );

  const src = htmlText.match(/<script\s+src="([^"]+)"><\/script>/)?.[1] ?? '';
  check(
    'HTML trỏ tới runtime dùng chung',
    /^\/runtime\/[0-9a-f]{2}\/[0-9a-f]{64}\.js$/.test(src),
    src || '(không có thẻ script src nào)'
  );

  /*
   * Đường dẫn phải tính từ gốc origin, KHÔNG kèm http://…
   * HTML là file tĩnh bất biến: nhúng origin của máy dev vào là file ấy hỏng trên
   * production, và hỏng im lặng — trang mở ra, khung game hiện, runtime 404.
   */
  check('Đường dẫn runtime không kèm origin', !/src="https?:\/\//.test(htmlText));

  const rtRes = await fetch(`${PLAYER}${src}`, { method: 'HEAD' });
  const rt = { status: rtRes.status, h: {} };
  rtRes.headers.forEach((v, k) => {
    rt.h[k] = v;
  });
  check('Runtime phát được từ player origin', rt.status === 200, `HTTP ${rt.status}`);
  check(
    // nosniff bật, nên sai Content-Type là trình duyệt từ chối chạy và stage trắng.
    'Runtime trả về text/javascript',
    /text\/javascript/i.test(rt.h['content-type'] ?? ''),
    rt.h['content-type'] ?? '(thiếu)'
  );
  check(
    'Runtime cache vĩnh viễn (immutable) — đây là điều làm game thứ hai gần như miễn phí',
    /immutable/.test(rt.h['cache-control'] ?? ''),
    rt.h['cache-control'] ?? '(thiếu)'
  );

  /*
   * Phép kiểm quan trọng nhất của mục này: mở một game KHÁC trong cùng phiên và đếm
   * byte thật của request tới `/runtime/` — phải gần bằng 0, vì nó lấy từ cache.
   *
   * Đếm RIÊNG runtime, không đếm tổng byte từ player origin. Bản đầu đếm tổng và so
   * với 200 KB, và sai đúng như phép kiểm ở trên: asset của game nằm trong HTML, nên
   * một game có nhiều ảnh và âm thanh làm tổng vọt lên hàng nghìn KB trong khi
   * runtime vẫn được dùng chung đúng như thiết kế.
   */
  const home = await context.newPage();
  await home.goto(APP, { waitUntil: 'networkidle' });
  const links = await home
    .locator('[data-testid=game-card]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
  const other = links.find((h) => h && !frameSrc.includes(h.split('/').pop() ?? ''));
  await home.close();

  if (!other || links.length < 2) {
    check('Có ít nhất hai game để đo hiệu quả của runtime dùng chung', false, `${links.length} game`);
  } else {
    const p2 = await context.newPage();
    let runtimeBytes = 0;
    let runtimeReqs = 0;
    p2.on('requestfinished', async (req) => {
      try {
        if (!req.url().startsWith(`${PLAYER}/runtime/`)) return;
        runtimeReqs += 1;
        runtimeBytes += (await req.sizes()).responseBodySize;
      } catch {
        /* request bị huỷ lúc đóng trang — bỏ qua */
      }
    });
    await p2.goto(`${APP}${other}`, { waitUntil: 'load' });
    await p2.waitForTimeout(4000);
    /*
     * Vẫn đòi CÓ request tới runtime: 0 request nghĩa là HTML không trỏ tới runtime
     * nào cả, và khi ấy "0 byte" là con số đúng của một trang hỏng.
     *
     * Playwright báo `responseBodySize` âm hoặc rất nhỏ cho response lấy từ cache,
     * nên ngưỡng 10 KB là "không đi qua mạng", không phải "tải một ít".
     */
    check(
      'Game THỨ HAI trong cùng phiên lấy runtime từ cache, không tải lại',
      runtimeReqs > 0 && runtimeBytes < 10_000,
      `${runtimeReqs} request runtime, ${(runtimeBytes / 1024).toFixed(1)} KB qua mạng`
    );
    await p2.close();
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

/* ----------------------------------------------------------------------------
 * Giao diện sáng / tối
 *
 * Dùng context RIÊNG cho mỗi chế độ vì `colorScheme` là thuộc tính của context,
 * không đổi được giữa đường.
 * -------------------------------------------------------------------------- */
{
  /*
   * Đọc ĐỘ SÁNG thay vì so chuỗi "rgb(...)" với một giá trị chép cứng.
   *
   * Bản trước chép cứng `rgb(246, 247, 251)`, và nó đổ ngay khi bảng màu được chỉnh
   * cho dịu mắt hơn — dù giao diện vẫn hoàn toàn đúng. Phép kiểm ở đây cần khẳng
   * định "sáng thì phải sáng, tối thì phải tối", chứ không phải khoá cứng một mã màu
   * mà việc tinh chỉnh màu là chuyện bình thường. Giá trị màu cụ thể đã có
   * `infra/contrast-check.mjs` canh riêng.
   */
  const doc = (p) =>
    p.evaluate(() => {
      const dosang = (css) => {
        const [r, g, b] = css.match(/\d+/g).slice(0, 3).map(Number);
        const lin = [r, g, b].map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
      };
      /*
       * NỀN đọc ở <html>, CHỮ đọc ở <body> — hai phần tử khác nhau, cố ý.
       *
       * Nền nằm ở <html> vì tranh trang trí hai bên lề là một phần tử z-index âm
       * trong <body>: để nền ở <body> thì trình duyệt lấy nó làm nền khung nhìn và
       * mọi thứ z-index âm bị vẽ ra sau nó (xem `globals.css`). Bản trước của phép
       * kiểm này đọc nền của <body>, nên sau khi chuyển nó đo được `rgba(0,0,0,0)`
       * cho CẢ hai giao diện — tức là hai giao diện "giống nhau" vì cùng đo nhầm
       * một chỗ trong suốt.
       */
      const csHtml = getComputedStyle(document.documentElement);
      const csBody = getComputedStyle(document.body);
      return {
        bg: csHtml.backgroundColor,
        ink: csBody.color,
        bgSang: dosang(csHtml.backgroundColor),
        inkSang: dosang(csBody.color),
        theme: document.documentElement.dataset.theme ?? '',
      };
    });

  const mo = async (colorScheme) => {
    const ctx = await browser.newContext({ colorScheme, viewport: { width: 1100, height: 900 } });
    const p = await ctx.newPage();
    /*
     * Lệch hydration hiện ra ở console.error, KHÔNG phải `pageerror`. Đáng canh
     * riêng vì chính chỗ này đã vấp thật hai lần khi làm giao diện tối: một lần do
     * tự viết thẻ <head>, một lần do trình duyệt xoá thuộc tính `nonce` khỏi DOM.
     * Cả hai lần trang vẫn hiện đúng — không có phép kiểm nào đỏ, chỉ có console.
     */
    const loi = [];
    p.on('console', (m) => {
      if (m.type() === 'error' && /hydrat/i.test(m.text())) loi.push(m.text().slice(0, 120));
    });
    await p.goto(APP, { waitUntil: 'networkidle' });
    return { ctx, p, loi };
  };

  const sang = await mo('light');
  const toi = await mo('dark');
  const dSang = await doc(sang.p);
  const dToi = await doc(toi.p);

  check('Máy ở chế độ sáng: trang dùng bảng màu sáng', dSang.bgSang > 0.8, dSang.bg);
  check('Máy ở chế độ tối: trang tự dùng bảng màu tối', dToi.bgSang < 0.06, dToi.bg);
  /*
   * Nền tối phải đi cùng CHỮ sáng. Nếu chỉ kiểm nền thì một bảng màu tối mà quên
   * đảo màu chữ vẫn xanh — và đó đúng là trường hợp trang không đọc được.
   */
  check('Giao diện tối: chữ sáng hơn nền rõ rệt', dToi.inkSang > 0.7, dToi.ink);
  check('Giao diện sáng: chữ tối hơn nền rõ rệt', dSang.inkSang < 0.06, dSang.ink);
  /*
   * Không chỉ kiểm nền: nếu chỉ nền đổi mà chữ không đổi thì trang thành chữ tối
   * trên nền tối — vẫn "có giao diện tối", và vẫn không đọc được.
   */
  check('Giao diện tối cũng đảo màu CHỮ, không chỉ nền', dToi.ink !== dSang.ink, `${dSang.ink} -> ${dToi.ink}`);
  check(
    'Theo máy thì KHÔNG ghi data-theme (để máy đổi sáng/tối là trang đổi theo)',
    dToi.theme === '' && dSang.theme === '',
    `sáng="${dSang.theme}" tối="${dToi.theme}"`
  );

  // Nút đổi giao diện: ba trạng thái, và lựa chọn của người dùng thắng cài đặt máy.
  const nut = toi.p.locator('[data-testid=theme-toggle]');
  const vong = [];
  for (let i = 0; i < 3; i++) {
    await nut.click();
    await toi.p.waitForTimeout(200);
    vong.push(await nut.getAttribute('data-theme-choice'));
  }
  check('Nút đổi giao diện xoay đủ ba trạng thái rồi về chỗ cũ', vong.join('>') === 'sang>toi>may', vong.join(' > '));

  await nut.click(); // -> sáng, trong khi máy đang ở chế độ tối
  await toi.p.waitForTimeout(200);
  const chonSang = await doc(toi.p);
  check(
    'Người dùng chọn sáng thì thắng cài đặt tối của máy',
    chonSang.theme === 'light' && chonSang.bgSang > 0.8,
    `${chonSang.theme} / ${chonSang.bg}`
  );

  await toi.p.reload({ waitUntil: 'networkidle' });
  const sauTaiLai = await doc(toi.p);
  check(
    'Tải lại vẫn giữ lựa chọn giao diện',
    sauTaiLai.theme === 'light' && sauTaiLai.bgSang > 0.8,
    `${sauTaiLai.theme} / ${sauTaiLai.bg}`
  );

  check(
    'Không có lệch hydration nào (script đặt data-theme trước khi React chạy)',
    sang.loi.length === 0 && toi.loi.length === 0,
    [...sang.loi, ...toi.loi].join(' | ') || 'sạch'
  );

  await sang.ctx.close();
  await toi.ctx.close();
}

/*
 * --- Trang trí theo khổ màn hình: ĐÚNG MỘT bức tranh, và nền đúng một kiểu ---
 *
 * BA thứ đổi cùng lúc ở mốc 1280px, và cả ba phải đổi CÙNG một mốc: `SiteDecor` vẽ
 * hai bên lề từ 1280px trở lên, `DatCuoiTrang` vẽ dải đất ở đáy trang dưới mức đó,
 * và nền trang chuyển từ một màu đặc sang dải chuyển sắc trời-xuống-đất. Lệch một
 * mốc là kéo cửa sổ qua đó thấy hai cú giật thay vì một; sai hẳn thì hoặc hai bức
 * tranh cùng hiện — quả đồi bên lề chạy xuống gặp một quả đồi thứ hai nằm ngang —
 * hoặc không bức nào, tức trả lại đúng dải trơn mà cả hai file tồn tại để tránh.
 *
 * Kiểu hỏng này im lặng: mọi trạng thái sai đều là một trang chạy bình thường, không
 * lỗi, không cảnh báo. Và không phép kiểm nào khác thấy được — `a11y-check` chỉ đo
 * trang có phải vuốt ngang hay không, mà không trạng thái sai nào vuốt ngang cả.
 */
{
  const dem = (p) =>
    p.evaluate(() => {
      /*
       * ĐẾM CÁI ĐANG VẼ, KHÔNG ĐẾM CÁI CÓ TRONG DOM — và đây là chỗ phép kiểm này
       * đã sai ở bản đầu. Cả hai bức tranh luôn có mặt trong DOM ở mọi khổ màn hình,
       * chúng chỉ tắt bằng `display: none` (`hidden xl:block` và `xl:hidden`). Đếm
       * bằng `querySelectorAll` không thì con số ra 1 và 1 ở mọi bề rộng, tức phép
       * kiểm luôn xanh và không canh gì cả.
       */
      const veRa = (e) => e.getClientRects().length > 0;
      /*
       * Tìm theo `data-kg-decor`, KHÔNG theo hình dạng của phần tử.
       *
       * Bản trước nhận ra tranh bên lề bằng "div aria-hidden có position: fixed" —
       * đúng cho tới lúc có bức trang trí thứ ba (dây leo hai mép) cũng là một div
       * aria-hidden fixed. Lúc đó phép kiểm đếm được 1 ở chỗ đáng lẽ 0 và báo đỏ vì
       * một thay đổi hoàn toàn lành. Bám vào một cái nhãn đặt sẵn thì thêm bức thứ
       * tư cũng không đụng gì tới đây.
       */
      const co = (k) => {
        const e = document.querySelector(`[data-kg-decor="${k}"]`);
        return e ? veRa(e) : null;
      };
      return {
        dat: co('dat'),
        le: co('le'),
        vien: co('vien'),
        /* Điểm tab: tranh trang trí không được thêm cái nào, ở khổ nào cũng vậy. */
        tab: document.querySelectorAll(
          'footer a, footer button, footer [tabindex]:not([tabindex="-1"])'
        ).length,
        /*
         * Nền: có dải chuyển sắc hay không, VÀ màu đặc lót dưới còn không.
         *
         * Đo cả `backgroundColor` chứ không chỉ `backgroundImage`, vì viết
         * `background:` gộp thay cho `background-image:` là một cách hỏng thật đã
         * xảy ra: dải vẫn hiện đúng, mắt không thấy gì khác, nhưng màu đặc bị reset
         * về trong suốt — và đó chính là chỗ mấy phép kiểm giao diện ở trên đọc để
         * biết đang sáng hay tối.
         */
        dai: getComputedStyle(document.documentElement).backgroundImage.includes('gradient'),
        nenDac: getComputedStyle(document.documentElement).backgroundColor,
      };
    });

  for (const [ten, w, hep] of [
    ['điện thoại 390px', 390, true],
    ['ngay dưới mốc, 1279px', 1279, true],
    ['đúng mốc, 1280px', 1280, false],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(APP, { waitUntil: 'networkidle' });
    const d = await dem(p);
    /* BA bức tranh, và chúng loại trừ nhau theo đúng một mốc: khổ hẹp thì có dải đất
       cuối trang và dây leo hai mép, khổ rộng thì có tranh hai bên lề. */
    check(
      `Ba bức trang trí bật đúng bộ — ${ten}`,
      d.dat === hep && d.vien === hep && d.le === !hep,
      `đất ${d.dat}, viền ${d.vien}, lề ${d.le} (khổ ${hep ? 'hẹp' : 'rộng'})`
    );
    check(`Chân trang ${ten}: tranh không thêm điểm tab`, d.tab === 2, `${d.tab} điểm tab`);
    /* Dải nền bật đúng ở khổ nào có dải đất, tắt đúng ở khổ nào có tranh bên lề. */
    check(
      `Dải nền chuyển sắc — ${ten}`,
      d.dai === hep,
      `${d.dai ? 'có' : 'không'} (cần ${hep ? 'có' : 'không'})`
    );
    check(
      `Nền đặc lót dưới còn nguyên — ${ten}`,
      /^rgb\(\d/.test(d.nenDac),
      d.nenDac
    );
    await ctx.close();
  }
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
