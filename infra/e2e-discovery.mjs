/**
 * Kiểm tra end-to-end phần khám phá: tìm kiếm, lọc theo tag, lọc theo tuổi (M3).
 *
 * Phép kiểm quan trọng nhất là TÌM KHÔNG DẤU: trẻ gõ "meo" phải ra "Mèo bay".
 * Nếu chỗ đó hỏng thì với một đứa bé, ô tìm kiếm coi như không dùng được.
 *
 * Chạy:
 *   SB3_FIXTURE=/tmp/meo-phieu-luu.sb3 node infra/e2e-discovery.mjs
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { batBuocMailLog, taoBoBamLink } from './e2e-mail.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
/*
 * Cần MAIL_LOG dù bài này chẳng kiểm gì về mail: nó phải tạo tài khoản cho bé, mà
 * `createChild` đòi phụ huynh đã xác minh email, và link xác minh chỉ có trong thư.
 */
const MAIL_LOG = batBuocMailLog('e2e-discovery');
const FIXTURE = process.env.SB3_FIXTURE ?? '';

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-kham-pha-${suffix}@kidogame.test`;
const PARENT_PASS = 'matkhau-dai-1234';
const CHILD_USER = `ekp${suffix}`;
const CHILD_PASS = 'be1234';

/** Bé 9 tuổi -> rơi vào khung 8–10. */
const CHILD_AGE = 9;
const BIRTH_YEAR = new Date().getFullYear() - CHILD_AGE;

const TITLE = `Mèo bay ${suffix}`;
const TITLE_NO_DIACRITICS = `meo bay ${suffix}`;
const TAG = 'phieu-luu';
const OTHER_TAG = 'hoc-tap';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!FIXTURE) {
  console.error('Cần SB3_FIXTURE=<đường dẫn .sb3>');
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'chrome' });

/*
 * Khoảng TRỐNG NHÌN THẤY giữa ô tìm, hai hàng viên thuốc và dòng đếm — đo giữa các
 * viên thuốc, không đo lề CSS. Dưới `sm` hàng lọc có đệm trong để giữ vòng focus, nên
 * lề CSS ở hai cỡ khác nhau mà khoảng trống phải như nhau.
 *
 * Có vì bản đầu của hàng cuộn ngang làm lề dưới về 0 từ 640px (`sm:my-0` đè `mb-5`):
 * hai hàng lọc và dòng đếm dính nhau. Mọi phép kiểm khác vẫn xanh, kể cả phép so khung
 * chờ với trang thật — khung chờ dùng chung lớp nên sai y hệt. Fen bắt bằng mắt.
 */
const khoangLoc = (p) =>
  p.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const vien = (id) => q(`[data-testid=${id}] a`).getBoundingClientRect();
    const tim = q('[data-testid=search-form]').getBoundingClientRect();
    const loai = vien('tag-filters');
    const tuoi = vien('age-filters');
    const dem = q('[data-testid=result-count]').getBoundingClientRect();
    return [loai.top - tim.bottom, tuoi.top - loai.bottom, dem.top - tuoi.bottom].map(Math.round);
  });
const dungKhoang = (k) => Math.abs(k[0] - 16) <= 1 && Math.abs(k[1] - 8) <= 1 && Math.abs(k[2] - 20) <= 1;
const bamLinkXacMinh = taoBoBamLink(MAIL_LOG, { appOrigin: APP });
const newSession = () => browser.newContext({ viewport: { width: 1300, height: 1000 } });

const anon = await newSession();

/** Mở trang chủ với bộ lọc, trả về danh sách id game hiện ra. */
async function browse(params) {
  const p = await anon.newPage();
  const qs = new URLSearchParams(params).toString();
  await p.goto(`${APP}/${qs ? `?${qs}` : ''}`, { waitUntil: 'networkidle' });
  const hrefs = await p.locator('[data-testid=game-card]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? '')
  );
  const emptyState = (await p.locator('text=Không tìm thấy game nào khớp').count()) > 0;
  await p.close();
  return { ids: hrefs.map((h) => h.replace('/game/', '')), emptyState };
}

// ---------- Dựng dữ liệu ----------
let gameId = '';
{
  const parentCtx = await newSession();
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PARENT_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});

  check('Xác minh được email phụ huynh', await bamLinkXacMinh(p));

  await p.fill('#displayName', 'Bé Khám Phá');
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', CHILD_PASS);
  await p.fill('#birthYear', String(BIRTH_YEAR));
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForTimeout(2500);
  await parentCtx.close();

  const childCtx = await newSession();
  const c = await childCtx.newPage();
  await c.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c.fill('#username', CHILD_USER);
  await c.fill('#password', CHILD_PASS);
  await c.click('[data-testid=auth-form] button[type=submit]');
  await c.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});

  await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await c.fill('#title', TITLE);
  await c.setInputFiles('#file', FIXTURE);

  check(
    'Form đăng game có chỗ chọn tag',
    (await c.locator('[data-testid=tag-picker]').count()) > 0
  );
  await c.locator(`[data-testid=tag-picker] input[value="${TAG}"]`).check();

  await c.click('[data-testid=upload-form] button[type=submit]');
  await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
  gameId = c.url().split('/game/')[1] ?? '';
  check('Đăng được game kèm tag', !!gameId, gameId);
  await childCtx.close();
}

if (!gameId) {
  console.error('Không đăng được game, dừng bài test.');
  await browser.close();
  process.exit(1);
}

// ---------- Trang chủ có đủ bộ lọc ----------
{
  const p = await anon.newPage();
  await p.goto(APP, { waitUntil: 'networkidle' });
  check('Trang chủ có ô tìm kiếm', (await p.locator('[data-testid=search-form]').count()) > 0);
  check('Trang chủ có bộ lọc tag', (await p.locator('[data-testid=tag-filters]').count()) > 0);
  check('Trang chủ có bộ lọc tuổi', (await p.locator('[data-testid=age-filters]').count()) > 0);
  await p.close();
}

// ---------- Điện thoại: game phải lọt màn hình đầu ----------
/*
 * Đo trước khi sửa, ở 390×800: thẻ game đầu tiên nằm ở 1001px. Bé mở web trên điện
 * thoại thấy lời chào, ô tìm, năm hàng viên thuốc lọc — và không một game nào. Không
 * phép kiểm nào đỏ vì tất cả đều đo ở 1300px, nơi mọi thứ vừa khít.
 *
 * Ngưỡng "ít nhất 100px của thẻ đầu tiên lọt màn đầu", không phải "trọn thẻ": trọn thẻ
 * ở 360×800 cần thêm ~100px nữa, và thứ cần bảo vệ là bé THẤY có game ở dưới — một
 * nửa ảnh thumbnail làm được việc đó.
 */
for (const [w, h] of [
  [390, 844],
  [360, 800],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(APP, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid=game-card]', { timeout: 30000 });
  const m = await p.evaluate(() => {
    const top = (el) => el.getBoundingClientRect().top + scrollY;
    const hang = (id) => {
      const el = document.querySelector(`[data-testid=${id}]`);
      const dinh = new Set([...el.querySelectorAll('a')].map((a) => Math.round(top(a))));
      return {
        soHang: dinh.size,
        cuonDuoc: el.scrollWidth > el.clientWidth,
        demTren: parseFloat(getComputedStyle(el).paddingTop),
      };
    };
    return {
      the: Math.round(top(document.querySelector('[data-testid=game-card]'))),
      tran: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      loai: hang('tag-filters'),
      tuoi: hang('age-filters'),
    };
  });
  check(`${w}px: ít nhất 100px của thẻ game đầu tiên lọt màn đầu`, m.the <= h - 100, `đỉnh thẻ ở ${m.the}px, màn cao ${h}`);
  check(`${w}px: bộ lọc loại game nằm trên MỘT hàng cuộn ngang`, m.loai.soHang === 1 && m.loai.cuonDuoc, JSON.stringify(m.loai));
  check(`${w}px: bộ lọc tuổi nằm trên MỘT hàng cuộn ngang`, m.tuoi.soHang === 1 && m.tuoi.cuonDuoc, JSON.stringify(m.tuoi));
  /* Khung cuộn cắt mọi thứ tràn ra ngoài nó, kể cả vòng focus 3px + lệch 2px. */
  check(`${w}px: hàng lọc đủ đệm cho vòng focus (≥5px)`, m.loai.demTren >= 5 && m.tuoi.demTren >= 5, `${m.loai.demTren}px`);
  check(`${w}px: trang không tràn ngang`, m.tran === 0, `${m.tran}px`);
  {
    const k = await khoangLoc(p);
    check(`${w}px: ô tìm → hàng loại → hàng tuổi → dòng đếm cách 16 / 8 / 20px`, dungKhoang(k), k.join(' / '));
  }
  await ctx.close();
}

// Máy tính: hàng lọc KHÔNG được cuộn — ở đó đủ chỗ, và giấu lựa chọn sau mép là mất trắng.
{
  const p = await anon.newPage();
  await p.goto(APP, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid=tag-filters]');
  const cuon = await p.evaluate(() =>
    ['tag-filters', 'age-filters'].map((id) => {
      const el = document.querySelector(`[data-testid=${id}]`);
      return el.scrollWidth - el.clientWidth;
    })
  );
  check('1300px: hai hàng lọc bày hết, không giấu viên nào sau mép', cuon.every((d) => d === 0), cuon.join(', '));
  const k = await khoangLoc(p);
  check('1300px: ô tìm → hàng loại → hàng tuổi → dòng đếm cách 16 / 8 / 20px', dungKhoang(k), k.join(' / '));
  await p.close();
}

// ---------- Tìm kiếm ----------
{
  const withMarks = await browse({ q: TITLE });
  check('Tìm CÓ dấu ra đúng game', withMarks.ids.includes(gameId), `${withMarks.ids.length} kết quả`);

  // Đây là phép kiểm quan trọng nhất của cả bộ.
  const withoutMarks = await browse({ q: TITLE_NO_DIACRITICS });
  check(
    'Tìm KHÔNG dấu vẫn ra game có dấu ("meo" -> "Mèo")',
    withoutMarks.ids.includes(gameId),
    `${withoutMarks.ids.length} kết quả`
  );

  const nonsense = await browse({ q: `khongcogamenaoten${suffix}` });
  check('Tìm không ra thì hiện trạng thái rỗng', nonsense.ids.length === 0 && nonsense.emptyState);
}

// ---------- Lọc theo tag ----------
{
  const inTag = await browse({ tag: TAG });
  check(`Lọc tag "${TAG}" có chứa game vừa đăng`, inTag.ids.includes(gameId), `${inTag.ids.length} game`);

  const otherTag = await browse({ tag: OTHER_TAG });
  check(
    `Lọc tag "${OTHER_TAG}" KHÔNG chứa game đó`,
    !otherTag.ids.includes(gameId),
    `${otherTag.ids.length} game`
  );
}

// ---------- Lọc theo tuổi ----------
{
  const right = await browse({ tuoi: '8-10' });
  check(
    `Lọc tuổi 8–10 có game của bé ${CHILD_AGE} tuổi`,
    right.ids.includes(gameId),
    `${right.ids.length} game`
  );

  const wrong = await browse({ tuoi: '14+' });
  check(
    'Lọc tuổi 14+ KHÔNG có game đó',
    !wrong.ids.includes(gameId),
    `${wrong.ids.length} game`
  );
}

// ---------- Các bộ lọc cộng dồn được ----------
{
  const both = await browse({ q: TITLE_NO_DIACRITICS, tag: TAG, tuoi: '8-10' });
  check('Ba bộ lọc dùng cùng lúc vẫn ra game', both.ids.includes(gameId), `${both.ids.length} game`);

  const conflicting = await browse({ q: TITLE_NO_DIACRITICS, tag: OTHER_TAG });
  check(
    'Bộ lọc mâu thuẫn nhau thì ra rỗng (lọc là AND, không phải OR)',
    !conflicting.ids.includes(gameId),
    `${conflicting.ids.length} game`
  );
}

// ---------- Phân trang ----------
/*
 * Trước khi có phân trang, trang chủ lấy 60 game rồi in "60 game đầu tiên" và dừng ở
 * đó: game thứ 61 không có một đường nào đi tới. Bộ này phải canh ba thứ, và thứ thứ
 * hai mới là thứ dễ hỏng.
 *
 *   1. sang trang có ra game KHÁC không  — `skip` sai là trang 2 lặp lại trang 1
 *   2. đổi bộ lọc có VỨT số trang đi không, và sang trang có GIỮ bộ lọc không
 *   3. `?trang=999` nói gì
 *
 * Cả ba đều hỏng IM LẶNG. Không cái nào ném lỗi, không cái nào để lại chỗ trống trên
 * màn hình — chúng chỉ bày ra một danh sách sai, mà một danh sách game thì trông lúc
 * nào cũng như một danh sách game.
 */
const PAGE_SIZE = 24;

/**
 * Bấm một link rồi CHỜ URL THẬT SỰ ĐỔI.
 *
 * `waitForLoadState('networkidle')` không dùng được ở đây: Next điều hướng phía máy
 * khách, trang cũ đã idle sẵn nên phép chờ trả về ngay lập tức và mọi phép kiểm đọc
 * đúng cái URL trước khi bấm. Cả năm phép kiểm dưới đây từng đỏ vì chuyện đó, trong
 * khi sản phẩm chưa bao giờ sai — đúng cái bẫy đã cắn nhiều lần ở bộ khác.
 */
async function bamRoiCho(p, locator) {
  const truoc = p.url();
  await locator.click();
  await p.waitForURL((u) => u.toString() !== truoc, { timeout: 30000 });
  await p.waitForSelector('[data-testid=result-count], [data-testid=pager-khong-co]', {
    timeout: 30000,
  });
}

/** Mở trang chủ, trả về id game hiện ra + tổng đọc từ dòng đếm + URL thật. */
async function xemTrang(params) {
  const p = await anon.newPage();
  const qs = new URLSearchParams(params).toString();
  /* `domcontentloaded` chứ KHÔNG `networkidle`: một trang đầy 24 ảnh thumbnail trên
     dev server không chịu yên đủ lâu để networkidle chốt, và phép chờ đó đã một lần
     làm cả bộ này chết ở trang 2 trong khi trang 2 render hoàn toàn đúng. Thứ cần
     chờ là dòng đếm, nên chờ thẳng nó. */
  await p.goto(`${APP}/${qs ? `?${qs}` : ''}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid=result-count], [data-testid=pager-khong-co]', {
    timeout: 30000,
  });
  const hrefs = await p.locator('[data-testid=game-card]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? '')
  );
  const dem = await p.locator('[data-testid=result-count]').innerText();
  return {
    p,
    ids: hrefs.map((h) => h.replace('/game/', '')),
    dem,
    tong: Number(dem.match(/^(\d+)/)?.[1] ?? 0),
  };
}

