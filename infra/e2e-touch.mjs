/**
 * Kiểm nút điều khiển cảm ứng trên thiết bị di động giả lập.
 *
 * Điểm mấu chốt: KHÔNG chỉ kiểm nút có hiện ra, mà kiểm nó có THỰC SỰ điều khiển
 * được nhân vật — đọc toạ độ sprite trong vm trước và sau khi bấm.
 *
 * Chạy:  GAME_URL=http://localhost:3000/game/<id> node infra/e2e-touch.mjs
 */
import { chromium, devices } from 'playwright';

const GAME_URL = process.env.GAME_URL;
if (!GAME_URL) {
  console.error('Thiếu GAME_URL');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

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
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
