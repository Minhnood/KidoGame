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
   * Đi từ trang game VỀ trang chủ chứ không tải thẳng: `loading.tsx` chỉ chạy khi
   * CHUYỂN trang, còn vào thẳng bằng URL thì server dựng luôn trang thật.
   */
  const ctx = await browser.newContext({ viewport: { width: 1140, height: 1000 } });
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

  check('Trang chủ: dải mời chờ trùng khít dải mời thật', khop(choDai, thatDai), ta(choDai, thatDai));
  check('Trang chủ: thẻ game chờ trùng khít thẻ game thật', khop(choThe, thatThe), ta(choThe, thatThe));

  await ctx.close();
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

await browser.close();

const hong = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - hong}/${results.length} phép kiểm đạt.`);
process.exit(hong ? 1 : 0);
