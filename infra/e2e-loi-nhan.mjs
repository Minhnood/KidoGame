/**
 * Lời nhắn có sẵn — đo bằng trình duyệt thật và đối chiếu thẳng với database.
 *
 * ═══ PHÉP KIỂM ĐÁNG GIÁ NHẤT Ở ĐÂY: GỬI LẠI REQUEST CỦA NGƯỜI KHÁC ═══
 *
 * Cả tính năng này đứng trên một lời hứa: KHÔNG AI GÕ ĐƯỢC CHỮ TỰ DO lên trang của
 * một đứa trẻ. Giao diện chỉ bày tám cái nút, nên nhìn thì lời hứa ấy hiển nhiên —
 * và đó chính là lý do không được kiểm bằng cách nhìn. Thứ thật sự giữ lời hứa là
 * một dòng `MA_HOP_LE.has(ma)` nằm trên đường ghi; xoá nó đi thì mọi phép kiểm dựa
 * vào giao diện vẫn xanh, mà cột `phrase` trong DB nhận được bất cứ chuỗi nào.
 *
 * `e2e-icon` đã dựng được nửa đường cho câu hỏi loại này: gỡ `disabled` rồi bấm.
 * Ở đây nửa đó không đủ, vì với chủ game và với phụ huynh thì hàng nút KHÔNG ĐƯỢC
 * RENDER RA — không có gì để gỡ rào cả.
 *
 * Nên phép kiểm bắt lại đúng request mà React gửi đi khi một bé bấm nút, rồi GỬI
 * LẠI chính nó từ phiên khác và với nội dung khác. Đó đúng là việc mà một người mở
 * DevTools làm được, và nó trả lời bốn câu bằng cùng một cơ chế:
 *
 *   · chủ game tự nhắn cho mình     -> phải bị từ chối
 *   · phụ huynh (CÓ phiên hợp lệ)   -> phải bị từ chối
 *   · khách                          -> phải bị từ chối
 *   · một câu KHÔNG có trong bộ      -> phải bị từ chối  ← lời hứa của cả tính năng
 *
 * Chạy:
 *   SB3_FIXTURE=<đường-dẫn.sb3> MAIL_LOG=/tmp/kg-mail.log node infra/e2e-loi-nhan.mjs
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { batBuocMailLog, taoBoBamLink } from './e2e-mail.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const FIXTURE = process.env.SB3_FIXTURE ?? '';
const MAIL_LOG = batBuocMailLog('e2e-loi-nhan');

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-loi-${suffix}@kidogame.test`;
const PASS = 'matkhau-dai-1234';
const CHILD1_USER = `eln1${suffix}`;
const CHILD2_USER = `eln2${suffix}`;
const CHILD_PASS = 'be1234';
const TEN_BE_2 = 'Bé Nhắn Hai';

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

const soTrongDb = (gameId) => dem(`select count(*) from "Compliment" where "gameId" = '${gameId}'`);

/**
 * Chữ ký lời nhắn của một game: cặp (bé, mã câu) của mọi hàng, đã sắp xếp.
 *
 * Đếm số hàng là KHÔNG đủ, và `e2e-icon` đã đỏ oan đúng vì chuyện này — đổi câu giữ
 * nguyên số hàng ở 1, nên hàm chờ nào đợi số hàng đổi sẽ treo ở nhánh giữa rồi báo
 * "không đổi được câu" trong khi việc đổi đã chạy đúng. Chữ ký đổi ở cả ba nhánh.
 */
const chuKy = (gameId) =>
  sql(
    `select coalesce(string_agg("childId" || ':' || phrase, ',' order by "childId"), '') from "Compliment" where "gameId" = '${gameId}'`
  );

