/**
 * Rê chuột vào thẻ game thì lá mọc quanh viền, THEO CHIỀU KIM ĐỒNG HỒ (fen chốt 22/9).
 *
 * VÌ SAO KHÔNG CHỈ ĐẾM LÁ. Một bản cài sai — bỏ hết độ trễ, hoặc đặt độ trễ ngược —
 * vẫn cho ra đủ 104 chiếc lá hiện ra khi hover, và mọi phép đếm vẫn xanh. Thứ duy nhất
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
/** Số lá quanh viền = `LA_MOI_CANH` × 4 trong `components/game-card.tsx`. */
const SO_LA = 104;
/** Số hoa xen viền = `HOA_MOI_CANH` × 4. */
const SO_HOA = 20;
/** Thời gian dây leo bò hết một vòng, khớp `VONG_MS`. */
const VONG_MS = 900;

const results = [];
const check = (ten, ok, chiTiet = '') => {
  results.push({ ten, ok });
  console.log(`${ok ? '✅' : '❌'} ${ten}${chiTiet ? ` — ${chiTiet}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

/** Độ mờ của 104 lá trên MỘT thẻ, theo đúng thứ tự trong DOM = thứ tự kim đồng hồ. */
async function doMo(the) {
  return the
    .locator('[data-testid=la-vien] > svg')
    .evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
}

/** Độ mờ của hoa xen viền trên MỘT thẻ, theo thứ tự DOM. */
async function doMoHoa(the) {
  return the
    .locator('[data-testid=hoa-vien] > svg')
    .evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
}

/** Độ mờ của bốn cành góc trên MỘT thẻ, theo thứ tự DOM. */
async function doMoCanh(the) {
  return the
    .locator('[data-testid=canh-goc]')
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

  /* Bốn cành góc — fen cho quay lại 23/9, chạy CÙNG lá viền chứ không thay nhau. Bản
     cũ không có `data-testid` nào nên suốt thời gian đó không phép kiểm nào giữ chúng;
     lúc chúng bị gỡ ở `7420bdf` cả bộ kiểm vẫn xanh trơn. */
  const canh = the.locator('[data-testid=canh-goc]');
  check('Thẻ có đủ bốn cành góc', (await canh.count()) === 4, `${await canh.count()} cành`);

  const hoa = the.locator('[data-testid=hoa-vien]');
  check('Thẻ có đủ hoa xen viền', (await hoa.count()) === SO_HOA, `${await hoa.count()} bông`);

  /* Chưa rê chuột: mọi thứ phải TÀNG HÌNH. Hiện sẵn thì thẻ lúc nào cũng rậm rạp và
     hiệu ứng hover không còn nói lên điều gì. */
  const moNgu = await doMo(the);
  check('Chưa rê chuột thì không lá nào hiện', moNgu.every((m) => m === 0), moNgu.slice(0, 4).join(' '));
  const dashNgu = await the
    .locator('[data-testid=day-leo]')
    .evaluate((e) => getComputedStyle(e).strokeDashoffset);
  check('Chưa rê chuột thì dây leo chưa vẽ nét nào', parseFloat(dashNgu) > 90, dashNgu);
  const canhNgu = await doMoCanh(the);
  check(
    'Chưa rê chuột thì không cành nào hiện',
    canhNgu.length === 4 && canhNgu.every((m) => m === 0),
    `${canhNgu.length} cành · ${canhNgu.join(' ')}`
  );

  const hoaNgu = await doMoHoa(the);
  check(
    'Chưa rê chuột thì không bông hoa nào hiện',
    hoaNgu.length === SO_HOA && hoaNgu.every((m) => m === 0),
    `${hoaNgu.length} bông · ${hoaNgu.slice(0, 4).join(' ')}`
  );

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
    giamDan && giua[0] > 0.9 && giua.at(-1) < 0.05,
    giua.map((m) => m.toFixed(1)).join(' ')
  );

  check(
    'Lá cạnh TRÊN nở trước lá cạnh TRÁI (tức đi theo chiều kim đồng hồ)',
    giua[0] > giua.at(-1),
    `lá đầu ${giua[0].toFixed(2)} · lá cuối ${giua.at(-1).toFixed(2)}`
  );

  /* --- Hết vòng ---------------------------------------------------------------- */
  await page.waitForTimeout(VONG_MS);
  const het = await doMo(the);
  check('Hết một vòng thì đủ 104 lá đều hiện', het.every((m) => m > 0.9), `${het.filter((m) => m > 0.9).length}/${SO_LA}`);
  const dashHet = await the
    .locator('[data-testid=day-leo]')
    .evaluate((e) => getComputedStyle(e).strokeDashoffset);
  check('Hết một vòng thì dây leo khép kín', parseFloat(dashHet) < 1, dashHet);
  const canhHet = await doMoCanh(the);
  check(
    'Hết một vòng thì cả bốn cành góc đều mọc',
    canhHet.length === 4 && canhHet.every((m) => m > 0.9),
    `${canhHet.length} cành · ${canhHet.join(' ')}`
  );

  const hoaHet = await doMoHoa(the);
  check(
    'Hết một vòng thì cả hai mươi bông hoa đều nở',
    hoaHet.length === SO_HOA && hoaHet.every((m) => m > 0.9),
    `${hoaHet.filter((m) => m > 0.9).length}/${SO_HOA}`
  );

  /*
   * MỌI BÔNG PHẢI LÓ RA khỏi mép thẻ. Hoa neo ở gốc cuống rồi thụt vào trong cho chỗ
   * dính khuất sau thẻ — thụt quá tay thì cả bông nằm gọn sau thẻ và không ai thấy gì,
   * mà phép đếm lẫn phép độ mờ đều vẫn xanh vì bông ấy vẫn tồn tại và vẫn `opacity: 1`.
   * Cuống hoa ngắn hơn thân lá nhiều nên đây là chỗ dễ thụt quá tay nhất.
   */
  const hopThe2 = await the.locator('[data-testid=game-card]').boundingBox();
  const loRaHoa = await the.locator('[data-testid=hoa-vien]').evaluateAll(
    (els, t) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return Math.max(t.x - r.x, r.x + r.width - (t.x + t.width), t.y - r.y, r.y + r.height - (t.y + t.height));
      }),
    hopThe2
  );
  const nuot = loRaHoa.filter((v) => v <= 2).length;
  check(
    'Không bông hoa nào bị thẻ nuốt mất',
    loRaHoa.length === SO_HOA && nuot === 0,
    `ló ra ít nhất ${Math.min(...loRaHoa).toFixed(1)}px · ${nuot} bông khuất`
  );

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
  /* Cành chìa HẲN ra ngoài thẻ, đè lên khoảng trống giữa các thẻ và lên cả thẻ bên
     cạnh — thiếu `pointer-events-none` là nó nuốt cú bấm của thẻ hàng xóm. */
  const hutCanh = await the
    .locator('[data-testid=canh-goc]')
    .first()
    .evaluate((e) => getComputedStyle(e).pointerEvents);
  check('Cành góc không bắt sự kiện chuột', hutCanh === 'none', hutCanh);
  const hutHoa = await the
    .locator('[data-testid=hoa-vien]')
    .first()
    .evaluate((e) => getComputedStyle(e).pointerEvents);
  check('Hoa viền không bắt sự kiện chuột', hutHoa === 'none', hutHoa);
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

  /*
   * --- VIỀN PHẢI KÍN, KHÔNG CÒN KHE HỞ (fen chốt 22/9) ---------------------------
   *
   * Đây là phép giữ đúng thứ fen yêu cầu, và nó không suy ra được từ phép đếm: 28 lá
   * cũng "đủ số" như 104 lá, chỉ là viền hở 26,7px giữa các chiếc.
   *
   * ĐO THEO PHÉP QUÉT, dồn mép xa nhất đã phủ tới — KHÔNG so với riêng chiếc liền
   * trước. Lá xen ba cỡ, nên một chiếc bé lọt giữa hai chiếc to có mép cuối nằm sâu
   * trong vùng chiếc to đã phủ; so kiểu "chiếc trước" báo khe hở KHÔNG CÓ THẬT, và
   * lượt đo đầu đã dính đúng bẫy đó — nó báo còn hở cả khi lá chồng nhau gấp đôi bước.
   *
   * Đo ở BA KHỔ vì mật độ lá phụ thuộc cỡ thẻ: lá đặt theo phần trăm, còn thẻ thì co
   * giãn theo số cột (154px rộng ở điện thoại, 234px ở máy tính). Khổ rộng là khổ
   * thưa nhất, tức khổ dễ hở nhất.
   */
  for (const khoMan of [360, 768, 1280]) {
    const ctxK = await browser.newContext({ viewport: { width: khoMan, height: 900 } });
    const pK = await ctxK.newPage();
    await pK.goto(APP, { waitUntil: 'domcontentloaded' });
    const theK = pK.locator('.kg-the-game').first();
    await theK.scrollIntoViewIfNeeded();
    await theK.hover();
    await pK.waitForTimeout(VONG_MS + 300);

    const hop = await theK.locator('[data-testid=la-vien]').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      })
    );
    const moiCanh = hop.length / 4;
    let hoNhat = -Infinity;
    for (let c = 0; c < 4; c += 1) {
      /* Cạnh trên và dưới nằm ngang nên chỗ mỗi lá chiếm dọc viền là bề RỘNG hộp bao
         của nó; hai cạnh kia thì là bề CAO. Hộp bao đã tính cả phép xoay. */
      const ngang = c === 0 || c === 2;
      const khoang = hop
        .slice(c * moiCanh, (c + 1) * moiCanh)
        .map((b) => (ngang ? [b.x, b.x + b.w] : [b.y, b.y + b.h]))
        .sort((a, b) => a[0] - b[0]);
      let toi = khoang[0][1];
      for (let i = 1; i < khoang.length; i += 1) {
        if (khoang[i][0] - toi > hoNhat) hoNhat = khoang[i][0] - toi;
        if (khoang[i][1] > toi) toi = khoang[i][1];
      }
    }
    check(
      `Viền kín hết, không khe hở ở khổ ${khoMan}px`,
      hoNhat <= 0,
      `khe hở lớn nhất ${hoNhat.toFixed(1)}px (số âm = lá chồng nhau)`
    );
    await ctxK.close();
  }

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
