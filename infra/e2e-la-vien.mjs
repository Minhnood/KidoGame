/**
 * Rê chuột vào thẻ game thì lá mọc quanh viền, THEO CHIỀU KIM ĐỒNG HỒ (fen chốt 22/9).
 *
 * VÌ SAO KHÔNG CHỈ ĐẾM LÁ. Một bản cài sai — bỏ hết độ trễ, hoặc đặt độ trễ ngược —
 * vẫn cho ra đủ 28 chiếc lá hiện ra khi hover, và mọi phép đếm vẫn xanh. Thứ duy nhất
 * phân biệt được là ĐO GIỮA CHỪNG: chụp độ mờ của từng chiếc ở một thời điểm cố định
 * sau khi chuột vào, rồi xem lá nào đã nở, lá nào chưa. Đúng chiều thì ranh giới nằm
 * gọn ở một chỗ và mọi lá trước nó đều nở, mọi lá sau nó đều chưa.
 *
 * VÌ SAO CÓ PHÉP "KHÔNG CHẶN CÚ BẤM". Lá nằm SAU thẻ nhưng nửa ngoài của nó ló ra ngoài
 * mép, tức nằm trên vùng người ta vẫn bấm trúng; dây leo thì nằm hẳn TRƯỚC mặt thẻ.
 * Thiếu `pointer-events-none` là một đứa trẻ bấm trúng trang trí và game không mở, mà
 * lỗi ấy không bao giờ hiện ra trong ảnh chụp màn hình.
 *
 * Chạy (cần app đang chạy, trang chủ có ít nhất 1 game):
 *   node infra/e2e-la-vien.mjs
 */
import { chromium } from 'playwright';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
/** Số lá quanh viền, khớp bảng `LA_VIEN` trong `components/game-card.tsx`. */
const SO_LA = 28;
/** Thời gian dây leo bò hết một vòng, khớp `VONG_MS`. */
const VONG_MS = 900;

const results = [];
const check = (ten, ok, chiTiet = '') => {
  results.push({ ten, ok });
  console.log(`${ok ? '✅' : '❌'} ${ten}${chiTiet ? ` — ${chiTiet}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

/** Độ mờ của 28 lá trên MỘT thẻ, theo đúng thứ tự trong DOM = thứ tự kim đồng hồ. */
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
   * ĐỘ MỜ PHẢI GIẢM DẦN theo thứ tự DOM, và thứ tự DOM chính là thứ tự kim đồng hồ
   * (cạnh trên trái→phải, rồi phải, rồi dưới, rồi trái). Đó đúng là dấu vết của một
   * vòng quét: chiếc nào dây bò qua trước thì nở nhiều hơn chiếc sau nó.
   *
   * KHÔNG đòi ranh giới nở/chưa nở gọn thành một điểm — bản đầu đòi thế và ĐỎ OAN khi
   * số lá tăng từ 16 lên 28: lá dày hơn thì tại một thời điểm có cả một dải đang nở dở
   * (0,9 · 0,8 · 0,6 · 0,3), hoàn toàn đúng, mà phép kiểm lại gọi đó là nhảy cóc.
   *
   * Đảo chiều độ trễ thì dãy này tăng dần chứ không giảm, nên phép vẫn đỏ đúng lúc cần.
   */
  const giamDan = giua.every((m, i) => i === 0 || m <= giua[i - 1] + 0.02);
  check(
    'Lá nở theo đúng thứ tự vòng quanh, không nhảy cóc',
    giamDan && giua[0] > 0.9 && giua[SO_LA - 1] < 0.05,
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
  check('Hết một vòng thì đủ 28 lá đều hiện', het.every((m) => m > 0.9), `${het.filter((m) => m > 0.9).length}/${SO_LA}`);
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

  /*
   * LÁ NẰM SAU THẺ — fen chốt. Mỗi chiếc neo ở gốc và vươn ra ngoài, nhưng gốc thụt vào
   * trong nên có một khúc chồng lên thẻ. Tìm đúng khúc chồng ấy rồi hỏi trình duyệt "ở
   * điểm này, phần tử trên cùng là ai": phải là THẺ, không phải chiếc lá.
   *
   * Đọc thứ tự DOM thì không đủ — `z-index` hay một stacking context mới ở đâu đó vẫn
   * lật ngược được, và đó đúng là cái bẫy đã ghi trong `game-card.tsx`.
   */
  const cardBox = await the.locator('[data-testid=game-card]').boundingBox();
  let chongLen = null;
  for (let i = 0; i < SO_LA && !chongLen; i += 1) {
    const l = await the.locator('[data-testid=la-vien]').nth(i).boundingBox();
    /* Phần giao giữa hộp chiếc lá và hộp thẻ — tức khúc gốc lá bị thẻ che. */
    const x1 = Math.max(l.x, cardBox.x);
    const x2 = Math.min(l.x + l.width, cardBox.x + cardBox.width);
    const y1 = Math.max(l.y, cardBox.y);
    const y2 = Math.min(l.y + l.height, cardBox.y + cardBox.height);
    if (x2 - x1 > 2 && y2 - y1 > 2) chongLen = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }
  check('Có lá chồng một phần lên thẻ (gốc lá khuất sau thẻ)', !!chongLen, JSON.stringify(chongLen));

  const oTrenCung = chongLen
    ? await page.evaluate(
        ([x, y]) => {
          /* Tạm cho lá bắt chuột rồi trả lại: `elementFromPoint` BỎ QUA phần tử có
             `pointer-events: none`, nên hỏi thẳng thì câu trả lời luôn là thẻ, kể cả khi
             lá nằm đè lên trên. Đã thử cho đỏ và phát hiện đúng chỗ này. */
          const las = [...document.querySelectorAll('[data-testid=la-vien]')];
          las.forEach((el) => (el.style.pointerEvents = 'auto'));
          const e = document.elementFromPoint(x, y);
          const ra = {
            the: !!e?.closest('[data-testid=game-card]'),
            la: !!e?.closest('[data-testid=la-vien]'),
          };
          las.forEach((el) => el.style.removeProperty('pointer-events'));
          return ra;
        },
        [chongLen.x, chongLen.y]
      )
    : { the: false, la: true };
  check(
    'Lá nằm SAU thẻ: chỗ lá chồng lên thẻ thì thẻ vẫn ở trên cùng',
    oTrenCung.the && !oTrenCung.la,
    JSON.stringify(oTrenCung)
  );

  /*
   * HÀNG RÀO CẮT NGANG phải còn đó. Lá chìa ra ngoài mép thẻ, nên thẻ ở cột ngoài cùng
   * chìa ra ngoài khung trang; thứ duy nhất giữ cho trang không phải vuốt ngang trên
   * điện thoại là `overflow-x-clip` ở `<main>` (xem ghi chú trong `layout.tsx`).
   *
   * Phép cũ đo "trang có cuộn ngang không" và nó LUÔN XANH — chính hàng rào này làm nó
   * không bao giờ đỏ được, kể cả với bản lá to gấp ba. Đo thẳng hàng rào thì mới có cái
   * để đỏ: ai gỡ nó đi là biết ngay.
   */
  const rao = await page.locator('main#noi-dung').evaluate((e) => getComputedStyle(e).overflowX);
  check('`<main>` còn hàng rào cắt ngang cho trang trí chìa ra', /clip|hidden/.test(rao), rao);

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
