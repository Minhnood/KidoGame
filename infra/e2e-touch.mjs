/**
 * Kiểm nút điều khiển cảm ứng trên thiết bị di động giả lập.
 *
 * Điểm mấu chốt: KHÔNG chỉ kiểm nút có hiện ra, mà kiểm nó có THỰC SỰ điều khiển
 * được nhân vật — đọc toạ độ sprite trong vm trước và sau khi bấm.
 *
 * ═══ BỘ NÀY TỰ DỰNG GAME CỦA NÓ ═══
 *
 * Cụm nút chỉ được sinh ra khi project thật sự dùng phím (`detectTouchKeys` đọc
 * `KEY_OPTION` trong project.json), mà fixture chung của repo không có phím nào. Nên
 * trước đây bộ này đòi `GAME_URL` trỏ tay vào một game NẰM SẴN TRONG DB DEV.
 *
 * Cách đó hỏng theo kiểu tệ nhất: dọn DB, hay chạy một bộ có xoá gia đình, là game ấy
 * biến mất — và bộ này đỏ ở phép "không thấy nút điều khiển nào", đọc lên y hệt như
 * sản phẩm vỡ. Bàn giao đã ghi đúng bẫy này một lần.
 *
 * Giờ nó tự đăng ký phụ huynh, tạo bé, và đăng một `.sb3` do `infra/tao-fixture-phim.mjs`
 * dựng ra — file có bốn mũi tên cộng phím cách, tức bắt cả nhánh D-pad lẫn nhánh nút
 * hành động của `detectTouchKeys`.
 *
 * Chạy:
 *   MAIL_LOG=/tmp/kg-mail.log node infra/e2e-touch.mjs
 *   GAME_URL=http://localhost:3000/game/<id> node infra/e2e-touch.mjs   # trỏ tay, vẫn được
 */
import { chromium, devices } from 'playwright';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { batBuocMailLog, taoBoBamLink } from './e2e-mail.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const ROOT = path.join(import.meta.dirname, '..');
const FIXTURE_PHIM = path.join(ROOT, 'storage', 'fixtures', 'phim.sb3');

/**
 * Dựng game riêng cho bộ này, trả về URL trang game.
 *
 * Tự sinh fixture nếu chưa có: file nằm dưới `storage/` nên nó KHÔNG theo repo, và
 * một bộ kiểm đòi người chạy phải nhớ gõ một lệnh khác trước là một bộ kiểm sẽ đỏ
 * trên máy mới vì lý do chẳng liên quan gì tới thứ nó đo.
 */