{
  const t1 = await xemTrang({});
  check('Trang chủ nói TỔNG số game, không phải số thẻ đang bày', t1.tong >= t1.ids.length, t1.dem);

  if (t1.tong <= PAGE_SIZE) {
    /* Không đủ game để có trang thứ hai. Nói ra chứ đừng báo xanh — một phép kiểm
       phân trang chạy trên một danh sách một trang là một phép kiểm không kiểm gì. */
    check(
      `DB dev chỉ có ${t1.tong} game (cần hơn ${PAGE_SIZE}), BỎ QUA phần phân trang`,
      false,
      'không phải lỗi sản phẩm — hãy đăng thêm game rồi chạy lại'
    );
    await t1.p.close();
  } else {
    check('Trang 1 lấy đúng một trang, không lấy hết', t1.ids.length === PAGE_SIZE, `${t1.ids.length} thẻ`);
    check('Có thanh phân trang', (await t1.p.locator('[data-testid=pager]').count()) === 1);
    check(
      'Trang đang mở nói ra được cho trình đọc màn hình',
      (await t1.p.locator('[data-testid=pager-so-1]').getAttribute('aria-current')) === 'page'
    );
    /* Dải chào chỉ ở trang đầu — kiểm nó CÓ ở đây trước, nếu không thì phép kiểm
       "vắng mặt ở trang 2" bên dưới xanh sẵn dù ai xoá hẳn dải chào đi. */
    check('Dải chào có mặt ở trang 1', (await t1.p.locator('[data-testid=home-hero]').count()) === 1);
    await t1.p.close();

    const t2 = await xemTrang({ trang: '2' });
    check('Trang 2 có game', t2.ids.length > 0, `${t2.ids.length} thẻ`);
    /*
     * Phép kiểm đáng giá nhất của cả phần này. `skip` quên nhân với cỡ trang, hay
     * `orderBy` không định trước, đều cho ra một trang 2 trông hoàn toàn bình thường
     * mà lặp lại game của trang 1 — và cái duy nhất lộ ra là một đứa trẻ thấy cùng
     * một game hai lần rồi nghĩ mình bấm nhầm.
     */
    const trung = t2.ids.filter((id) => t1.ids.includes(id));
    check('Trang 2 KHÔNG lặp lại game nào của trang 1', trung.length === 0, `${trung.length} game trùng`);
    check('Tổng không đổi khi sang trang', t2.tong === t1.tong, `${t1.tong} → ${t2.tong}`);
    check('Dòng đếm nói đang ở trang mấy trên mấy', /trang 2\/\d+/.test(t2.dem), t2.dem);
    check(
      'Dải chào KHÔNG lặp lại ở trang 2',
      (await t2.p.locator('[data-testid=home-hero]').count()) === 0
    );

    /*
     * HAI MŨI TÊN PHẢI PHẢN HỒI KHI RÊ CHUỘT, y như mấy nút số bên cạnh.
     *
     * Chúng từng là chữ trần: đo ra nền trong suốt, chữ cùng màu, không viền, không
     * gạch chân — không đổi một pixel nào khi rê vào, ngay cạnh những nút số thì có
     * đổi. Trên khu quản trị chuyện đó chỉ phiền; ở đây người đọc là trẻ con, và một
     * thứ bấm được mà không nhúc nhích đọc ra là hỏng. Đúng cái bẫy đã phải sửa ba
     * lần ở hàng icon và ở nút rút lại của ba tính năng xã hội.
     *
     * `mouse.move` ra góc TRƯỚC khi đo trạng thái thường: Playwright để con trỏ nằm
     * lại chỗ vừa bấm, nên không đẩy đi thì số "trước" đã là số lúc đang hover, và
     * phép kiểm đang so một giá trị với chính nó.
     */
    const veNut = (sel) =>
      t2.p.locator(sel).evaluate((el) => {
        const st = getComputedStyle(el);
        return `${st.backgroundColor}|${st.color}|${st.borderColor}|${st.textDecorationLine}`;
      });
    await t2.p.mouse.move(5, 5);
    await t2.p.waitForTimeout(250);
    const truocHover = await veNut('[data-testid=pager-truoc]');
    await t2.p.locator('[data-testid=pager-truoc]').hover();
    await t2.p.waitForTimeout(350);
    const sauHover = await veNut('[data-testid=pager-truoc]');
    check('Nút "Trang trước" có phản hồi khi rê chuột', truocHover !== sauHover, `${truocHover} → ${sauHover}`);
    check(
      '… và nó cao đủ tầm ngón tay trẻ (48px)',
      (await t2.p.locator('[data-testid=pager-truoc]').boundingBox()).height >= 44,
      `${Math.round((await t2.p.locator('[data-testid=pager-truoc]').boundingBox()).height)}px`
    );

    // Bấm "Trang trước" phải quay đúng về trang 1, và về URL sạch không còn `trang`.
    await bamRoiCho(t2.p, t2.p.locator('[data-testid=pager-truoc]'));
    check('Bấm "Trang trước" từ trang 2 về URL sạch, không mang ?trang=1', !/trang=/.test(t2.p.url()), t2.p.url());

    /*
     * ĐỔI BỘ LỌC KHI ĐANG Ở TRANG 2 phải vứt số trang đi.
     *
     * Giữ lại là bé chọn một loại game rồi rơi thẳng vào màn hình trống, vì tập kết
     * quả mới hầu như luôn ngắn hơn. Bé sẽ đọc ra "loại này không có game nào" —
     * không ai nghĩ tới con số còn sót trong URL.
     */
    const t2b = await xemTrang({ trang: '2' });
    await bamRoiCho(t2b.p, t2b.p.locator(`[data-testid=tag-${TAG}]`));
    const urlSauLoc = t2b.p.url();
    check('Đổi bộ lọc khi đang ở trang 2 thì VỀ trang 1', !/trang=/.test(urlSauLoc), urlSauLoc);
    check('… và bộ lọc vừa bấm thật sự có hiệu lực', /tag=/.test(urlSauLoc), urlSauLoc);
    await t2b.p.close();

    /*
     * Chiều ngược lại: sang trang phải GIỮ bộ lọc. Tìm một bộ lọc tuổi tự nó đã đủ
     * dài để có trang thứ hai — đo chứ không đoán, vì DB dev đổi theo từng phiên.
     */
    let daKiemGiuLoc = false;
    for (const tuoi of ['5-7', '8-10', '11-13', '14+']) {
      const l = await xemTrang({ tuoi });
      if (l.tong > PAGE_SIZE) {
        await bamRoiCho(l.p, l.p.locator('[data-testid=pager-sau]'));
        const u = new URL(l.p.url());
        check(
          `Sang trang GIỮ bộ lọc tuổi (${tuoi}, ${l.tong} game)`,
          u.searchParams.get('tuoi') === tuoi && u.searchParams.get('trang') === '2',
          u.search
        );
        daKiemGiuLoc = true;
        await l.p.close();
        break;
      }
      await l.p.close();
    }
    if (!daKiemGiuLoc) {
      check(
        'Sang trang GIỮ bộ lọc tuổi',
        false,
        `không khung tuổi nào có hơn ${PAGE_SIZE} game trong DB dev — chưa kiểm được`
      );
    }

    /*
     * `?trang=999`: trang không tồn tại KHÔNG được hiện ra như danh sách rỗng.
     *
     * Trang chủ kẹp dưới mà không kẹp trên, nên `skip` chạy qua khỏi cuối bảng và
     * truy vấn trả về rỗng. Nếu để mặc, màn hình in "Chưa có game nào cả. Đăng game
     * đầu tiên nhé!" — một câu sai hoàn toàn, trên một trang chủ có hàng trăm game.
     */
    const xa = await xemTrang({ trang: '999' });
    check(
      'Trang không tồn tại thì NÓI RA, không giả vờ là danh sách rỗng',
      (await xa.p.locator('[data-testid=pager-khong-co]').count()) === 1
    );
    check(
      '… và KHÔNG in "chưa có game nào" trên một trang chủ đầy game',
      (await xa.p.locator('text=Chưa có game nào cả').count()) === 0
    );
    await bamRoiCho(xa.p, xa.p.locator('[data-testid=pager-khong-co] a'));
    check(
      '… và có đường quay về trang cuối',
      (await xa.p.locator('[data-testid=game-card]').count()) > 0,
      xa.p.url()
    );
    await xa.p.close();
  }
}