/** Bấm một câu rồi CHỜ DB đổi — không chỉ chờ hiệu ứng lạc quan trên màn hình. */
async function chonCau(page, ma) {
  const truoc = chuKy(GAME_ID);
  await page.click(`[data-testid=cau-${ma}]`);
  for (let i = 0; i < 40; i++) {
    if (chuKy(GAME_ID) !== truoc) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

/**
 * Gửi lại request đã bắt được, từ một phiên khác và (tuỳ chọn) với nội dung khác.
 *
 * Bỏ `cookie` đi là điểm mấu chốt: request gửi qua `ctx.request` sẽ mang cookie của
 * CHÍNH context đó. Giữ lại cookie cũ là vô tình gửi kèm phiên của bé, và phép kiểm
 * sẽ xanh trong khi chẳng chứng minh được gì về vai người gửi.
 */
async function guiLai(ctx, banGhi, doiNoiDung = (s) => s) {
  const h = { ...banGhi.headers };
  for (const k of ['cookie', 'content-length', 'host', ':authority']) delete h[k];
  const res = await ctx.request.post(banGhi.url, { headers: h, data: doiNoiDung(banGhi.body) });
  return res.status();
}

// ---------- Dựng: phụ huynh -> hai bé -> một game của bé 1 ----------
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
    ['Bé Nhắn Một', CHILD1_USER],
    [TEN_BE_2, CHILD2_USER],
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
  await c.fill('#title', `Game nhắn ${suffix}`);
  await c.setInputFiles('#file', FIXTURE);
  await c.click('[data-testid=upload-form] button[type=submit]');
  await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
  GAME_ID = c.url().split('/game/')[1] ?? '';
  check('Bé đăng được game', GAME_ID.length > 0, GAME_ID);
  await c.close();
}

const URL_GAME = `${APP}/game/${GAME_ID}`;

// ---------- Khách chưa đăng nhập ----------
{
  const ctx = await newSession();
  const p = await ctx.newPage();
  await p.goto(URL_GAME, { waitUntil: 'networkidle' });

  check('Khách vẫn THẤY khối lời nhắn', (await p.locator('[data-testid=loi-nhan]').count()) === 1);
  check(
    'Chưa ai nhắn thì hiện câu mời, không phải khoảng trống',
    (await p.locator('[data-testid=loi-nhan-rong]').count()) === 1
  );
  check(
    'Khách KHÔNG thấy nút nào để bấm',
    (await p.locator('[data-testid=loi-nhan] button').count()) === 0
  );
  check(
    'Khách được mời đăng nhập bằng tài khoản bé',
    (await p.locator('[data-testid=loi-nhan-goi-y]').count()) === 1
  );
  await ctx.close();
}

// ---------- Bé 2 nhắn, và ta GHI LẠI request ----------
const child2Ctx = await newSession();
const c2 = await child2Ctx.newPage();
let banGhi = null;

{
  await c2.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c2.fill('#username', CHILD2_USER);
  await c2.fill('#password', CHILD_PASS);
  await c2.click('[data-testid=auth-form] button[type=submit]');
  await c2.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});

  /*
   * Bắt lại request của server action. Không chặn, không sửa — chỉ chép lại rồi cho
   * đi tiếp. Bản ghi này là nguyên liệu cho bốn phép kiểm chốt ở cuối file.
   *
   * CHỈ GIỮ LẦN ĐẦU (`!banGhi`), và đó không phải chi tiết vặt. Bản đầu tiên ghi đè
   * theo mọi cú bấm sau, nên tới lúc dùng thì `banGhi.body` mang câu bé đang chọn
   * lúc đó — `replace('hay-qua', …)` không khớp gì, request được gửi lại NGUYÊN VẸN
   * bằng phiên hợp lệ của chính bé, và server đọc đúng nó là "bấm lại câu đang
   * sáng" tức lệnh GỠ. Phép kiểm "câu tự chế không vào được DB" vẫn XANH qua tất cả
   * chuyện đó, vì chuỗi tự chế thật sự không có trong DB — xanh vì lý do sai. Hai
   * phép sau mới đỏ, và một trong hai là phép cascade ở tận cuối file.
   */
  await c2.route('**/game/**', async (route) => {
    const req = route.request();
    if (!banGhi && req.method() === 'POST' && req.headers()['next-action'] && req.postData()) {
      banGhi = { url: req.url(), headers: { ...req.headers() }, body: req.postData() };
    }
    await route.continue();
  });

  await c2.goto(URL_GAME, { waitUntil: 'networkidle' });
  check(
    'Bé khác thấy đủ tám câu để chọn',
    (await c2.locator('[data-testid=loi-nhan] button').count()) === 8
  );

  check('Nhắn được một câu', await chonCau(c2, 'hay-qua'));
  check(
    'Ghi đúng một hàng, đúng MÃ câu (không phải câu chữ)',
    dem(`select count(*) from "Compliment" where "gameId"='${GAME_ID}' and phrase='hay-qua'`) === 1
  );
  check(
    'Câu vừa chọn hiện là đang sáng',
    (await c2.locator('[data-testid=cau-hay-qua]').getAttribute('data-chon')) === 'co'
  );

  /*
   * Câu ĐANG SÁNG phải phản hồi khi rê chuột vào — nó là nút GỠ lời nhắn.
   *
   * Nó từng là nút duy nhất trong hàng tám câu không phản hồi gì: viền đã sẵn là
   * `accent-text` nên `hover:border-accent-text` dùng chung chẳng đổi được gì. Trang
   * còn in hẳn câu "Bấm lại câu đang sáng để bỏ lời nhắn", tức chỉ thẳng vào một nút
   * trông như đã chết.
   *
   * Đo ĐỘ ĐẬM của lớp phủ, không so hai chuỗi màu — "khác nhau" thì nhạt đi cũng đạt.
   */
  {
    const doPhu = async () => {
      const s = await c2
        .locator('[data-testid=cau-hay-qua]')
        .evaluate((e) => getComputedStyle(e).backgroundColor);
      return Number(s.match(/\/\s*([\d.]+)\s*\)/)?.[1] ?? 1);
    };
    /* Đẩy chuột ra KHỎI nút trước khi đo số "trước". Playwright để con trỏ nằm
       lại đúng chỗ vừa bấm, nên đo ngay là đo trạng thái ĐANG hover và so nó với
       chính nó — phép kiểm đỏ trong khi sản phẩm đúng. Đã đỏ thật một lần vì đúng
       chuyện này. */
    await c2.mouse.move(5, 5);
    await c2.waitForTimeout(250);
    const truoc = await doPhu();
    await c2.locator('[data-testid=cau-hay-qua]').hover();
    await c2.waitForTimeout(300);
    const sau = await doPhu();
    check(
      'Rê chuột vào câu ĐANG SÁNG thì nền đậm THÊM, không đứng im',
      sau > truoc,
      `${truoc} -> ${sau}`
    );
    await c2.mouse.move(5, 5);
    await c2.waitForTimeout(200);
  }
  check('Bắt được request của server action để dùng lại', banGhi !== null);
  /*
   * Bản ghi phải chứa mã câu ở dạng đọc được, vì bốn phép chốt bên dưới sửa nội
   * dung bằng cách thay chuỗi. Không kiểm điều này thì một lần thay trượt sẽ lặng
   * lẽ gửi lại request NGUYÊN VẸN — và một request hợp lệ gửi lại thì server chấp
   * nhận, nên phép kiểm chốt biến thành phép kiểm rỗng mà vẫn xanh.
   */
  check(
    'Bản ghi mang đúng câu đầu tiên, sửa được nội dung',
    banGhi !== null && banGhi.body.includes('hay-qua')
  );
}

