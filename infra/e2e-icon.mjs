/**
 * Thả icon lên game — đo bằng trình duyệt thật và đối chiếu thẳng với database.
 *
 * BA PHÉP ĐÁNG GIÁ NHẤT Ở ĐÂY, và cả ba đều là loại mà giao diện xanh vẫn có thể
 * che mất hỏng thật:
 *
 * 1. MỘT HÀNG MỖI BÉ MỖI GAME. Đổi icon phải là ĐỔI, không phải thêm. Đếm ở DB chứ
 *    không đọc con số trên màn hình: màn hình lấy số từ cùng cái `groupBy` mà lỗi
 *    này sẽ làm sai, nên nó sẽ đồng loã và hiển thị đúng cái số sai.
 *
 * 2. PHỤ HUYNH KHÔNG THẢ ĐƯỢC — và phải đo bằng cách GỠ RÀO GIAO DIỆN RỒI BẤM.
 *    Chỉ kiểm "nút bị disabled" là dựng sai vai: xoá chốt trong `thaIconAction` đi
 *    thì nút vẫn disabled, phép kiểm vẫn xanh, mà ai mở DevTools cũng thả được.
 *    Cách duy nhất trả lời đúng câu hỏi là bật lại cái nút rồi bấm thật, và hỏi DB.
 *
 * 3. BẤM LẠI LÀ GỠ. Không có đường rút lại thì một cú chạm nhầm là vĩnh viễn, và
 *    người bấm ở đây là trẻ con.
 *
 * Chạy:
 *   SB3_FIXTURE=<đường-dẫn.sb3> MAIL_LOG=/tmp/kg-mail.log node infra/e2e-icon.mjs
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { batBuocMailLog, taoBoBamLink } from './e2e-mail.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const FIXTURE = process.env.SB3_FIXTURE ?? '';
const MAIL_LOG = batBuocMailLog('e2e-icon');

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-icon-${suffix}@kidogame.test`;
const PASS = 'matkhau-dai-1234';
const CHILD1_USER = `eic1${suffix}`;
const CHILD2_USER = `eic2${suffix}`;
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
const sql = (q) => execFileSync('psql', [DB, '-q', '-t', '-A', '-c', q]).toString().trim();
const dem = (q) => Number(sql(q));

const browser = await chromium.launch({ channel: 'chrome' });
const bamLinkXacMinh = taoBoBamLink(MAIL_LOG, { appOrigin: APP });
const newSession = () => browser.newContext({ viewport: { width: 1300, height: 1000 } });

const soTrongDb = (gameId) => dem(`select count(*) from "Reaction" where "gameId" = '${gameId}'`);

/**
 * Chữ ký trạng thái icon của một game: cặp (bé, icon) của mọi hàng, đã sắp xếp.
 *
 * ĐẾM SỐ HÀNG LÀ KHÔNG ĐỦ, và phép kiểm này đã đỏ oan một lần vì đúng chuyện đó.
 * Ba thao tác cần chờ có ba kiểu đổi khác nhau:
 *
 *     thả mới  -> số hàng 0 → 1
 *     ĐỔI icon -> số hàng VẪN LÀ 1, chỉ giá trị đổi   ← đếm hàng mù ở đây
 *     gỡ       -> số hàng 1 → 0
 *
 * Hàm chờ ban đầu đợi số hàng đổi, nên ở nhánh giữa nó chờ hết giờ rồi báo "không
 * đổi được icon" — trong khi ba phép ngay sau đó chứng minh việc đổi đã chạy đúng.
 * Đỏ sai hướng, lần thứ năm trong repo này.
 *
 * Chữ ký dưới đây đổi ở CẢ BA nhánh.
 */
const chuKy = (gameId) =>
  sql(
    `select coalesce(string_agg("childId" || ':' || icon, ',' order by "childId"), '') from "Reaction" where "gameId" = '${gameId}'`
  );

