/**
 * Kiểm khả năng dùng bằng BÀN PHÍM và trình đọc màn hình.
 *
 * VÌ SAO tách riêng, không nhét vào `e2e-check.mjs`: đây là một chiều quan tâm
 * khác, đúng như `contrast-check.mjs` đã tách. Tương phản và bàn phím hỏng theo
 * hai kiểu khác nhau, và người phải trả giá cũng khác nhau.
 *
 * VÌ SAO đáng có: dự án đã đo tương phản tới AAA cho mắt trẻ và đã khai riêng
 * token `--color-focus`. Nhưng vòng focus có tồn tại trong CSS không có nghĩa là
 * nó HIỆN trên mọi phần tử, và một trang tab được không có nghĩa là tab được đến
 * chỗ cần đến. Có bé chỉ dùng bàn phím, có bé khó điều khiển chuột — với các bé
 * đó thì đây không phải chi tiết phụ, đây là có vào được hay không.
 *
 * Chạy (cần dev server ở cổng 3000):
 *   node infra/a11y-check.mjs
 *
 * Đổi đích:  APP=https://app.localhost node infra/a11y-check.mjs
 */
import { chromium } from 'playwright';

const APP = process.env.APP ?? 'http://localhost:3000';
const CHILD_USER = process.env.DEMO_CHILD ?? 'beminh';
const CHILD_PASSWORD = process.env.DEMO_CHILD_PASSWORD ?? 'be1234';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });
const guest = await browser.newContext({ ignoreHTTPSErrors: true });

/*
 * Context riêng cho bé. Cần vì bé đã đăng nhập thì /dang-nhap CHUYỂN HƯỚNG về
 * trang chủ — đo bằng một context đã đăng nhập là đo trang chủ ba lần rồi tưởng
 * ba trang đăng nhập đều giống nhau. Đã vấp đúng vậy ở lần soi đầu.
 */
const child = await browser.newContext({ ignoreHTTPSErrors: true });
{
  const p = await child.newPage();
  await p.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await p.fill('input[name=username]', CHILD_USER);
  await p.fill('input[name=password]', CHILD_PASSWORD);
  await p.locator('main button[type=submit]').first().click();
  await p.waitForURL((u) => !u.pathname.includes('be-dang-nhap'), { timeout: 20000 }).catch(() => {});
  await p.close();
}

// ---------------------------------------------------------------------------
// Link nhảy tới nội dung
// ---------------------------------------------------------------------------
console.log('\n── Link nhảy tới nội dung ──────────────────────────────────');
{
  const page = await guest.newPage();
  await page.goto(APP, { waitUntil: 'networkidle' });

  // Ẩn với người dùng chuột, nhưng KHÔNG được `display:none` — thế thì bàn phím
  // cũng không tới được, và link thành vô dụng.
  const atRest = await page.evaluate(() => {
    const a = document.querySelector('a[href="#noi-dung"]');
    if (!a) return 'không có link';
    const box = a.getBoundingClientRect();
    return box.width <= 1 && box.height <= 1 ? 'ẩn' : `hiện ${Math.round(box.width)}×${Math.round(box.height)}`;
  });
  check('Chưa focus thì người dùng chuột không thấy', atRest === 'ẩn', atRest);

  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      href: el?.getAttribute('href'),
      text: el?.textContent?.trim().slice(0, 40),
      width: Math.round(el.getBoundingClientRect().width),
    };
  });
  check('Tab đầu tiên rơi vào link nhảy', first.href === '#noi-dung', first.text);
  check('Được focus thì nó hiện ra', first.width > 20, `rộng ${first.width}px`);

  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const landed = await page.evaluate(() => ({
    id: document.activeElement?.id,
    tag: document.activeElement?.tagName,
  }));
  /*
   * Đây là phép kiểm đáng giá nhất của cả mục này.
   *
   * Thiếu `tabIndex={-1}` trên <main> thì trình duyệt vẫn CUỘN tới nội dung —
   * trông như link hoạt động — nhưng focus còn ở link cũ, nên lần Tab tiếp theo
   * quay về thanh điều hướng, đúng con đường vừa muốn bỏ qua. Phần lớn link nhảy
   * trên mạng hỏng theo đúng kiểu này, và kiểm bằng mắt thì không thấy.
   */
  check('Bấm Enter thì focus chuyển vào chính <main>', landed.id === 'noi-dung', `${landed.tag}#${landed.id}`);

  await page.keyboard.press('Tab');
  const next = await page.evaluate(() => ({
    inMain: !!document.activeElement?.closest('main'),
    text: (document.activeElement?.textContent || '').trim().slice(0, 30),
  }));
  check('Tab tiếp theo ở TRONG nội dung, không quay về nav', next.inMain, next.text);
  await page.close();
}

