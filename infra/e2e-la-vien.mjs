/**
 * Rê chuột vào thẻ game thì lá mọc quanh viền, THEO CHIỀU KIM ĐỒNG HỒ (fen chốt 22/9).
 *
 * VÌ SAO KHÔNG CHỈ ĐẾM LÁ. Một bản cài sai — bỏ hết độ trễ, hoặc đặt độ trễ ngược —
 * vẫn cho ra đủ 16 chiếc lá hiện ra khi hover, và mọi phép đếm vẫn xanh. Thứ duy nhất
 * phân biệt được là ĐO GIỮA CHỪNG: chụp độ mờ của từng chiếc ở một thời điểm cố định
 * sau khi chuột vào, rồi xem lá nào đã nở, lá nào chưa. Đúng chiều thì ranh giới nằm
 * gọn ở một chỗ và mọi lá trước nó đều nở, mọi lá sau nó đều chưa.
 *
 * VÌ SAO CÓ PHÉP "KHÔNG CHẶN CÚ BẤM". Lá và dây leo nằm ĐÈ LÊN mặt thẻ (nằm sau thì bị
 * thẻ che kín). Thiếu `pointer-events-none` thì một đứa trẻ bấm trúng chiếc lá sẽ không
 * mở được game, và lỗi ấy không bao giờ hiện ra trong ảnh chụp màn hình.
 *
 * Chạy (cần app đang chạy, trang chủ có ít nhất 1 game):
 *   node infra/e2e-la-vien.mjs
 */
import { chromium } from 'playwright';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
/** Số lá quanh viền, khớp `LA_VIEN` trong `components/game-card.tsx`. */
const SO_LA = 16;
/** Thời gian dây leo bò hết một vòng, khớp `VONG_MS`. */
const VONG_MS = 900;

