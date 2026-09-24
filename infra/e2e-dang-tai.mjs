/**
 * Phản hồi lúc CHUYỂN TRANG — đo bằng trình duyệt thật, trên mạng bị bóp chậm.
 *
 * ═══ CON SỐ ĐÃ DỰNG RA BỘ NÀY ═══
 *
 * Trước khi có `loading.tsx` và `TheDangMo`, đo trên production với prefetch bị chặn:
 *
 *     mạng nhanh        987 ms màn hình không đổi một pixel
 *     3G chậm         2.776 ms màn hình không đổi một pixel
 *
 * Gần ba giây im lặng sau một cú chạm. Đứa trẻ bấm lại — và đó là cách nó học được
 * rằng trang này hỏng.
 *
 * ═══ PHẢI CHẶN PREFETCH, NẾU KHÔNG BỘ NÀY ĐO NHẦM ═══
 *
 * Next tự tải sẵn mọi `<Link>` nằm trong khung nhìn, nên trong một phép đo bình
 * thường thì trang đích đã nằm sẵn trong bộ nhớ và chuyển trang là tức thì — kể cả
 * khi bóp mạng xuống 3G. Đo như thế thì khung chờ KHÔNG BAO GIỜ hiện ra, và bộ kiểm
 * sẽ xanh mà chẳng chứng minh được gì.
 *
 * Đo được chính chuyện đó ở bản đầu: 155 ms trên 3G chậm, y hệt mạng nhanh. Một con
 * số đẹp tới mức phải nghi.
 *
 * Chặn bằng header `next-router-prefetch` — nó dựng lại đúng cảnh có thật: bé vừa
 * cuộn tới một thẻ là chạm luôn, prefetch chưa kịp xong.
 *
 * ═══ KHÔNG MƯỢN GAME CỦA DB DEV ═══
 *
 * `e2e-touch` từng trỏ tay vào một game có sẵn rồi đỏ ngay lần dọn DB đầu tiên, đọc
 * lên như sản phẩm vỡ. Bộ này tự dựng phụ huynh, bé và game của riêng nó.
 *
 * Chạy:
 *   SB3_FIXTURE=<đường-dẫn.sb3> MAIL_LOG=/tmp/kg-mail.log node infra/e2e-dang-tai.mjs
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { batBuocMailLog, taoBoBamLink } from './e2e-mail.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const FIXTURE = process.env.SB3_FIXTURE ?? '';
const MAIL_LOG = batBuocMailLog('e2e-dang-tai');

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-dt-${suffix}@kidogame.test`;
const PASS = 'matkhau-dai-1234';
const CHILD_USER = `edt${suffix}`;
const CHILD_PASS = 'be1234';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!FIXTURE) {
  console.error('Cần SB3_FIXTURE=<đường dẫn .sb3>.');
  process.exit(1);
}

const ROOT = path.join(import.meta.dirname, '..');
const WEB = path.join(ROOT, 'apps', 'web');
const DB = (
  fs.readFileSync(path.join(WEB, '.env'), 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1] ?? ''
).split('?')[0];
const dem = (q) => Number(execFileSync('psql', [DB, '-q', '-t', '-A', '-c', q]).toString().trim());

const browser = await chromium.launch({ channel: 'chrome' });
const bamLinkXacMinh = taoBoBamLink(MAIL_LOG, { appOrigin: APP });

/** 3G chậm của wifi trường học, không phải "hơi chậm". */
const CHAM = {
  offline: false,
  latency: 600,
  downloadThroughput: (300 * 1024) / 8,
  uploadThroughput: (300 * 1024) / 8,
};

/**
 * Mở một trang đã CHẶN PREFETCH sẵn — xem ghi chú ở đầu file.
 *
 * Chặn từ trước khi `goto`, không phải sau: Next bắn prefetch ngay khi thẻ vào khung
 * nhìn, tức trước cả lúc `networkidle`.
 */
async function moTrang({ bopMang = false, itChuyenDong = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1000, height: 1000 },
    ...(itChuyenDong ? { reducedMotion: 'reduce' } : {}),
  });
  const p = await ctx.newPage();
  await p.route('**/*', async (r) =>
    r.request().headers()['next-router-prefetch'] ? r.abort() : r.continue()
  );
  await p.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  if (bopMang) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', CHAM);
  }
  return { ctx, p };
}