// ---------- Trang 404 ----------
/*
 * Trang 404 là trang DUY NHẤT không ai chủ động mở, nên cũng là trang dễ mục nhất
 * mà không ai biết. Ở đây nó đáng kiểm vì một lý do cụ thể của sản phẩm này: link
 * game được trẻ chia cho nhau qua tin nhắn, mà game bị ẩn hay bị gỡ thì link cũ vẫn
 * nằm trong máy bạn bè — nên phần lớn người rơi vào đây đang đi tìm MỘT game cụ thể.
 *
 * Vì thế phép kiểm nặng nhất không phải "trang có hiện chữ gì không", mà là ô tìm
 * kiếm trên đó có thật sự dẫn tới game hay không.
 */
{
  const p = await anon.newPage();
  const res = await p.goto(`${APP}/khong-co-duong-nay-${suffix}`, {
    waitUntil: 'domcontentloaded',
  });

  /* Mã HTTP phải là 404 THẬT. Một trang 404 đẹp trả về 200 là nói dối với mọi thứ
     không phải con người đang đọc — trình thu thập, bộ nhớ đệm, phần mềm kiểm link. */
  check('Đường dẫn sai trả đúng mã 404', res?.status() === 404, `HTTP ${res?.status()}`);
  check(
    'Trang 404 nói tiếng Việt, không phải trang mặc định của Next',
    (await p.locator('h1').innerText()).includes('Không có trang này')
  );
  /* KHÔNG được có chữ "lỗi": 404 không phải lỗi của đứa trẻ đang đọc, mà với trẻ con
     thì "lỗi" đọc ra là "mình vừa làm hỏng cái gì". */
  const chu = await p.locator('main').innerText();
  check('… và KHÔNG đổ lỗi cho người đọc (không có chữ "lỗi")', !/\blỗi\b/i.test(chu));

  check(
    'Đường về trang chủ là NÚT thật, cao đủ tầm tay trẻ',
    (await p.locator('[data-testid=not-found-ve-trang-chu]').boundingBox()).height >= 44,
    `${Math.round((await p.locator('[data-testid=not-found-ve-trang-chu]').boundingBox()).height)}px`
  );

  /*
   * Phép kiểm đáng giá nhất ở đây: gõ tên game vào ô trên trang 404 rồi bấm Tìm,
   * phải ra ĐÚNG game đó. Một ô tìm kiếm chỉ đưa người ta về trang chủ trắng trơn
   * thì trông y hệt ô này mà chẳng làm được việc gì.
   */
  await p.fill('[data-testid=not-found-search] input[name=q]', TITLE_NO_DIACRITICS);
  await p.click('[data-testid=not-found-search] button[type=submit]');
  await p.waitForURL(/\?q=/, { timeout: 20000 });
  await p.waitForSelector('[data-testid=result-count]', { timeout: 30000 });
  const raHrefs = await p.locator('[data-testid=game-card]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? '')
  );
  check(
    'Tìm từ trang 404 ra ĐÚNG game, không chỉ ném về trang chủ',
    raHrefs.some((h) => h.includes(gameId)),
    `${raHrefs.length} kết quả`
  );
  await p.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