// ---------------------------------------------------------------------------
// Từng trang
// ---------------------------------------------------------------------------
const PAGES = [
  ['/', 'khách'],
  ['/dang-nhap', 'khách'],
  ['/be-dang-nhap', 'khách'],
  ['/dang-ky', 'khách'],
  ['/quen-mat-khau', 'khách'],
  ['/dieu-khoan', 'khách'],
  ['/bao-cao-ban-quyen', 'khách'],
  ['/upload', 'bé'],
  /* Trang 404 — chưa từng được quét ở đây, dù nó là trang mà người dùng rơi vào
     đúng lúc đang bối rối nhất, và là trang DUY NHẤT không ai chủ động mở. Đường
     dẫn này cố ý vô nghĩa: nó phải không bao giờ tồn tại. */
  ['/khong-co-duong-nay-a11y', 'khách'],
];

console.log('\n── Từng trang ──────────────────────────────────────────────');
for (const [path, role] of PAGES) {
  const page = await (role === 'bé' ? child : guest).newPage();
  await page.goto(APP + path, { waitUntil: 'networkidle' });

  const landedPath = new URL(page.url()).pathname;
  if (landedPath !== path) {
    check(`${path} mở đúng trang đó`, false, `bị chuyển hướng sang ${landedPath}`);
    await page.close();
    continue;
  }

  const info = await page.evaluate(() => {
    const h1 = [...document.querySelectorAll('h1')];
    const unlabeled = [];
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      const labelled =
        (el.id && document.querySelector(`label[for="${el.id}"]`)) ||
        el.closest('label') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby');
      if (!labelled) unlabeled.push(`${el.tagName}[name=${el.name || '?'}]`);
    }
    return {
      lang: document.documentElement.lang,
      h1Count: h1.length,
      h1Text: h1[0]?.textContent.trim().slice(0, 30) ?? '',
      imgNoAlt: document.querySelectorAll('img:not([alt])').length,
      unlabeled,
      main: document.querySelectorAll('main').length,
    };
  });

  // Trình đọc màn hình phát âm theo `lang`. Sai thì tiếng Việt đọc bằng giọng Anh.
  const problems = [
    info.lang !== 'vi' ? `lang=${info.lang || 'thiếu'}` : null,
    // Đúng MỘT h1: nhiều h1 làm trình đọc màn hình mất mốc "trang này nói về gì".
    info.h1Count !== 1 ? `${info.h1Count} thẻ h1` : null,
    info.imgNoAlt ? `${info.imgNoAlt} ảnh thiếu alt` : null,
    info.unlabeled.length ? `ô nhập không label: ${info.unlabeled.join(', ')}` : null,
    info.main !== 1 ? `${info.main} thẻ main` : null,
  ].filter(Boolean);

  // Vòng focus phải NHÌN THẤY trên mọi phần tử tab tới được. Tồn tại trong CSS
  // không đủ — một `outline: none` ở đâu đó là đủ để mất dấu bàn phím.
  const invisible = [];
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const el = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      /*
       * Bỏ qua `<nextjs-portal>`: đó là lớp overlay báo lỗi của Next ở chế độ
       * dev, không phải phần của sản phẩm, và nó không có vòng focus. Không loại
       * ra thì MỌI trang đều báo đỏ ở dev vì một thứ không tồn tại trên
       * production — kiểu báo động giả làm người ta bỏ luôn cả bộ kiểm.
       */
      if (e.tagName === 'NEXTJS-PORTAL' || e.closest('nextjs-portal')) return { skip: true };
      const s = getComputedStyle(e);
      const ring =
        (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
      return {
        key: e.tagName + ':' + (e.getAttribute('aria-label') || e.textContent || e.name || '').trim().slice(0, 20),
        ring,
      };
    });
    if (!el) break;
    if (el.skip) continue;
    if (seen.has(el.key)) break; // đã vòng lại đầu
    seen.add(el.key);
    if (!el.ring) invisible.push(el.key);
  }
  if (invisible.length) problems.push(`không thấy vòng focus: ${invisible.join(', ')}`);

  check(
    `[${role}] ${path}`,
    problems.length === 0,
    problems.length ? problems.join(' | ') : `h1 "${info.h1Text}", ${seen.size} điểm tab`
  );
  await page.close();
}