async function dungGame(browser) {
  if (!existsSync(FIXTURE_PHIM)) {
    console.log('… chưa có fixture phím, dựng bằng infra/tao-fixture-phim.mjs');
    execFileSync('node', [path.join(ROOT, 'infra', 'tao-fixture-phim.mjs'), FIXTURE_PHIM], {
      stdio: 'inherit',
    });
  }

  const MAIL_LOG = batBuocMailLog('e2e-touch');
  const bamLinkXacMinh = taoBoBamLink(MAIL_LOG, { appOrigin: APP });
  const suffix = randomBytes(4).toString('hex');

  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
  const p = await ctx.newPage();

  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', `e2e-touch-${suffix}@kidogame.test`);
  await p.fill('#password', 'matkhau-dai-1234');
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  if (!(await bamLinkXacMinh(p))) {
    throw new Error('Không xác minh được email phụ huynh — xem MAIL_LOG.');
  }

  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  await p.fill('#displayName', 'Bé Cảm Ứng');
  await p.fill('#username', `etc${suffix}`);
  await p.fill('#password', 'be1234');
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForTimeout(1500);

  await ctx.close();

  /*
   * PHIÊN RIÊNG cho bé, không dùng lại phiên của phụ huynh.
   *
   * Dùng chung thì `/be-dang-nhap` chuyển hướng đi mất — phụ huynh đang đăng nhập —
   * và lỗi hiện ra là "hết giờ chờ #username", đọc lên như trang đăng nhập hỏng.
   */
  const ctxBe = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
  const b = await ctxBe.newPage();

  await b.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await b.fill('#username', `etc${suffix}`);
  await b.fill('#password', 'be1234');
  await b.click('[data-testid=auth-form] button[type=submit]');
  await b.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});

  await b.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await b.fill('#title', `Game phim ${suffix}`);
  await b.setInputFiles('#file', FIXTURE_PHIM);
  await b.click('[data-testid=upload-form] button[type=submit]');
  // Bước xem thử: bấm "Đăng game" mới thành game thật.
  await b.click('[data-testid=dang-game-that]', { timeout: 60000 }).catch(() => {});
  await b.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});

  const url = b.url();
  await ctxBe.close();
  if (!/\/game\//.test(url)) throw new Error(`Đăng game không thành: dừng ở ${url}`);
  return url;
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

/* Trỏ tay vẫn được — hữu ích khi muốn soi một game thật. Không trỏ thì tự dựng. */
const GAME_URL = process.env.GAME_URL ?? (await dungGame(browser));
console.log(`Game đang đo: ${GAME_URL}\n`);

// --- Điện thoại: phải CÓ nút ---
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto(GAME_URL, { waitUntil: 'networkidle' });

  const frame = page.frameLocator('iframe.stage-frame');
  await page.waitForTimeout(3000);
  /*
   * Khởi động game bằng dispatchEvent('click') chứ không tap().
   *
   * Đã kiểm bằng phép thử đối chứng: trong giả lập cảm ứng của Playwright/Chrome,
   * `locator.tap()` KHÔNG sinh ra sự kiện 'click' (đếm listener ra 0) — kể cả với
   * game hoàn toàn không có overlay của ta. Trên máy thật thì chạm có sinh click,
   * nên đây là hạn chế của giả lập, không phải lỗi sản phẩm.
   *
   * Bộ test này kiểm NÚT CẢM ỨNG CỦA TA, không kiểm màn hình launch của packager,
   * nên dùng click trực tiếp để vào được trạng thái cần kiểm.
   */
  await frame.locator('#launch').dispatchEvent('click').catch(() => {});
  await page.waitForTimeout(3000);

  const started = await frame
    .locator('body')
    .evaluate(() => document.querySelector('#launch')?.hidden === true);
  check('Điện thoại: game khởi động được', started);

  // Đếm nút NHÌN THẤY được, không phải nút có trong DOM: count() đếm cả phần tử
  // đang bị ẩn, nên sẽ báo xanh ngay cả khi nút không hiện ra.
  const dpad = await frame.locator('.kg-pad .kg-btn:visible').count();
  const actions = await frame.locator('.kg-actions .kg-btn:visible').count();
  check('Điện thoại: hiện D-pad 4 hướng', dpad === 4, `${dpad} nút`);
  check('Điện thoại: hiện nút hành động', actions >= 1, `${actions} nút`);

  // --- Nút có điều khiển được nhân vật thật không ---
  const readY = () =>
    frame.locator('body').evaluate(() => {
      const t = window.vm.runtime.targets.find((x) => !x.isStage);
      return t ? t.y : null;
    });

  const before = await readY();
  const up = frame.locator('.kg-up');

  // Giữ nút một lúc rồi nhả, mô phỏng ngón tay thật đè lên nút.
  await up.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, bubbles: true });
  await page.waitForTimeout(800);
  await up.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true, bubbles: true });
  await page.waitForTimeout(400);
  const after = await readY();

  check('Bấm nút ▲ làm nhân vật đi lên thật', before !== null && after > before, `y: ${before} -> ${after}`);

  // --- Nhả phím: không được kẹt ---
  await page.waitForTimeout(600);
  const settled = await readY();
  await page.waitForTimeout(700);
  const stillMoving = (await readY()) !== settled;
  check('Nhả nút thì nhân vật dừng, không kẹt phím', !stillMoving, `y giữ nguyên ${settled}`);

  await page.screenshot({ path: '/tmp/kg-touch-mobile.png' });

  // --- Phóng to: khung nhúng quá nhỏ để chơi, phải mở rộng được ---
  const expand = page.locator('[data-testid=stage-expand]');
  check('Điện thoại: có nút "Chơi to hơn"', await expand.isVisible().catch(() => false));

  /*
   * ĐÚNG MỘT đường phóng to trên điện thoại.
   *
   * Nút ⛶ của packager nằm trong iframe, cách nút "Chơi to hơn" chừng 40px, và làm
   * cùng một việc — trừ trên Safari iPhone, nơi Fullscreen API không nhận phần tử
   * thường nên bấm vào không có gì xảy ra. Nó bị ẩn bằng CSS chèn lúc đóng gói, xem
   * `CSS_AN_NUT_TOAN_MAN_HINH` trong packages/sb3/src/package.ts.
   *
   * PHẢI KIỂM, vì nó hỏng im lặng theo hai đường và cả hai đều trông như không có
   * gì xảy ra: đổi một dòng `controls.*.enabled` là đổi luôn selector, còn game đóng
   * gói TRƯỚC thay đổi này thì giữ nguyên file HTML cũ cho tới khi chạy `db:repackage`
   * — nút chỉ lặng lẽ hiện lại đúng ở chỗ nó không dùng được.
   */
  const nutPackager = frame.locator('.control-button.fullscreen-button');
  check(
    'Điện thoại: KHÔNG bày nút toàn màn hình của packager',
    !(await nutPackager.isVisible().catch(() => false))
  );

  const viewport = page.viewportSize();
  await expand.click();
  await page.waitForTimeout(2500);

  const box = await page.locator('iframe.stage-frame').boundingBox();
  const fills =
    !!box &&
    Math.abs(box.width - viewport.width) <= 2 &&
    Math.abs(box.height - viewport.height) <= 2;
  check(
    'Phóng to thì khung game chiếm trọn màn hình',
    fills,
    box ? `${Math.round(box.width)}x${Math.round(box.height)} / ${viewport.width}x${viewport.height}` : 'không đo được'
  );

  // Nút cảm ứng phải sống sót qua lần đổi kích thước, và vẫn điều khiển được.
  const dpadBig = await frame.locator('.kg-pad .kg-btn:visible').count();
  check('Phóng to xong vẫn còn đủ nút D-pad', dpadBig === 4, `${dpadBig} nút`);

  const beforeBig = await readY();
  const upBig = frame.locator('.kg-up');
  await upBig.dispatchEvent('pointerdown', { pointerId: 2, isPrimary: true, bubbles: true });
  await page.waitForTimeout(800);
  await upBig.dispatchEvent('pointerup', { pointerId: 2, isPrimary: true, bubbles: true });
  await page.waitForTimeout(400);
  check(
    'Ở chế độ phóng to, nút vẫn điều khiển được nhân vật',
    (await readY()) > beforeBig,
    `y: ${beforeBig} -> ${await readY()}`
  );

  await page.screenshot({ path: '/tmp/kg-touch-fullscreen.png' });

  await page.locator('[data-testid=stage-shrink]').click();
  await page.waitForTimeout(1500);
  const boxSmall = await page.locator('iframe.stage-frame').boundingBox();
  check(
    'Thu nhỏ thì khung trở về kích thước cũ',
    !!boxSmall && boxSmall.height < viewport.height - 50,
    boxSmall ? `${Math.round(boxSmall.width)}x${Math.round(boxSmall.height)}` : 'không đo được'
  );

  await ctx.close();
}