const results = [];
const check = (ten, ok, chiTiet = '') => {
  results.push({ ten, ok });
  console.log(`${ok ? '✅' : '❌'} ${ten}${chiTiet ? ` — ${chiTiet}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

/** Độ mờ của 16 lá trên MỘT thẻ, theo đúng thứ tự trong DOM = thứ tự kim đồng hồ. */
async function doMo(the) {
  return the
    .locator('[data-testid=la-vien] > svg')
    .evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'networkidle' });

  const the = page.locator('.kg-the-game').first();
  await the.scrollIntoViewIfNeeded();
  const o = await the.boundingBox();
  check('Trang chủ có thẻ game để đo', !!o, o ? `${Math.round(o.width)}×${Math.round(o.height)}` : 'không có thẻ nào');

  const la = the.locator('[data-testid=la-vien]');
  check('Mỗi thẻ có đủ lá quanh viền', (await la.count()) === SO_LA, `${await la.count()} lá`);
  check('Có dây leo bò quanh viền', (await the.locator('[data-testid=day-leo]').count()) === 1);

  /* Chưa rê chuột: mọi thứ phải TÀNG HÌNH. Hiện sẵn thì thẻ lúc nào cũng rậm rạp và
     hiệu ứng hover không còn nói lên điều gì. */
  const moNgu = await doMo(the);
  check('Chưa rê chuột thì không lá nào hiện', moNgu.every((m) => m === 0), moNgu.slice(0, 4).join(' '));
  const dashNgu = await the
    .locator('[data-testid=day-leo]')
    .evaluate((e) => getComputedStyle(e).strokeDashoffset);
  check('Chưa rê chuột thì dây leo chưa vẽ nét nào', parseFloat(dashNgu) > 90, dashNgu);

  /* --- ĐO GIỮA CHỪNG: đây là phép chính --------------------------------------- */
  await page.mouse.move(o.x + o.width / 2, o.y + o.height / 2);
  await page.waitForTimeout(VONG_MS * 0.45);
  const giua = await doMo(the);

  const noRoi = giua.filter((m) => m > 0.9).length;
  check(
    'Giữa chừng: một phần lá đã nở, phần còn lại chưa',
    noRoi > 0 && noRoi < SO_LA,
    `${noRoi}/${SO_LA} lá đã nở`
  );

  /*
   * Ranh giới phải LIỀN MỘT KHỐI theo thứ tự DOM. Thứ tự DOM chính là thứ tự kim đồng
   * hồ (cạnh trên trái→phải, rồi phải, rồi dưới, rồi trái), nên "mọi lá trước ranh giới
   * đều nở, mọi lá sau đều chưa" đúng là định nghĩa của mọc theo vòng. Đặt độ trễ ngược
   * chiều hay xáo trộn thì phép này đỏ, còn phép đếm ở trên vẫn xanh.
   */
  const ranh = giua.findIndex((m) => m < 0.1);
  const truocRanhDeuNo = giua.slice(0, ranh).every((m) => m > 0.5);
  const sauRanhDeuChua = giua.slice(ranh).every((m) => m < 0.5);
  check(
    'Lá nở theo đúng thứ tự vòng quanh, không nhảy cóc',
    ranh > 0 && truocRanhDeuNo && sauRanhDeuChua,
    giua.map((m) => m.toFixed(1)).join(' ')
  );
  check(
    'Lá cạnh TRÊN nở trước lá cạnh TRÁI (tức đi theo chiều kim đồng hồ)',
    giua[0] > giua[SO_LA - 1],
    `lá đầu ${giua[0].toFixed(2)} · lá cuối ${giua[SO_LA - 1].toFixed(2)}`
  );

  /* --- Hết vòng ---------------------------------------------------------------- */
  await page.waitForTimeout(VONG_MS);
  const het = await doMo(the);
  check('Hết một vòng thì đủ 16 lá đều hiện', het.every((m) => m > 0.9), `${het.filter((m) => m > 0.9).length}/${SO_LA}`);
  const dashHet = await the
    .locator('[data-testid=day-leo]')
    .evaluate((e) => getComputedStyle(e).strokeDashoffset);
  check('Hết một vòng thì dây leo khép kín', parseFloat(dashHet) < 1, dashHet);

  /* Chỉ thẻ ĐANG rê chuột mới mọc. Thiếu điều này thì cả lưới 24 thẻ cùng rậm lên một
     lúc, và cái thẻ bé đang chỉ vào không còn nổi bật hơn cái nào. */
  const theKhac = page.locator('.kg-the-game').nth(1);
  if ((await theKhac.count()) > 0) {
    const moKhac = await doMo(theKhac);
    check('Thẻ bên cạnh KHÔNG mọc theo', moKhac.every((m) => m === 0), `${moKhac.filter((m) => m > 0).length} lá hiện`);
  }

  /* --- Rời chuột --------------------------------------------------------------- */
  await page.mouse.move(o.x + o.width / 2, o.y - 200);
  await page.waitForTimeout(VONG_MS + 300);
  const roi = await doMo(the);
  check('Rời chuột thì lá rụng hết', roi.every((m) => m < 0.1), `${roi.filter((m) => m > 0.1).length} lá còn hiện`);

  /* --- Không được chặn cú bấm --------------------------------------------------- */
  const hut = await the
    .locator('[data-testid=la-vien]')
    .first()
    .evaluate((e) => getComputedStyle(e).pointerEvents);
  check('Lá không bắt sự kiện chuột', hut === 'none', hut);
  const hutDay = await the
    .locator('[data-testid=day-leo]')
    .evaluate((e) => getComputedStyle(e.closest('svg')).pointerEvents);
  check('Dây leo không bắt sự kiện chuột', hutDay === 'none', hutDay);

  /* Bấm vào ĐÚNG CHỖ một chiếc lá đang che, sau khi đã mọc đủ — vẫn phải mở được game.
     Đây là phép duy nhất chứng minh trang trí không ăn mất cú bấm của một đứa trẻ. */
  await page.mouse.move(o.x + o.width / 2, o.y + o.height / 2);
  await page.waitForTimeout(VONG_MS + 200);
  /*
   * Bấm vào phần lá NẰM ĐÈ LÊN mặt thẻ, không phải tâm chiếc lá: lá đặt tâm đúng trên
   * đường viền nên một nửa nhô ra ngoài thẻ, bấm vào tâm là bấm trúng khoảng trống
   * giữa hai thẻ.
   *
   * Bấm qua `locator.click({position})` chứ KHÔNG qua `mouse.click(x, y)` với toạ độ
   * tự tính. Hai lý do, cả hai đều đã làm phép này đỏ oan một lượt:
   *  - Thẻ NHẤC LÊN 4px khi rê chuột, nên toạ độ đo trước lúc hover đã lệch.
   *  - `locator.click` tự kiểm rằng chính phần tử ấy nhận được cú bấm. Nếu chiếc lá
   *    nuốt mất cú bấm, Playwright ném lỗi ngay thay vì bấm hụt trong im lặng — tức
   *    chính điều phép này muốn canh lại là thứ nó tự kiểm hộ.
   */
  const link = the.locator('[data-testid=game-card]');
  const oLink = await link.boundingBox();
  const laTren = await the.locator('[data-testid=la-vien]').nth(1).boundingBox();
  await link.click({
    position: {
      x: laTren.x + laTren.width / 2 - oLink.x,
      y: Math.min(Math.max(laTren.y + laTren.height / 2 - oLink.y, 4), oLink.height - 4),
    },
  });
  /* `waitForURL`, KHÔNG phải `waitForLoadState('networkidle')`: điều hướng ở đây do
     router phía client làm, mà trang thì vốn đã rảnh mạng nên `networkidle` trả về
     NGAY LẬP TỨC — đọc địa chỉ lúc ấy vẫn là trang chủ, và phép kiểm đỏ oan. Đã đỏ oan
     thật hai lượt, và cả hai lượt mình đi sửa nhầm chỗ khác. */
  await page.waitForURL(/\/game\//, { timeout: 10000 }).catch(() => {});
  check('Bấm trúng chiếc lá vẫn mở được trang game', /\/game\//.test(page.url()), page.url());

  /* --- Người xin ít chuyển động -------------------------------------------------- */
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p2 = await ctx2.newPage();
  await p2.goto(APP, { waitUntil: 'networkidle' });
  const the2 = p2.locator('.kg-the-game').first();
  await the2.scrollIntoViewIfNeeded();
  const o2 = await the2.boundingBox();
  await p2.mouse.move(o2.x + o2.width / 2, o2.y + o2.height / 2);
  await p2.waitForTimeout(120);
  const mo2 = await doMo(the2);
  /* Lá vẫn HIỆN, chỉ là hiện ngay: người xin ít chuyển động không phải người xin ít nội
     dung. Và hiện ngay ở mốc 120ms — sớm hơn hẳn 900ms của một vòng — là bằng chứng độ
     trễ đã bị vô hiệu chứ không phải chạy nhanh hơn. */
  check(
    'Xin ít chuyển động: lá hiện ngay, không bò vòng',
    mo2.every((m) => m > 0.9),
    `${mo2.filter((m) => m > 0.9).length}/${SO_LA} lá đã hiện sau 120ms`
  );
} finally {
  await browser.close();
}

const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