// ---------- Dòng hiện TÊN bé, và người lạ cũng đọc được ----------
{
  const ctx = await newSession();
  const p = await ctx.newPage();
  await p.goto(URL_GAME, { waitUntil: 'networkidle' });
  const dong = await p.locator('[data-testid=loi-nhan-dong]').first().innerText();
  check('Khách đọc được lời nhắn, kèm TÊN bé đã nhắn', dong.includes(TEN_BE_2), dong.replace(/\n/g, ' '));
  check('Và đọc được đúng câu chữ, không phải mã', dong.includes('Hay quá!'));
  await ctx.close();
}

// ---------- Đổi câu: phải ĐỔI, không phải thêm ----------
check('Đổi sang câu khác được', await chonCau(c2, 'lam-them'));
check(
  'ĐỔI chứ không THÊM — vẫn đúng một hàng cho bé này',
  soTrongDb(GAME_ID) === 1,
  `${soTrongDb(GAME_ID)} hàng`
);
check(
  'Hàng đó mang mã mới',
  sql(`select phrase from "Compliment" where "gameId"='${GAME_ID}'`) === 'lam-them'
);
check(
  'Câu cũ không còn sáng',
  (await c2.locator('[data-testid=cau-hay-qua]').getAttribute('data-chon')) === 'khong'
);

// ---------- Bấm lại là gỡ ----------
check('Bấm lại đúng câu đang sáng thì GỠ', await chonCau(c2, 'lam-them'));
check('Không còn hàng nào của bé này', soTrongDb(GAME_ID) === 0);
check(
  'Không nút nào còn sáng',
  (await c2.locator('[data-testid=loi-nhan] button[data-chon=co]').count()) === 0
);

// Nhắn lại để những phép sau có dữ liệu thật để so.
check('Nhắn lại được sau khi đã gỡ', await chonCau(c2, 'y-tuong-hay'));

// ---------- Chủ game: đọc được, KHÔNG có hàng nút ----------
{
  const c = await child1Ctx.newPage();
  await c.goto(URL_GAME, { waitUntil: 'networkidle' });
  check(
    'Chủ game đọc được lời nhắn của bạn',
    (await c.locator('[data-testid=loi-nhan-dong]').count()) === 1
  );
  check(
    'Chủ game KHÔNG có nút nào để tự nhắn cho mình',
    (await c.locator('[data-testid=loi-nhan] button').count()) === 0
  );
  check(
    'Và được nói rõ vì sao, thay vì im lặng thiếu nút',
    (await c.locator('[data-testid=loi-nhan-game-cua-toi]').count()) === 1
  );
  await c.close();
}