/** Bấm một icon rồi CHỜ server trả lời, không chỉ chờ hiệu ứng lạc quan. */
async function thaIcon(page, ma) {
  const truoc = chuKy(GAME_ID);
  await page.click(`[data-testid=icon-${ma}]`);
  // Chờ tới khi DB đổi, hoặc hết giờ. Chờ theo DOM thì bắt phải hiệu ứng lạc quan
  // — tức phép kiểm xanh kể cả khi server không bao giờ nhận được gì.
  for (let i = 0; i < 40; i++) {
    if (chuKy(GAME_ID) !== truoc) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

// ---------- Dựng: phụ huynh -> hai bé -> một game ----------
const parentCtx = await newSession();
let GAME_ID = '';

{
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  check('Xác minh được email phụ huynh', await bamLinkXacMinh(p));

  for (const [ten, user] of [
    ['Bé Icon Một', CHILD1_USER],
    ['Bé Icon Hai', CHILD2_USER],
  ]) {
    await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
    await p.fill('#displayName', ten);
    await p.fill('#username', user);
    await p.fill('#password', CHILD_PASS);
    await p.click('[data-testid=auth-form] button[type=submit]');
    await p.waitForTimeout(1500);
  }
  check(
    'Dựng được hai bé trong cùng một nhà',
    dem(`select count(*) from "Child" where username in ('${CHILD1_USER}','${CHILD2_USER}')`) === 2
  );
  await p.close();
}

const child1Ctx = await newSession();
{
  const c = await child1Ctx.newPage();
  await c.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c.fill('#username', CHILD1_USER);
  await c.fill('#password', CHILD_PASS);
  await c.click('[data-testid=auth-form] button[type=submit]');
  await c.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});

  await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await c.fill('#title', `Game icon ${suffix}`);
  await c.setInputFiles('#file', FIXTURE);
  await c.click('[data-testid=upload-form] button[type=submit]');
  await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
  GAME_ID = c.url().split('/game/')[1] ?? '';
  check('Bé đăng được game', GAME_ID.length > 0, GAME_ID);
  await c.close();
}

/*
 * VIÊN "❤ số" TRÊN THẺ Ở TRANG CHỦ, kể cả khi chưa ai thả.
 *
 * Trước đây viên này bị ẩn ở 0, với lý lẽ "một dãy thẻ toàn ❤ 0 đọc như bảng xếp hạng
 * game không ai thích". Fen nhìn thẻ thật và thấy chỗ đó trống, chốt luôn hiện. Phép
 * kiểm này giữ cả hai đầu: 0 vẫn hiện, và con số đi theo số lượt thật.
 */
const vienIcon = async (p) => {
  /* Khoanh theo LINK của đúng game này: thẻ không mang id nào khác để bám. */
  const v = p.locator(`[data-testid=game-card][href="/game/${GAME_ID}"] [data-testid=the-so-icon]`);
  return (await v.count()) === 0 ? '(không có viên)' : (await v.innerText()).replace(/\s+/g, ' ').trim();
};
{
  const ctx = await newSession();
  const p = await ctx.newPage();
  await p.goto(`${APP}/`, { waitUntil: 'networkidle' });
  check('Thẻ game chưa ai thả icon VẪN hiện viên "❤ 0"', (await vienIcon(p)) === '❤ 0', await vienIcon(p));
  await ctx.close();
}