// --- Máy tính có bàn phím: KHÔNG được hiện nút ---
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(GAME_URL, { waitUntil: 'networkidle' });
  const frame = page.frameLocator('iframe.stage-frame');
  await page.waitForTimeout(3000);

  await frame.locator('#launch').dispatchEvent('click').catch(() => {});
  await page.waitForTimeout(1500);
  const visible = await frame
    .locator('.kg-touch')
    .isVisible()
    .catch(() => false);
  check('Máy tính: KHÔNG bày nút cảm ứng che màn chơi', !visible);

  // Khung trên máy tính đã đủ rộng, mà bàn phím thật lúc nào cũng hơn nút bấm.
  const expandVisible = await page
    .locator('[data-testid=stage-expand]')
    .isVisible()
    .catch(() => false);
  check('Máy tính: KHÔNG bày nút "Chơi to hơn"', !expandVisible);

  /*
   * Và ở đây nút của packager PHẢI CÒN. Ẩn nó theo `pointer: coarse` chứ không tắt
   * hẳn là chủ ý: trên máy có chuột nó chạy thật, và toàn màn hình thật còn ẩn được
   * cả thanh địa chỉ của trình duyệt — thứ mà một cái div phủ kín khung nhìn không
   * làm được. Cặp này với phép kiểm bên trên khoá cả hai chiều: mỗi loại thiết bị
   * thấy đúng MỘT đường phóng to, không phải hai và không phải không có.
   */
  const fsVisible = await frame
    .locator('.control-button.fullscreen-button')
    .isVisible()
    .catch(() => false);
  check('Máy tính: CÒN nút toàn màn hình của packager', fsVisible);
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