// ---------- BỐN PHÉP CHỐT: gửi lại request từ phiên khác ----------
if (!banGhi) {
  check('Không bắt được request nên bỏ qua bốn phép chốt', false);
} else {
  /*
   * 1. CHỦ GAME tự nhắn cho chính mình. Không có nút để gỡ rào, nên đây là đường
   *    duy nhất hỏi được câu này — và nó cũng đúng là đường một người thật sẽ đi.
   */
  {
    const truoc = chuKy(GAME_ID);
    const st = await guiLai(child1Ctx, banGhi);
    await c2.waitForTimeout(1200);
    check(
      'Chủ game gửi thẳng request thì SERVER vẫn từ chối',
      chuKy(GAME_ID) === truoc,
      `HTTP ${st}, chữ ký không đổi`
    );
  }

  /*
   * 2. PHỤ HUYNH. Vai nguy hiểm nhất: họ ĐANG đăng nhập và có phiên hợp lệ, nên một
   *    chốt viết là "phải có actor" thay vì "actor phải là bé" sẽ để lọt đúng vai
   *    này, trong khi mọi phép kiểm dùng khách vẫn xanh.
   */
  {
    const truoc = chuKy(GAME_ID);
    const st = await guiLai(parentCtx, banGhi);
    await c2.waitForTimeout(1200);
    check(
      'Phụ huynh gửi thẳng request thì SERVER vẫn từ chối',
      chuKy(GAME_ID) === truoc,
      `HTTP ${st}`
    );
  }

  // 3. KHÁCH, không phiên nào cả.
  {
    const ctx = await newSession();
    const truoc = chuKy(GAME_ID);
    const st = await guiLai(ctx, banGhi);
    await c2.waitForTimeout(1200);
    check('Khách gửi thẳng request thì SERVER vẫn từ chối', chuKy(GAME_ID) === truoc, `HTTP ${st}`);
    await ctx.close();
  }

  /*
   * 4. MỘT CÂU KHÔNG CÓ TRONG BỘ — phép kiểm giữ lời hứa của cả tính năng.
   *
   * Gửi bằng phiên của chính bé 2, tức là vai HỢP LỆ nhất có thể: nếu chuỗi này lọt
   * được vào cột `phrase` thì ô nhập chữ tự do đã mở lại bằng đường sau, và không
   * một pixel nào trên giao diện phản ánh điều đó.
   */
  {
    const BAY = 'may-ngu-the';
    const truoc = chuKy(GAME_ID);
    const doi = (b) => b.replace('hay-qua', BAY);
    check('Thay được nội dung câu trong request', doi(banGhi.body) !== banGhi.body);
    const st = await guiLai(child2Ctx, banGhi, doi);
    await c2.waitForTimeout(1200);
    check(
      'Câu tự chế KHÔNG vào được DB, dù gửi bằng phiên hợp lệ của bé',
      dem(`select count(*) from "Compliment" where phrase = '${BAY}'`) === 0,
      `HTTP ${st}`
    );
    check('Và hàng cũ của bé không bị đụng tới', chuKy(GAME_ID) === truoc);
  }
}

// ---------- Không mã lạ nào trong DB ----------
check(
  'DB chỉ chứa mã nằm trong bộ tám câu',
  dem(
    `select count(*) from "Compliment" where phrase not in ('hay-qua','vui-lam','dep-ghe','choi-mai','y-tuong-hay','gioi-qua','muon-nhu-ban','lam-them')`
  ) === 0
);

// ---------- Game đã gỡ thì không nhắn được nữa ----------
{
  const cu = sql(`select status from "Game" where id='${GAME_ID}'`);
  sql(`update "Game" set status='REMOVED' where id='${GAME_ID}'`);
  const truoc = chuKy(GAME_ID);
  const st = banGhi ? await guiLai(child2Ctx, banGhi, (b) => b.replace('hay-qua', 'gioi-qua')) : 0;
  await c2.waitForTimeout(1200);
  check('Game đã gỡ thì SERVER từ chối lời nhắn mới', chuKy(GAME_ID) === truoc, `HTTP ${st}`);
  sql(`update "Game" set status='${cu}' where id='${GAME_ID}'`);
}

// ---------- Xoá bé thì lời nhắn đi theo ----------
{
  const truoc = soTrongDb(GAME_ID);
  sql(`delete from "Child" where username = '${CHILD2_USER}'`);
  check(
    'Xoá bé thì lời nhắn của bé đó bị cascade xoá theo',
    soTrongDb(GAME_ID) === truoc - 1,
    `${truoc} -> ${soTrongDb(GAME_ID)}`
  );
}

await c2.close();
await browser.close();

const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