// ---------- Khách chưa đăng nhập ----------
{
  const ctx = await newSession();
  const p = await ctx.newPage();
  await p.goto(`${APP}/game/${GAME_ID}`, { waitUntil: 'networkidle' });

  check('Khách vẫn THẤY hàng icon', (await p.locator('[data-testid=hang-icon]').count()) === 1);
  check(
    'Khách thấy đủ năm icon',
    (await p.locator('[data-testid=hang-icon] button').count()) === 5
  );
  check(
    'Nút bị khoá với khách',
    await p.locator('[data-testid=icon-tim]').isDisabled()
  );
  check(
    'Khách được mời đăng nhập bằng tài khoản bé',
    (await p.locator('[data-testid=icon-goi-y]').count()) === 1
  );

  /*
   * HAI HIỆU ỨNG RÊ CHUỘT, và phép kiểm tồn tại để chúng không trộn vào nhau.
   *
   * Cái TÊN icon hiện cho mọi người xem; cái NHẤC LÊN chỉ cho người bấm được. Trộn
   * lại là hứa "bấm được" với người bấm không ra gì — đúng cái bẫy vừa sửa ở
   * `/admin/loi`, lần này do CSS chứ không do HTML lồng sai.
   *
   * Đo `opacity` đã tính toán chứ không đo sự tồn tại của thẻ: bong bóng LUÔN nằm
   * trong DOM, nó chỉ trong suốt lúc chưa rê chuột tới. Kiểm "có thẻ span" thì xanh
   * kể cả khi CSS không bao giờ hiện nó ra.
   */
  const nhanCuaTim = p.locator('[data-testid=icon-tim] ~ .kg-icon-nhan');
  const mo = () => nhanCuaTim.evaluate((e) => Number(getComputedStyle(e).opacity));
  check('Tên icon ẨN khi chưa rê chuột tới', (await mo()) === 0, `opacity ${await mo()}`);

  await p.locator('[data-testid=icon-tim]').hover();
  await p.waitForTimeout(400);
  check('Rê chuột vào thì tên icon HIỆN — kể cả với khách', (await mo()) === 1, `opacity ${await mo()}`);
  check(
    '… và mang đúng tên tiếng Việt, không phải tên Unicode',
    (await nhanCuaTim.innerText()).trim() === 'Thích'
  );
  check(
    'Nút KHÔNG nhấc lên với khách (không hứa bấm được)',
    !(await p.locator('[data-testid=icon-tim]').evaluate((e) => e.classList.contains('kg-icon-bam')))
  );
  check(
    '… và emoji KHÔNG rung với khách',
    (await p
      .locator('[data-testid=icon-tim] .kg-icon-hinh')
      .evaluate((e) => getComputedStyle(e).animationName)) === 'none'
  );

  /*
   * KHÁCH VẪN PHẢI CÓ MỘT PHẢN HỒI — chỉ là phản hồi TĨNH.
   *
   * "Không hứa bấm được" từng bị hiểu thành "không trả lời gì": trước đây rê chuột
   * qua cả hàng với tư cách khách thì ngoài cái tên ra không một pixel nào đổi, và
   * hàng icon đọc ra như một dãy hình dán. Giờ viền sáng lên.
   *
   * Đổi MÀU chứ không phải chuyển động, và ranh giới đó là cả điểm của phép kiểm
   * này: cái gì nhúc nhích dưới con trỏ là một lời hứa "bấm được", mà khách bấm vào
   * chỉ nhận lại câu mời đăng nhập. Nên hai phép kiểm dưới đây đi thành CẶP — một
   * cái đòi có phản hồi, cái kia đòi phản hồi ấy đứng yên.
   *
   * `mouse.move` ra góc trước khi đo số "trước": Playwright để con trỏ nằm lại chỗ
   * cũ, nên không đẩy đi là đang so trạng thái hover với chính nó.
   */
  await p.mouse.move(5, 5);
  await p.waitForTimeout(250);
  const vienTim = () =>
    p.locator('[data-testid=icon-tim]').evaluate((e) => getComputedStyle(e).borderTopColor);
  const vienThuong = await vienTim();
  await p.locator('[data-testid=icon-tim]').hover();
  await p.waitForTimeout(350);
  const vienHover = await vienTim();
  check(
    'Khách rê chuột thì VIỀN sáng lên, không phải đứng im',
    vienThuong !== vienHover,
    `${vienThuong} → ${vienHover}`
  );
  check(
    '… nhưng nút KHÔNG dịch đi một pixel nào (không hứa bấm được)',
    (await p
      .locator('[data-testid=icon-tim]')
      .evaluate((e) => getComputedStyle(e).transform)) === 'none'
  );

  /* Đuôi nhọn của bong bóng tên: không có nó thì một viên thuốc lơ lửng phía trên
     năm nút cách nhau 8px, và mắt phải đoán nó đang gọi tên nút nào. Đo màu viền
     trên của `::after` — trong suốt nghĩa là không vẽ ra tam giác nào cả. */
  check(
    'Bong bóng tên có đuôi chỉ xuống đúng nút nó gọi tên',
    (await nhanCuaTim.evaluate((e) => getComputedStyle(e, '::after').borderTopColor)) !==
      'rgba(0, 0, 0, 0)',
    await nhanCuaTim.evaluate((e) => getComputedStyle(e, '::after').borderTopColor)
  );
  await p.mouse.move(5, 5);
  await p.waitForTimeout(200);

  /*
   * Phép "bấm thì được nói vì sao" KHÔNG đặt ở đây, cố ý. Lúc này hàng icon còn
   * trống nên câu gợi ý đã hiện sẵn từ đầu — kiểm ở đây là xanh dù cú bấm chẳng làm
   * gì cả. Nó nằm ở khối phụ huynh phía dưới, nơi đã có hai lượt icon nên câu gợi ý
   * PHẢI vắng mặt trước khi bấm.
   */

  /*
   * GỠ RÀO RỒI BẤM. Xem ghi chú số 2 ở đầu file: chỉ kiểm `disabled` là đo cái
   * khoá trên cửa, không đo cái cửa.
   *
   * Rào giao diện giờ là `aria-disabled`, không còn là `disabled`: nút phải rê
   * chuột và tab tới được thì khách mới đọc được TÊN icon, mà một nút `disabled`
   * thì không nhận cả hai. Phải gỡ CẢ HAI ở đây — gỡ thiếu một cái thì Playwright
   * từ chối bấm và phép kiểm đỏ vì lý do không liên quan gì tới server.
   */
  await p.evaluate(() => {
    const b = document.querySelector('[data-testid=icon-tim]');
    if (b) {
      b.removeAttribute('disabled');
      b.removeAttribute('aria-disabled');
    }
  });
  await p.click('[data-testid=icon-tim]');
  await p.waitForTimeout(1500);
  check(
    'Khách bật lại nút rồi bấm thì SERVER vẫn từ chối',
    soTrongDb(GAME_ID) === 0,
    `${soTrongDb(GAME_ID)} hàng trong DB`
  );
  await ctx.close();
}