/** Bấm thẻ game rồi ghi lại MỐC THỜI GIAN của từng dấu hiệu, tính từ cú bấm. */
async function bamRoiDo(p, gameId) {
  const the = p.locator(`a[href="/game/${gameId}"]`).first();
  await the.scrollIntoViewIfNeeded();
  const t0 = Date.now();
  await the.click({ noWaitAfter: true });
  const moc = { xoay: null, khung: null };
  for (let i = 0; i < 600; i++) {
    if (moc.xoay === null && (await p.locator('[data-testid=the-dang-mo]').count())) {
      moc.xoay = Date.now() - t0;
    }
    if (moc.khung === null && (await p.locator('[data-testid=dang-tai]').count())) {
      moc.khung = Date.now() - t0;
    }
    if (moc.xoay !== null && moc.khung !== null) break;
    if (/\/game\//.test(p.url()) && moc.khung === null && i > 40) break;
    await p.waitForTimeout(25);
  }
  return moc;
}

// ---------- Dựng: phụ huynh -> một bé -> một game công khai ----------
let GAME_ID = '';
{
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  check('Xác minh được email phụ huynh', await bamLinkXacMinh(p));

  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  await p.fill('#displayName', 'Bé Đang Tải');
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', CHILD_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForTimeout(1500);
  check('Dựng được bé', dem(`select count(*) from "Child" where username='${CHILD_USER}'`) === 1);
  await ctx.close();

  const cctx = await browser.newContext({ viewport: { width: 1000, height: 1000 } });
  const c = await cctx.newPage();
  await c.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c.fill('#username', CHILD_USER);
  await c.fill('#password', CHILD_PASS);
  await c.click('[data-testid=auth-form] button[type=submit]');
  await c.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});
  await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await c.fill('#title', `Game dang tai ${suffix}`);
  await c.setInputFiles('#file', FIXTURE);
  await c.click('[data-testid=upload-form] button[type=submit]');
  await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
  GAME_ID = c.url().split('/game/')[1] ?? '';
  check('Bé đăng được game', GAME_ID.length > 0, GAME_ID);
  await cctx.close();
}

// ---------- Trên mạng nhanh ----------
{
  const { ctx, p } = await moTrang();
  const moc = await bamRoiDo(p, GAME_ID);
  check('Mạng nhanh: thẻ vừa bấm hiện vòng xoay', moc.xoay !== null, `${moc.xoay} ms`);
  check('Mạng nhanh: trang đích hiện khung chờ', moc.khung !== null, `${moc.khung} ms`);
  await ctx.close();
}