// ---------------------------------------------------------------------------
// Tràn ngang trên máy nhỏ
// ---------------------------------------------------------------------------
/*
 * VÌ SAO có mục này: ngày 29/8 một bản vá thanh điều hướng làm trang tràn ngang
 * 31px ở 360px rồi 2px ở 320px — và KHÔNG bộ kiểm nào bắt được. Nó lộ ra chỉ vì
 * tình cờ có người đi đo. Lần soi "điện thoại rẻ" hôm 28/8 cũng có đo `scrollWidth`,
 * nhưng đó là một lần soi tay: soi xong là hết, không để lại gì canh giúp lần sau.
 *
 * Tràn ngang là loại lỗi đặc biệt đáng canh tự động vì nó KHÔNG gây lỗi gì cả —
 * trang vẫn 200, vẫn render, chỉ là phải vuốt ngang mới đọc hết. Trên máy tính của
 * người viết code thì không bao giờ thấy.
 *
 * 320px là máy nhỏ nhất còn đáng đỡ (iPhone SE đời đầu, máy cũ bố mẹ thải lại);
 * 360px là bề rộng phổ biến nhất của điện thoại Android giá rẻ.
 */
console.log('\n── Tràn ngang trên máy nhỏ ─────────────────────────────────');
{
  // Trang chơi game phải lấy id thật — đây là trang có phần tử rộng nhất (khung
  // game 720px), tức là chỗ dễ tràn nhất, nên bỏ qua nó là bỏ qua đúng chỗ cần đo.
  const probe = await guest.newPage();
  await probe.goto(APP, { waitUntil: 'networkidle' });
  const gameHref = await probe
    .locator('a[href^="/game/"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  await probe.close();

  const duong = [...PAGES.filter(([, role]) => role === 'khách').map(([p]) => p)];
  if (gameHref) duong.push(gameHref);

  for (const width of [320, 360, 390, 414]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 780 },
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    const tran = [];
    const chuLanLe = [];

    for (const path of duong) {
      await page.goto(APP + path, { waitUntil: 'networkidle' });
      const ket = await page.evaluate(() => {
        const de = document.documentElement;
        const thua = de.scrollWidth - de.clientWidth;
        if (thua <= 0) return null;
        /*
         * Chỉ ra phần tử nào thò ra. Không có dòng này thì báo lỗi chỉ nói "tràn
         * 31px" và người sửa phải tự đi dò từng thẻ — mà tràn ngang thường do đúng
         * MỘT phần tử không chịu co lại.
         */
        let thu_pham = '(không xác định)';
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.right > de.clientWidth + 0.5) {
            const cls = (el.className?.toString?.() ?? '').trim().slice(0, 50);
            thu_pham = el.tagName.toLowerCase() + (cls ? `.${cls}…` : '');
            break;
          }
        }
        return { thua, thu_pham };
      });
      if (ket) tran.push(`${path} thừa ${ket.thua}px ← ${ket.thu_pham}`);

      /*
       * HAI DẢI 20px SÁT MÉP PHẢI SẠCH CHỮ, và đây không phải chuyện thẩm mỹ.
       *
       * Dây leo trang trí (`DayLeoVien`) vẽ đúng trong hai dải ấy, vì `px-5` của
       * `page.tsx` là toàn bộ chỗ trên màn điện thoại mà không dòng chữ nào chạm
       * tới. Đổi padding xuống `px-4` — một dòng, ở một file khác, và nghe như một
       * chỉnh sửa lành — là chữ tràn vào chỗ có lá và hoa, tức chữ nằm trên hình
       * trang trí. Không phép kiểm nào khác thấy: trang vẫn không vuốt ngang, tương
       * phản vẫn đo trên `bg` như cũ, và chữ vẫn đọc được ở phần lớn dòng.
       *
       * Đo bằng RANGE của từng đoạn chữ, không bằng hộp của phần tử: hộp của một
       * <p> rộng suốt cột nội dung nên nó luôn chạm 20px, còn dòng chữ thật thì có
       * thể ngắn hơn nhiều. Cái đáng canh là mực, không phải cái hộp.
       */
      const dungChu = await page.evaluate((duongDan) => {
        const LE = 20;
        const W = document.documentElement.clientWidth;
        const xau = [];
        const di = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = di.nextNode(); n; n = di.nextNode()) {
          if (!n.nodeValue.trim()) continue;
          /* Bỏ qua chữ nằm trong chính lớp trang trí và trong link "bỏ qua nav"
             (nó `sr-only`, bị `clip` về 1×1 ở góc trên trái). */
          const cha = n.parentElement;
          if (!cha || cha.closest('[data-kg-decor], .sr-only, svg')) continue;
          /*
           * VÀ bỏ qua chữ nằm trên một nền ĐỤC. Dây leo là lớp `z-index: -1`, nên
           * nó chỉ hiện ra ở chỗ mọi tổ tiên của đoạn chữ đều trong suốt. Bản đầu
           * của phép kiểm không có đoạn này và nó báo đỏ ngay ở 360px vì cái emoji
           * 🖥️ của nút đổi giao diện chạm dải 20px — mà nút ấy nằm trong thanh nav,
           * thứ có nền đặc phủ suốt bề ngang, nên ở đó không có lá nào để mà đè.
           * Xét theo nền thay vì liệt kê tên thẻ: mai này ai đặt chữ lên một tấm
           * nền đục mới thì không phải quay lại sửa danh sách.
           */
          let dangBiChe = false;
          for (let e = cha; e && e !== document.documentElement; e = e.parentElement) {
            const nen = getComputedStyle(e).backgroundColor;
            const m = nen.match(/^rgba?\(([^)]+)\)$/);
            const phan = m ? m[1].split(',').map((v) => parseFloat(v)) : null;
            if (phan && (phan.length < 4 || phan[3] > 0)) {
              dangBiChe = true;
              break;
            }
          }
          if (dangBiChe) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          for (const box of r.getClientRects()) {
            if (box.width < 1 || box.height < 1) continue;
            if (box.left < LE - 0.5 || box.right > W - LE + 0.5) {
              xau.push(
                `${duongDan} "${n.nodeValue.trim().slice(0, 18)}" ` +
                  `${Math.round(box.left)}…${Math.round(box.right)}`
              );
            }
          }
        }
        return xau.slice(0, 3);
      }, path);
      chuLanLe.push(...dungChu);
    }

    await ctx.close();
    check(
      `Màn ${width}px: không trang nào phải vuốt ngang`,
      tran.length === 0,
      tran.length ? tran.join(' | ') : `${duong.length} trang sạch`
    );
    check(
      `Màn ${width}px: chữ không lấn vào dải 20px của dây leo`,
      chuLanLe.length === 0,
      chuLanLe.length ? chuLanLe.join(' | ') : `${duong.length} trang sạch`
    );
  }
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