// ---------- Bé thả icon ----------
const c1 = await child1Ctx.newPage();
await c1.goto(`${APP}/game/${GAME_ID}`, { waitUntil: 'networkidle' });

check('Bé đăng nhập thì nút bấm được', !(await c1.locator('[data-testid=icon-tim]').isDisabled()));

/* Vế CÓ của cặp trên: người bấm được thì nút mới nhấc lên dưới con trỏ. Thiếu phép
   này thì xoá sạch hiệu ứng đi vẫn xanh, vì phép ở khối khách chỉ kiểm vế KHÔNG. */
check(
  'Nút CÓ nhấc lên với bé đăng nhập',
  await c1.locator('[data-testid=icon-tim]').evaluate((e) => e.classList.contains('kg-icon-bam'))
);

/*
 * RÊ CHUỘT THÌ EMOJI TO LÊN VÀ RUNG, suốt lúc con trỏ còn nằm đó.
 *
 * Đo hai vế, vì mỗi vế hỏng một kiểu:
 *   · tên hoạt ảnh  -> luật CSS có khớp không
 *   · transform có ĐỔI THEO THỜI GIAN không -> nó có thật sự chạy không
 *
 * Vế thứ hai mới là vế khó bịa. Một `animation-name` đúng vẫn có thể đứng hình
 * (`animation-play-state: paused`, thời lượng 0, khung hình đầu trùng khung cuối), và
 * lúc đó phép kiểm chỉ đọc tên sẽ xanh trước một icon bất động.
 */
{
  const hinh = c1.locator('[data-testid=icon-tim] .kg-icon-hinh');
  await c1.locator('[data-testid=icon-tim]').hover();
  await c1.waitForTimeout(250);
  const ten = await hinh.evaluate((e) => getComputedStyle(e).animationName);
  const a = await hinh.evaluate((e) => getComputedStyle(e).transform);
  await c1.waitForTimeout(140);
  const b = await hinh.evaluate((e) => getComputedStyle(e).transform);
  check('Rê chuột vào thì emoji RUNG (và to lên)', ten === 'kg-icon-rung' && a !== b, `${ten}, transform ${a === b ? 'đứng yên' : 'đang đổi'}`);

  /* BÓNG dưới nút, phần còn thiếu của cú nhấc. Nhấc 2px mà không có bóng thì mắt
     đọc ra là hình bị xê dịch chứ không phải vật được nâng lên — không có khoảng
     cách nào giữa nút và nền để nhìn thấy. */
  const bong = await c1
    .locator('[data-testid=icon-tim]')
    .evaluate((e) => getComputedStyle(e).boxShadow);
  check('… và nút đổ BÓNG, để cú nhấc đọc ra là được nâng lên', bong !== 'none', bong);

  await c1.mouse.move(5, 5);
  await c1.waitForTimeout(200);
}