// ---------- Trên 3G chậm: đây mới là phép đo đáng giá ----------
{
  const { ctx, p } = await moTrang({ bopMang: true });
  const moc = await bamRoiDo(p, GAME_ID);

  check('3G chậm: thẻ vừa bấm hiện vòng xoay', moc.xoay !== null, `${moc.xoay} ms`);
  /*
   * NGƯỠNG 400ms, và nó đo một thứ CỤ THỂ chứ không phải "cho nhanh".
   *
   * Vòng xoay này chạy hoàn toàn ở máy khách — `useLinkStatus` đọc trạng thái router,
   * không chờ một byte nào từ mạng. Nên nếu nó chậm đi khi bóp mạng, nghĩa là ai đó
   * đã vô tình buộc nó vào một thứ phải tải về, và lúc đó nó mất đúng cái giá trị
   * mình có: trả lời "máy có nghe thấy cú chạm không" NGAY.
   */
  check(
    '… và nó KHÔNG chờ mạng (dưới 400ms dù mạng chậm)',
    moc.xoay !== null && moc.xoay < 400,
    `${moc.xoay} ms`
  );
  check('3G chậm: trang đích hiện khung chờ', moc.khung !== null, `${moc.khung} ms`);

  // --- Khung chờ phải NÓI được thành lời, không chỉ vẽ ra hình ---
  const khung = p.locator('[data-testid=dang-tai]');
  check('Khung chờ mang role=status', (await khung.getAttribute('role')) === 'status');
  check(
    '… và aria-live=polite, không cắt ngang thứ đang đọc dở',
    (await khung.getAttribute('aria-live')) === 'polite'
  );
  check(
    '… và có một câu THẬT cho trình đọc màn hình',
    (await khung.locator('.sr-only').innerText()).includes('Đang mở game')
  );

  // --- KHÔNG ĐƯỢC XÊ DỊCH khi nội dung thật tới ---
  const kCho = await khung.locator('.stage-frame').boundingBox();
  const iCho = await khung.locator('.kg-o-cho.size-11').first().boundingBox();

  /*
   * TAM GIÁC PHẢI NẰM GIỮA KHUNG GAME CHỜ.
   *
   * Fen bắt được bằng mắt, không bộ kiểm nào đỏ: tam giác dính sát đỉnh khung, lệch
   * 251px. Nguyên nhân là `.stage-frame` tự đặt `display: block` và trong `globals.css`
   * nó nằm sau tầng utility của Tailwind, nên `className="stage-frame grid"` thì `grid`
   * thua ở cùng độ ưu tiên (0,1,0) — `place-items-center` rơi vào hư không mà không
   * báo gì cả.
   *
   * Phép kiểm này so TÂM chứ không hỏi "có hiện không", vì cả lúc hỏng hình vẫn hiện
   * đủ. Ngưỡng 2px cho sai số làm tròn của trình duyệt.
   */
  const svgCho = await khung.locator('.stage-frame .kg-o-mo').boundingBox();
  const lechX = svgCho.x + svgCho.width / 2 - (kCho.x + kCho.width / 2);
  const lechY = svgCho.y + svgCho.height / 2 - (kCho.y + kCho.height / 2);
  check(
    'Tam giác nằm đúng GIỮA khung game chờ',
    Math.abs(lechX) <= 2 && Math.abs(lechY) <= 2,
    `lệch ${Math.round(lechX)}px ngang, ${Math.round(lechY)}px dọc`
  );
  await p.waitForSelector('[data-testid=hang-icon]', { timeout: 120000 });
  await p.waitForTimeout(1500);
  const kThat = await p.locator('.stage-frame').first().boundingBox();
  const iThat = await p.locator('[data-testid=icon-tim]').boundingBox();

  /*
   * Đây là phép kiểm đáng giá nhất trong bộ này.
   *
   * Một khung chờ đặt sai chỗ còn tệ hơn không có khung chờ: nó vẽ ra một bố cục rồi
   * giật sang bố cục khác, và đứa trẻ đang đưa tay tới hàng icon thì hàng icon nhảy
   * đi mất — nó bấm nhầm sang nút bên cạnh, mà nút bên cạnh là một lời khen khác.
   *
   * Đo được khi mới viết: lệch 12px, vì khung chờ ước lượng phần tiêu đề bằng mấy con
   * số tròn và bỏ quên nét gạch tay dưới tiêu đề. Chép đúng cấu trúc `PageTitle` thì
   * về 0.
   */
  check(
    'Khung game KHÔNG xê dịch khi game thật tới',
    Math.abs(kThat.y - kCho.y) <= 1,
    `lệch ${Math.round(kThat.y - kCho.y)}px`
  );
  check(
    'Hàng icon KHÔNG xê dịch khi nội dung thật tới',
    Math.abs(iThat.y - iCho.y) <= 1,
    `lệch ${Math.round(iThat.y - iCho.y)}px`
  );
  check(
    'Ô chờ khung game đúng cỡ khung game thật',
    Math.abs(kThat.width - kCho.width) <= 1 && Math.abs(kThat.height - kCho.height) <= 1,
    `${Math.round(kCho.width)}×${Math.round(kCho.height)} vs ${Math.round(kThat.width)}×${Math.round(kThat.height)}`
  );
  await ctx.close();
}

// ---------- Khung chờ TRANG CHỦ phải trùng khít trang chủ thật ----------
{
  /*
   * Yêu cầu của fen, nguyên văn: khung chờ phải là trang đã tải xong, chỉ chưa có màu
   * và chưa có chữ. Nên phép kiểm ở đây không hỏi "có hiện gì không" mà hỏi "nó có
   * ĐÚNG bố cục của trang sắp tới không" — đo vị trí và kích thước, không đo sự tồn
   * tại.
   *
   * Ba lỗi đã bắt được bằng đúng cách đo này, và không lỗi nào tự lộ ra khi nhìn:
   *   · `KhungCho` bọc thêm một `<Wrap>` nữa trong khi `layout.tsx` đã bọc sẵn
   *     -> thẻ chờ rộng 224px cạnh thẻ thật 234px. Khung chờ vẫn cân đối, chỉ là
   *     cân đối trong một bề rộng khác.
   *   · dải mời thiếu hẳn hàng nút -> hụt 89px chiều cao.
   *   · ô tìm kiếm dựng cao 48px theo `min-h-touch` đọc trong mã nguồn, trong khi
   *     trên trang nó nở ra 54px -> cộng với 6px của dòng đếm kết quả thành 12px mà
   *     cả lưới thẻ bị tụt.
   *
   *   · (điện thoại) câu chào gãy hai dòng ở 360px mà khung chờ dựng cứng một dòng
   *     -> dải mời hụt 27px; rồi bản sửa đầu bọc `<div>` trong `<p>` -> dư 20px.
   *
   * Đi từ trang game VỀ trang chủ chứ không tải thẳng: `loading.tsx` chỉ chạy khi
   * CHUYỂN trang, còn vào thẳng bằng URL thì server dựng luôn trang thật.
   *
   * BA CỠ, vì trang chủ trên điện thoại có bố cục riêng (dải mời gọn, hàng lọc cuộn
   * ngang). 390 và 360 cùng là điện thoại nhưng câu chào gãy dòng khác nhau.
   */
  for (const [w, h, dt] of [
    [1140, 1000, false],
    [390, 844, true],
    [360, 800, true],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: dt, hasTouch: dt });
    const p = await ctx.newPage();
    await p.route('**/*', async (r) =>
      r.request().headers()['next-router-prefetch'] ? r.abort() : r.continue()
    );
    await p.goto(`${APP}/game/${GAME_ID}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', CHAM);
    await p.evaluate(() => {
      const a = document.createElement('a');
      a.href = '/';
      a.id = 'e2e-ve-trang-chu';
      a.textContent = 'về trang chủ';
      document.body.prepend(a);
    });
    await p.click('#e2e-ve-trang-chu', { noWaitAfter: true });
    await p.waitForSelector('[data-testid=dang-tai]', { timeout: 60000 });

    const khung = p.locator('[data-testid=dang-tai]');
    const choDai = await khung.locator('> div').first().boundingBox();
    const choThe = await khung.locator('.grid > div').first().boundingBox();

    /* Bỏ bóp mạng để trang chủ tải xong — nó có hàng chục ảnh, giữ 150kbps thì hết giờ
       trước khi tải hết, mà thứ cần đo là BỐ CỤC chứ không phải tốc độ. */
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await p.waitForSelector('[data-testid=game-card]', { timeout: 120000 });
    await p.waitForTimeout(2500);
    const thatDai = await p.locator('[data-testid=home-hero]').boundingBox();
    const thatThe = await p.locator('[data-testid=game-card]').first().boundingBox();

    const khop = (a, b) =>
      Math.abs(a.x - b.x) <= 1 &&
      Math.abs(a.y - b.y) <= 1 &&
      Math.abs(a.width - b.width) <= 1 &&
      Math.abs(a.height - b.height) <= 1;
    const ta = (a, b) =>
      `lệch y ${Math.round(b.y - a.y)}px, cao ${Math.round(b.height - a.height)}px, rộng ${Math.round(b.width - a.width)}px`;

    check(`Trang chủ ${w}px: dải mời chờ trùng khít dải mời thật`, khop(choDai, thatDai), ta(choDai, thatDai));
    check(`Trang chủ ${w}px: thẻ game chờ trùng khít thẻ game thật`, khop(choThe, thatThe), ta(choThe, thatThe));

    await ctx.close();
  }
}

// ---------- Người xin ÍT CHUYỂN ĐỘNG vẫn phải biết trang đang tải ----------
{
  const { ctx, p } = await moTrang({ bopMang: true, itChuyenDong: true });
  await bamRoiDo(p, GAME_ID);
  await p.waitForSelector('[data-testid=dang-tai]', { timeout: 60000 });

  /*
   * KHÔNG tắt hai hoạt ảnh này khi người dùng xin ít chuyển động, và đó là một lựa
   * chọn ngược với mọi hoạt ảnh khác trong `globals.css`.
   *
   * Tắt hẳn thì người ấy ngồi trước một màn hình xám đứng im, không phân biệt được
   * với một trang đã chết — đúng cái mà họ ít có cách nhất để kiểm chứng. Quyền tắt
   * chuyển động không phải là quyền bị bỏ lại trong im lặng.
   *
   * Đổi lại chúng chậm hẳn: ô chờ 6s một nhịp thay vì 3s.
   */
  const o = p.locator('[data-testid=dang-tai] .kg-o-cho').first();
  const nhip = await o.evaluate((e) => getComputedStyle(e).animationDuration);
  const ten = await o.evaluate((e) => getComputedStyle(e).animationName);
  check('Ít chuyển động: ô chờ VẪN thở, không đứng im', ten !== 'none' && nhip !== '0.01ms', `${ten} ${nhip}`);
  check('… nhưng chậm hẳn lại (6s một nhịp) và đổi sang bộ khung hình dịu', ten === 'kg-tho-diu' && nhip === '6s', `${ten} ${nhip}`);
  await ctx.close();
}

/*
 * ═══ VÒNG XOAY TRÊN NÚT ĐIỀU HƯỚNG ═══
 *
 * Fen báo 23/9: "chuyển thẻ thì bị đơ và người dùng không biết đó là lỗi hay đang tải".
 * Đo ra đúng thế — bấm sang trang 2 mất 2,9 GIÂY mà DOM y nguyên suốt 400ms đầu, tức
 * không một dấu hiệu nào. `loading.tsx` không cứu được: phân trang ở lại cùng route
 * `(trang-chu)` và chỉ đổi query, nên nó không hề chạy.
 *
 * BẤM THẬT RỒI SOI DOM, không kiểm bằng việc component có mặt trong mã nguồn:
 * `useLinkStatus` mà đặt ngoài `<Link>` thì `pending` mãi mãi `false` và KHÔNG lỗi gì
 * cả — cùng cái bẫy im lặng đã ghi trong `the-dang-mo.tsx`.
 *
 * `noWaitAfter` vì cú bấm này mở đầu một lượt điều hướng: chờ nó xong rồi mới soi là
 * soi vào trang sau, lúc vòng xoay đã biến mất từ đời nào.
 */
const ctxXoay = await browser.newContext({ viewport: { width: 1280, height: 900 } });

/*
 * ═══ PHẢN HỒI KHI ĐIỀU HƯỚNG ═══
 *
 * Fen báo 23/9: "chuyển thẻ thì bị đơ và người dùng không biết đó là lỗi hay đang tải".
 * Đo ra đúng thế — bấm sang trang 2 mất 2,9 GIÂY mà DOM y nguyên suốt 400ms đầu.
 *
 * HAI PHÉP TÁCH RỜI, cố ý, vì chúng canh hai thứ khác nhau và một trong hai không đo
 * được bằng cách bấm thật:
 *
 *   1. Bấm thật  -> vòng xoay có hiện ra trong đúng cái nút vừa bấm không.
 *   2. Chèn tay  -> có vòng xoay trên trang thì lưới có mờ và có chặn bấm không.
 *
 * Bản đầu gộp cả hai vào một lượt bấm thật, và nó CHẬP CHỜN: chạy hai lượt liên tiếp ra
 * 33/35 rồi 35/35. Lý do là cửa sổ đo quá hẹp so với máy — trang chủ dev dựng mất 4–5
 * giây (24 thẻ, mỗi thẻ hơn trăm phần tử SVG lá và hoa), lớp mờ lại có 120ms trễ, nên
 * việc chụp trúng đúng khoảnh khắc "đã mờ mà chưa thay cây" là chuyện hên xui. Một phép
 * hên xui thì đỏ cũng không ai tin, mà xanh cũng không chứng minh được gì.
 *
 * Phép 2 chèn thẳng một phần tử mang `data-testid=nut-dang-cho` vào DOM rồi đo, nên nó
 * TẤT ĐỊNH: không chờ mạng, không chờ router. Nó canh đúng thứ cần canh — quy tắc
 * `html:has(...)` trong `globals.css` còn sống và còn đúng đích.
 */
for (const [ten, sel] of [
  ['nhãn lọc loại', '[data-testid=tag-filters] a:nth-child(2)'],
  ['nhãn lọc tuổi', '[data-testid=age-filters] a:nth-child(3)'],
  ['nút sang trang sau', 'a[data-testid$="-sau"]'],
]) {
  const p = await ctxXoay.newPage();
  await p.goto(APP, { waitUntil: 'networkidle' });
  const nut = p.locator(sel).first();
  if ((await nut.count()) === 0) {
    check(`Có ${ten} để đo`, false, 'không tìm thấy');
    await p.close();
    continue;
  }
  const truoc = await nut.boundingBox();
  await nut.click({ noWaitAfter: true });

  let coXoay = false;
  let sau = null;
  for (let i = 0; i < 80 && !coXoay; i += 1) {
    coXoay = (await nut.locator('[data-testid=nut-dang-cho]').count().catch(() => 0)) > 0;
    if (coXoay) sau = await nut.boundingBox().catch(() => null);
    else await p.waitForTimeout(50);
  }
  check(`Bấm ${ten}: vòng xoay hiện TRONG chính nút đó`, coXoay, coXoay ? 'có' : 'không thấy sau 4s');

  /* Vòng xoay là lớp phủ `absolute`, nên nút KHÔNG được rộng ra hay nhích đi. Chèn hẳn
     một phần tử vào trong viên thuốc là cả hàng lọc dài ra và những viên bên cạnh nhảy
     chỗ — ngay lúc ngón tay trẻ còn đang ở đó. */
  const yen = truoc && sau && Math.abs(sau.width - truoc.width) < 1 && Math.abs(sau.x - truoc.x) < 1;
  check(
    `Bấm ${ten}: nút KHÔNG xê dịch vì vòng xoay`,
    !!yen,
    truoc && sau ? `lệch ${Math.abs(sau.width - truoc.width).toFixed(1)}px rộng` : 'không đo được'
  );
  await p.close();
}

/*
 * Phép 2: có vòng xoay trên trang thì lưới mờ và không bấm được; gỡ đi thì sáng lại.
 *
 * `pointer-events` là phần quan trọng nhất ở đây, không phải độ mờ: lưới CŨ còn nằm đó
 * suốt mấy giây, và một đứa trẻ bấm vào cái thẻ nó đang thấy sẽ mở đúng game đó — trong
 * khi nó vừa bảo trang đi chỗ khác. Chặn bấm thì cú chạm ấy rơi vào khoảng không thay
 * vì mở nhầm một game rồi phải quay lại.
 *
 * Chờ qua mốc trễ 120ms của lớp mờ rồi mới đo: đo ngay thì `opacity` còn đúng 1 và phép
 * đọc ra "lưới không mờ" trong khi nó sắp mờ — đã đỏ oan đúng như thế một lượt.
 */
{
  const p = await ctxXoay.newPage();
  await p.goto(APP, { waitUntil: 'networkidle' });
  const doLuoi = () =>
    p
      .locator('[data-testid=luoi-game]')
      .first()
      .evaluate((e) => [Number(getComputedStyle(e).opacity), getComputedStyle(e).pointerEvents])
      .catch(() => null);

  const binhThuong = await doLuoi();
  check(
    'Lúc không điều hướng: lưới sáng bình thường và bấm được',
    !!binhThuong && binhThuong[0] > 0.9 && binhThuong[1] !== 'none',
    binhThuong ? `opacity ${binhThuong[0]} · pointer-events ${binhThuong[1]}` : 'không có lưới'
  );

  await p.evaluate(() => {
    const el = document.createElement('span');
    el.dataset.testid = 'nut-dang-cho';
    el.id = 'xoay-gia';
    document.body.appendChild(el);
  });
  await p.waitForTimeout(250);
  const dangCho = await doLuoi();
  check(
    'Có vòng xoay trên trang: lưới mờ đi và không bấm được',
    !!dangCho && dangCho[0] < 0.9 && dangCho[1] === 'none',
    dangCho ? `opacity ${dangCho[0]} · pointer-events ${dangCho[1]}` : 'không có lưới'
  );

  await p.evaluate(() => document.getElementById('xoay-gia')?.remove());
  await p.waitForTimeout(250);
  const xong = await doLuoi();
  check(
    'Vòng xoay biến mất: lưới sáng lại, không kẹt ở trạng thái mờ',
    !!xong && xong[0] > 0.9 && xong[1] !== 'none',
    xong ? `opacity ${xong[0]} · pointer-events ${xong[1]}` : 'không có lưới'
  );
  await p.close();
}
await ctxXoay.close();

/*
 * ═══ MỌI LINK KHÁC TRÊN SITE — `LinkCho` VÀ `ButtonLink` ═══
 *
 * 24/9: trước đó chỉ chip lọc, phân trang và thẻ game có phản hồi; logo, thanh điều
 * hướng, chân trang, link trong trang đăng nhập đều im lặng trong lúc trang sau dựng.
 *
 * Mỗi loại link một đại diện, vì mỗi loại hỏng một kiểu khác nhau:
 *   · logo, "Bố mẹ" nằm trên THANH TỐI — lớp phủ mặc định trắng thì vòng xoay trắng
 *     của chúng vô hình (trắng trên trắng), dù có mặt trong DOM.
 *   · nút cam — ở giao diện TỐI, lớp phủ `surface` tối đè lên chữ `chrome` tối.
 *   · link chân trang, link chữ `kg-link-bam` — `LinkCho` thường, nền sáng.
 *
 * Nên ngoài "có vòng xoay không", phép này đo luôn ĐỘ TƯƠNG PHẢN giữa vòng xoay và lớp
 * phủ, ngưỡng 3:1 của WCAG 1.4.11. Màu đọc qua canvas vì Tailwind 4 trả màu pha alpha
 * dạng `oklab(...)`, không phải `rgb()` để tách số.
 *
 * Bóp mạng sau khi trang tải: không bóp thì một trang nhẹ như `/dang-ky` có thể dựng xong
 * trong khoảng giữa hai lần soi, và phép đo đỏ oan vì chụp hụt chứ không vì thiếu.
 */
for (const [ten, trang, sel, giaoDien] of [
  ['logo (thanh tối)', '/dieu-khoan', 'header a[href="/"]', 'light'],
  ['"Bố mẹ" trên thanh (thanh tối)', '/dieu-khoan', 'header a[href="/dang-nhap"]', 'light'],
  ['nút cam "Bé đăng nhập", giao diện tối', '/dieu-khoan', 'header a[href="/be-dang-nhap"]', 'dark'],
  ['link chân trang', '/dieu-khoan', '[data-testid=footer-bao-loi]', 'light'],
  ['link chữ "Đăng ký" ở trang đăng nhập', '/dang-nhap', 'main a[href="/dang-ky"]', 'light'],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: giaoDien });
  const p = await ctx.newPage();
  await p.goto(`${APP}${trang}`, { waitUntil: 'networkidle' });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', CHAM);

  const nut = p.locator(sel).first();
  if ((await nut.count()) === 0) {
    check(`Có ${ten} để đo`, false, `không thấy ${sel}`);
    await ctx.close();
    continue;
  }
  const truoc = await nut.boundingBox();
  await nut.click({ noWaitAfter: true });

  let doDuoc = null;
  for (let i = 0; i < 80 && !doDuoc; i += 1) {
    doDuoc = await nut
      .locator('[data-testid=nut-dang-cho]')
      .evaluate((phu) => {
        const c = document.createElement('canvas').getContext('2d');
        const rgb = (mau) => {
          c.clearRect(0, 0, 1, 1);
          c.fillStyle = mau;
          c.fillRect(0, 0, 1, 1);
          return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)];
        };
        const L = ([r, g, b]) => {
          const k = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b);
        };
        const a = L(rgb(getComputedStyle(phu).backgroundColor));
        const b = L(rgb(getComputedStyle(phu.firstElementChild).borderLeftColor));
        return { tuongPhan: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
      }, null, { timeout: 50 })
      .catch(() => null);
    if (!doDuoc) await p.waitForTimeout(50);
  }
  const sau = doDuoc ? await nut.boundingBox().catch(() => null) : null;

  check(`Bấm ${ten}: vòng xoay hiện TRONG chính link đó`, !!doDuoc, doDuoc ? 'có' : 'không thấy sau 4s');
  check(
    `Bấm ${ten}: vòng xoay nổi trên lớp phủ (≥ 3:1)`,
    !!doDuoc && doDuoc.tuongPhan >= 3,
    doDuoc ? `${doDuoc.tuongPhan.toFixed(2)}:1` : 'không đo được'
  );
  check(
    `Bấm ${ten}: link KHÔNG xê dịch vì vòng xoay`,
    !!truoc && !!sau && Math.abs(sau.width - truoc.width) < 1 && Math.abs(sau.x - truoc.x) < 1,
    truoc && sau ? `lệch ${Math.abs(sau.width - truoc.width).toFixed(1)}px rộng` : 'không đo được'
  );
  await ctx.close();
}

await browser.close();

const hong = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - hong}/${results.length} phép kiểm đạt.`);
process.exit(hong ? 1 : 0);