/*
 * CÚ NẢY LÚC VỪA THẢ — đo bằng cách BẮT SỰ KIỆN, không bằng cách chụp đúng lúc.
 *
 * Hoạt ảnh dài 420ms, mà hàm `thaIcon` phía dưới còn hỏi DB một vòng trước khi trả
 * về, nên lúc phép kiểm nhìn tới thì hoạt ảnh có thể đã chạy xong và lớp `kg-icon-na`
 * đã tự gỡ. Kiểm bằng "lớp đó còn trên phần tử không" là một phép kiểm chập chờn —
 * xanh hay đỏ tuỳ máy hôm nay nhanh chậm thế nào, tức không đo gì cả.
 *
 * `animationstart` thì chỉ bắn một lần và ta hứng được nó, dù nó kết thúc lúc nào.
 */
const batDauGhiNa = () =>
  c1.evaluate(() => {
    window.__na = { lop: false, chay: [] };
    document.addEventListener('animationstart', (e) => window.__na.chay.push(e.animationName), true);
    /*
     * Ghi RIÊNG việc React gắn lớp, ngoài việc trình duyệt chạy hoạt ảnh.
     *
     * Hai vế hỏng vì hai lý do khác hẳn nhau — React không gắn lớp, hay CSS không
     * chạy — mà một phép kiểm gộp thì báo đỏ y như nhau và ta lại phải đi dò từ đầu.
     * Đây là lần thứ hai trong phiên này một phép kiểm đỏ mà không nói được nó đỏ ở
     * đâu, nên lần này tách sẵn.
     */
    new MutationObserver((ds) => {
      for (const d of ds) {
        if (d.target instanceof Element && d.target.classList.contains('kg-icon-na')) {
          window.__na.lop = true;
        }
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
const docNa = () => c1.evaluate(() => window.__na);

/**
 * Chờ cú nảy bắn ra, tối đa `hanMs`.
 *
 * CHỜ CHỨ KHÔNG ĐỌC MỘT PHÁT, và đây là chỗ đã đỏ oan ba lần liền trước khi tìm ra.
 * `thaIcon()` trả về ngay khi DB đổi — có thể chỉ ~70ms sau cú bấm — trong khi
 * `animationstart` chỉ bắn ở khung hình kế tiếp. Đọc một phát là bốc thăm: máy hôm nay
 * nhanh thì đỏ, chậm thì xanh.
 *
 * Ba giả thuyết đã loại bằng đo, ghi lại để lần sau khỏi đi lại:
 *   · "React không gắn lớp"      -> MutationObserver thấy lớp được gắn, mọi lần.
 *   · "tab ở nền nên Chrome tắt hoạt ảnh" -> `visibilityState=visible`, `hasFocus=true`.
 *   · "CSS không khớp chọn tử"   -> computed `animation-name: kg-icon-na`, `0.42s`,
 *                                   phần tử còn trong DOM, không bật ít-chuyển-động.
 * Cả ba đều đúng, tức sản phẩm chưa bao giờ sai — chỉ có phép đo nhìn quá sớm.
 */
async function choNay(hanMs = 2000) {
  for (let i = 0; i < hanMs / 50; i++) {
    const na = await docNa();
    if (na.chay.includes('kg-icon-na')) return na;
    await c1.waitForTimeout(50);
  }
  return docNa();
}

await batDauGhiNa();
check('Thả được icon tim', await thaIcon(c1, 'tim'));

{
  const na = await choNay();
  check(
    'Thả icon thì emoji NẢY lên một cái',
    na.lop && na.chay.includes('kg-icon-na'),
    `React gắn lớp: ${na.lop ? 'có' : 'KHÔNG'} · hoạt ảnh chạy: ${na.chay.join(',') || 'KHÔNG'}`
  );
}
check(
  'Ghi đúng một hàng, đúng mã icon',
  dem(`select count(*) from "Reaction" where "gameId"='${GAME_ID}' and icon='tim'`) === 1
);
check(
  'Nút tim hiện là đang chọn',
  (await c1.locator('[data-testid=icon-tim]').getAttribute('data-chon')) === 'co'
);
check('Số đếm hiện lên 1', (await c1.locator('[data-testid=icon-tim]').innerText()).includes('1'));

/*
 * NÚT ĐANG CHỌN PHẢI ĐẬM THÊM KHI RÊ CHUỘT VÀO, không đứng im và không nhạt đi.
 *
 * Nó là nút GỠ — đường rút lại duy nhất của bé — và nó từng là nút duy nhất trong
 * hàng không phản hồi gì: viền đã sẵn là `accent-text` nên `hover:border-accent-text`
 * chẳng đổi được gì, còn một `hover:bg-accent/10` dùng chung thì kéo nền từ 15% xuống
 * 10%, tức rê chuột vào làm nút nhạt đi.
 *
 * Đo ĐỘ ĐẬM của lớp phủ chứ không so hai chuỗi màu: "khác nhau" thì nhạt đi cũng đạt,
 * mà nhạt đi chính là lỗi đang chặn ở đây.
 */
{
  const doPhu = async () => {
    const s = await c1.locator('[data-testid=icon-tim]').evaluate((e) => getComputedStyle(e).backgroundColor);
    return Number(s.match(/\/\s*([\d.]+)\s*\)/)?.[1] ?? 1);
  };
  /* Đẩy chuột ra KHỎI nút trước khi đo số "trước". Playwright để con trỏ nằm
     lại đúng chỗ vừa bấm, nên đo ngay là đo trạng thái ĐANG hover và so nó với
     chính nó — phép kiểm đỏ trong khi sản phẩm đúng. Đã đỏ thật một lần vì đúng
     chuyện này. */
  await c1.mouse.move(5, 5);
  await c1.waitForTimeout(250);
  const truoc = await doPhu();
  await c1.locator('[data-testid=icon-tim]').hover();
  await c1.waitForTimeout(300);
  const sau = await doPhu();
  check('Rê chuột vào nút ĐANG CHỌN thì nền đậm THÊM, không nhạt đi', sau > truoc, `${truoc} -> ${sau}`);
  await c1.mouse.move(5, 5);
  await c1.waitForTimeout(200);
}

// ---------- Đổi icon: phải ĐỔI, không phải thêm ----------
check('Đổi sang icon khác được', await thaIcon(c1, 'vui'));
check(
  'ĐỔI chứ không THÊM — vẫn đúng một hàng cho bé này',
  dem(`select count(*) from "Reaction" where "gameId"='${GAME_ID}'`) === 1,
  `${dem(`select count(*) from "Reaction" where "gameId"='${GAME_ID}'`)} hàng`
);
check(
  'Hàng đó mang mã mới',
  sql(`select icon from "Reaction" where "gameId"='${GAME_ID}'`) === 'vui'
);
check(
  'Icon cũ không còn sáng',
  (await c1.locator('[data-testid=icon-tim]').getAttribute('data-chon')) === 'khong'
);

// ---------- Bấm lại là gỡ ----------
/* Dọn sổ trước khi GỠ, để phép ngay dưới chỉ nói về cú bấm gỡ này. */
await batDauGhiNa();
check('Bấm lại đúng icon đang chọn thì GỠ', await thaIcon(c1, 'vui'));
{
  /*
   * Phép PHỦ ĐỊNH này chờ CỨNG một khoảng, không dùng `choNay`.
   *
   * `choNay` thoát sớm khi thấy cú nảy — đúng cho phép khẳng định, sai hoàn toàn ở
   * đây: chờ-tới-khi-thấy mà chẳng bao giờ thấy thì nó chỉ đốt hết 2 giây rồi trả về,
   * và ta không phân biệt được "đúng là không nảy" với "nhìn quá sớm". 600ms > 420ms
   * của hoạt ảnh, nên nếu có nảy thì chắc chắn đã bắn xong trước khi đọc.
   */
  await c1.waitForTimeout(600);
  const na = await docNa();
  check(
    'GỠ thì KHÔNG nảy — ăn mừng một cú rút lại thì đọc ra như trêu',
    !na.lop && !na.chay.includes('kg-icon-na')
  );
}
check('Không còn hàng nào của bé này', soTrongDb(GAME_ID) === 0);
check(
  'Không nút nào còn sáng',
  (await c1.locator('[data-testid=hang-icon] button[data-chon=co]').count()) === 0
);

// ---------- Bé thứ hai: số cộng dồn ----------
await thaIcon(c1, 'tim');

const child2Ctx = await newSession();
{
  const c = await child2Ctx.newPage();
  await c.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c.fill('#username', CHILD2_USER);
  await c.fill('#password', CHILD_PASS);
  await c.click('[data-testid=auth-form] button[type=submit]');
  await c.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});

  await c.goto(`${APP}/game/${GAME_ID}`, { waitUntil: 'networkidle' });
  check(
    'Bé thứ hai thấy số của bé thứ nhất',
    (await c.locator('[data-testid=icon-tim]').innerText()).includes('1')
  );
  check(
    'Nhưng nút KHÔNG sáng cho bé thứ hai',
    (await c.locator('[data-testid=icon-tim]').getAttribute('data-chon')) === 'khong'
  );

  await c.click('[data-testid=icon-tim]');
  for (let i = 0; i < 40 && soTrongDb(GAME_ID) < 2; i++) await c.waitForTimeout(100);
  check('Bé thứ hai thả được, thành hai hàng', soTrongDb(GAME_ID) === 2);
  check(
    'Số trên màn hình lên 2',
    (await c.locator('[data-testid=icon-tim]').innerText()).includes('2')
  );

  await c.goto(`${APP}/`, { waitUntil: 'networkidle' });
  check('Thẻ ở trang chủ đếm đúng số icon đã thả', (await vienIcon(c)) === '❤ 2', await vienIcon(c));
  await c.close();
}

// ---------- Phụ huynh: thấy số, KHÔNG thả được ----------
{
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/game/${GAME_ID}`, { waitUntil: 'networkidle' });
  check(
    'Phụ huynh thấy số đếm',
    (await p.locator('[data-testid=icon-tim]').innerText()).includes('2')
  );
  check('Nút bị khoá với phụ huynh', await p.locator('[data-testid=icon-tim]').isDisabled());

  /*
   * BẤM THÌ PHẢI NHẬN LẠI MỘT CÂU — và đo đúng ở đây chứ không ở khối khách.
   *
   * Game này giờ đã có hai lượt icon, nên câu gợi ý KHÔNG hiện sẵn: nó chỉ tự hiện
   * lúc hàng còn trống trơn. Hai phép dưới đây vì vậy đo được thật sự việc cú bấm
   * gây ra cái gì — vắng trước, có sau. Đặt ở khối khách thì phép sau xanh sẵn từ
   * đầu, và ai xoá cả nhánh xử lý bấm đi nó vẫn xanh.
   */
  check(
    'Câu gợi ý VẮNG mặt khi hàng đã có icon',
    (await p.locator('[data-testid=icon-goi-y]').count()) === 0
  );
  await p.click('[data-testid=icon-tim]', { force: true });
  await p.waitForTimeout(300);
  check(
    'Phụ huynh bấm icon thì được nói vì sao không thả được',
    (await p.locator('[data-testid=icon-goi-y]').count()) === 1 &&
      (await p.locator('[data-testid=icon-goi-y]').innerText()).includes('Đăng nhập')
  );

  /*
   * Lại gỡ rào rồi bấm. Phụ huynh là vai NGUY HIỂM NHẤT cho phép kiểm này: họ ĐANG
   * đăng nhập, có phiên hợp lệ, nên một chốt viết là "phải có actor" thay vì "actor
   * phải là bé" sẽ để lọt đúng vai này mà mọi phép kiểm dùng khách vẫn xanh.
   */
  await p.evaluate(() => {
    const b = document.querySelector('[data-testid=icon-dep]');
    if (b) {
      b.removeAttribute('disabled');
      b.removeAttribute('aria-disabled');
    }
  });
  await p.click('[data-testid=icon-dep]');
  await p.waitForTimeout(1500);
  check(
    'Phụ huynh bật lại nút rồi bấm thì SERVER vẫn từ chối',
    dem(`select count(*) from "Reaction" where "gameId"='${GAME_ID}' and icon='dep'`) === 0
  );
  await p.close();
}

// ---------- Mã icon lạ ----------
{
  check(
    'DB không nhận mã icon ngoài bộ (không có hàng lạ nào)',
    dem(
      `select count(*) from "Reaction" where "gameId"='${GAME_ID}' and icon not in ('tim','vui','bat-ngo','dep','gioi')`
    ) === 0
  );
}

// ---------- Người xin ÍT CHUYỂN ĐỘNG: vẫn phải biết icon bấm được ----------
{
  /*
   * TẮT RUNG NHƯNG GIỮ TO LÊN, và đây là chỗ dễ làm hỏng nhất khi thêm cú rung.
   *
   * Khối `prefers-reduced-motion` trong `globals.css` có sẵn một dòng
   * `.kg-icon-bam:hover .kg-icon-hinh { transform: none }` từ hồi hover còn là một
   * `transform` tĩnh. Cứ thế mà tắt rung là tắt luôn cả việc icon lớn lên — mà cú
   * nhấc nút cũng đã bị tắt ở dòng ngay trên, nên người ấy mất SẠCH mọi dấu hiệu
   * "cái này bấm được". Hỏng kiểu đó không đỏ ở đâu cả: giao diện vẫn vẽ ra đủ năm
   * nút, chỉ là không nút nào phản ứng gì.
   *
   * To lên không phải chuyển động — nó là một trạng thái tĩnh, đứng yên suốt lúc con
   * trỏ còn đó. Người tắt chuyển động không xin mất cái đó.
   */
  const ctx = await browser.newContext({
    viewport: { width: 1300, height: 1000 },
    reducedMotion: 'reduce',
  });
  const p = await ctx.newPage();
  await p.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await p.fill('#username', CHILD1_USER);
  await p.fill('#password', CHILD_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});
  await p.goto(`${APP}/game/${GAME_ID}`, { waitUntil: 'networkidle' });

  const hinh = p.locator('[data-testid=icon-tim] .kg-icon-hinh');
  await p.locator('[data-testid=icon-tim]').hover();
  await p.waitForTimeout(300);
  const ten = await hinh.evaluate((e) => getComputedStyle(e).animationName);
  const tf = await hinh.evaluate((e) => getComputedStyle(e).transform);
  check('Ít chuyển động: emoji KHÔNG rung', ten === 'none', ten);
  check(
    '… nhưng VẪN to lên, nên vẫn biết là bấm được',
    tf !== 'none' && tf.startsWith('matrix(1.28'),
    tf
  );
  await ctx.close();
}

// ---------- Xoá bé thì icon đi theo ----------
{
  const truoc = soTrongDb(GAME_ID);
  sql(`delete from "Child" where username = '${CHILD2_USER}'`);
  check(
    'Xoá bé thì icon của bé đó bị cascade xoá theo',
    soTrongDb(GAME_ID) === truoc - 1,
    `${truoc} -> ${soTrongDb(GAME_ID)}`
  );
}

await c1.close();
await browser.close();

const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
