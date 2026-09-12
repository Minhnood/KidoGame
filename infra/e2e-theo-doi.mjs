/**
 * Theo dõi bạn — đo bằng trình duyệt thật và đối chiếu thẳng với database.
 *
 * ═══ PHÉP KIỂM KHÓ NHẤT Ở ĐÂY LÀ MỘT PHÉP KIỂM PHỦ ĐỊNH ═══
 *
 * Tính năng này được định nghĩa nhiều bằng thứ nó KHÔNG có hơn là thứ nó có: không
 * ai xem được ai đang theo dõi mình, không ở đâu hiện số người theo dõi, kể cả cho
 * chính người được theo dõi. Một quyết định như vậy không tự bảo vệ được — nó chết
 * lặng lẽ vào ngày ai đó thêm một cái nhãn "3 bạn đang theo dõi bạn" và thấy trang
 * trông sinh động hẳn lên.
 *
 * Nên bộ này dựng đúng tình huống ấy rồi soi vào: bé 1 CÓ một người theo dõi thật,
 * và phép kiểm đi tìm dấu vết của điều đó trên mọi màn hình bé 1 mở được. Không tìm
 * thấy gì mới là đạt.
 *
 * Ba phép còn lại dùng lại cách của `e2e-loi-nhan`: bắt request server action rồi
 * gửi lại từ phiên khác — cách duy nhất hỏi được "server có chặn không" khi giao
 * diện thậm chí không render ra cái nút để mà gỡ rào.
 *
 * Chạy:
 *   SB3_FIXTURE=<đường-dẫn.sb3> MAIL_LOG=/tmp/kg-mail.log node infra/e2e-theo-doi.mjs
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { batBuocMailLog, taoBoBamLink } from './e2e-mail.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const FIXTURE = process.env.SB3_FIXTURE ?? '';
const MAIL_LOG = batBuocMailLog('e2e-theo-doi');

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-td-${suffix}@kidogame.test`;
const PASS = 'matkhau-dai-1234';
const CHILD1_USER = `etd1${suffix}`;
const CHILD2_USER = `etd2${suffix}`;
const CHILD_PASS = 'be1234';
const TEN_BE_1 = 'Bé Theo Một';

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

let CHILD1_ID = '';
let CHILD2_ID = '';
let GAME_ID = '';

const soTheoDoi = () =>
  dem(`select count(*) from "Follow" where "followerId"='${CHILD2_ID}' and "authorId"='${CHILD1_ID}'`);

/** Bấm nút theo dõi rồi CHỜ DB đổi, không chỉ chờ hiệu ứng lạc quan trên màn hình. */
async function bamTheoDoi(page, testid = 'nut-theo-doi') {
  const truoc = soTheoDoi();
  await page.click(`[data-testid=${testid}]`);
  for (let i = 0; i < 40; i++) {
    if (soTheoDoi() !== truoc) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

/** Gửi lại request đã bắt được, từ một phiên khác. Xem ghi chú ở `e2e-loi-nhan`. */
async function guiLai(ctx, banGhi) {
  const h = { ...banGhi.headers };
  for (const k of ['cookie', 'content-length', 'host', ':authority']) delete h[k];
  const res = await ctx.request.post(banGhi.url, { headers: h, data: banGhi.body });
  return res.status();
}

// ---------- Dựng: phụ huynh -> hai bé -> một game của bé 1 ----------
const parentCtx = await newSession();
{
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  check('Xác minh được email phụ huynh', await bamLinkXacMinh(p));

  for (const [ten, user] of [
    [TEN_BE_1, CHILD1_USER],
    ['Bé Theo Hai', CHILD2_USER],
  ]) {
    await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
    await p.fill('#displayName', ten);
    await p.fill('#username', user);
    await p.fill('#password', CHILD_PASS);
    await p.click('[data-testid=auth-form] button[type=submit]');
    await p.waitForTimeout(1500);
  }
  CHILD1_ID = sql(`select id from "Child" where username='${CHILD1_USER}'`);
  CHILD2_ID = sql(`select id from "Child" where username='${CHILD2_USER}'`);
  check('Dựng được hai bé', CHILD1_ID.length > 0 && CHILD2_ID.length > 0);
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
  await c.fill('#title', `Game theo doi ${suffix}`);
  await c.setInputFiles('#file', FIXTURE);
  await c.click('[data-testid=upload-form] button[type=submit]');
  await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
  GAME_ID = c.url().split('/game/')[1] ?? '';
  check('Bé 1 đăng được game', GAME_ID.length > 0, GAME_ID);

  check(
    'Chủ game KHÔNG thấy nút theo dõi trên game của chính mình',
    (await c.locator('[data-testid=theo-doi]').count()) === 0
  );
  await c.close();
}

const URL_GAME = `${APP}/game/${GAME_ID}`;

// ---------- Khách và phụ huynh: không có nút ----------
{
  const ctx = await newSession();
  const p = await ctx.newPage();
  await p.goto(URL_GAME, { waitUntil: 'networkidle' });
  check('Khách không thấy nút theo dõi', (await p.locator('[data-testid=theo-doi]').count()) === 0);
  await ctx.close();

  const pp = await parentCtx.newPage();
  await pp.goto(URL_GAME, { waitUntil: 'networkidle' });
  check(
    'Phụ huynh không thấy nút theo dõi',
    (await pp.locator('[data-testid=theo-doi]').count()) === 0
  );
  await pp.close();
}

// ---------- Bé 2 trước khi theo dõi: trang chủ KHÔNG có dải bạn bè ----------
const child2Ctx = await newSession();
const c2 = await child2Ctx.newPage();
let banGhi = null;

{
  await c2.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c2.fill('#username', CHILD2_USER);
  await c2.fill('#password', CHILD_PASS);
  await c2.click('[data-testid=auth-form] button[type=submit]');
  await c2.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});

  await c2.goto(`${APP}/`, { waitUntil: 'networkidle' });
  check(
    'Chưa theo dõi ai thì trang chủ KHÔNG có dải bạn bè',
    (await c2.locator('[data-testid=game-ban-be]').count()) === 0
  );

  await c2.goto(`${APP}/ban-be`, { waitUntil: 'networkidle' });
  check(
    'Trang bạn bè lúc đầu rỗng',
    (await c2.locator('[data-testid=ban-dang-theo-doi]').count()) === 0
  );
}

// ---------- Bé 2 theo dõi bé 1 ----------
{
  await c2.route('**/game/**', async (route) => {
    const req = route.request();
    // Chỉ giữ LẦN ĐẦU: bản ghi bị ghi đè theo mỗi cú bấm sau sẽ mang trạng thái
    // khác, và lúc gửi lại thì nó là lệnh ngược — `e2e-loi-nhan` đã trả giá cho
    // đúng chỗ này.
    if (!banGhi && req.method() === 'POST' && req.headers()['next-action'] && req.postData()) {
      banGhi = { url: req.url(), headers: { ...req.headers() }, body: req.postData() };
    }
    await route.continue();
  });

  await c2.goto(URL_GAME, { waitUntil: 'networkidle' });
  check('Bé khác THẤY nút theo dõi', (await c2.locator('[data-testid=theo-doi]').count()) === 1);
  check(
    'Nút mời theo dõi, chưa ở trạng thái đang theo',
    (await c2.locator('[data-testid=nut-theo-doi]').getAttribute('data-dang')) === 'khong'
  );

  check('Theo dõi được', await bamTheoDoi(c2));
  check('DB ghi đúng một hàng, đúng chiều', soTheoDoi() === 1);
  check(
    'Nút đổi sang trạng thái đang theo dõi',
    (await c2.locator('[data-testid=nut-theo-doi]').getAttribute('data-dang')) === 'co'
  );

  /*
   * Ở trạng thái ĐANG THEO DÕI, nút vẫn phải phản hồi khi rê chuột vào.
   *
   * Nó từng không phản hồi gì cả — `hover:border-accent-text` chỉ nằm ở nhánh CHƯA
   * theo dõi, nên nút "Đang theo dõi …" không đổi viền, không đổi nền, không gì. Mà
   * đó đúng là nút để BỎ theo dõi: con trỏ đi qua nó như đi qua một dòng chữ.
   *
   * Đo ĐỘ ĐẬM của lớp phủ, không so hai chuỗi màu — "khác nhau" thì nhạt đi cũng đạt.
   */
  {
    const doPhu = async () => {
      const s = await c2
        .locator('[data-testid=nut-theo-doi]')
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
    await c2.locator('[data-testid=nut-theo-doi]').hover();
    await c2.waitForTimeout(300);
    const sau = await doPhu();
    check(
      'Rê chuột vào nút ĐANG THEO DÕI thì nền đậm THÊM, không đứng im',
      sau > truoc,
      `${truoc} -> ${sau}`
    );
    await c2.mouse.move(5, 5);
    await c2.waitForTimeout(200);
  }
  check('Bắt được request server action để dùng lại', banGhi !== null);
}

// ---------- Phần thưởng: game của bạn hiện ở trang chủ ----------
{
  await c2.goto(`${APP}/`, { waitUntil: 'networkidle' });
  check(
    'Trang chủ của bé 2 giờ có dải game bạn bè',
    (await c2.locator('[data-testid=game-ban-be]').count()) === 1
  );
  const chu = await c2.locator('[data-testid=game-ban-be]').innerText();
  check('Dải đó chứa game của bạn vừa theo dõi', chu.includes(TEN_BE_1), chu.split('\n')[0]);

  /*
   * Đang tìm kiếm thì dải phải biến mất: bé đang đi tìm một game cụ thể, chen một
   * dải khác vào giữa là đẩy thứ bé vừa gõ ra khỏi màn hình.
   */
  await c2.goto(`${APP}/?q=khongcogamenaotenthenay`, { waitUntil: 'networkidle' });
  check(
    'Đang tìm kiếm thì dải bạn bè KHÔNG chen vào',
    (await c2.locator('[data-testid=game-ban-be]').count()) === 0
  );
}

// ---------- PHÉP KIỂM PHỦ ĐỊNH: bé 1 không biết mình có người theo dõi ----------
{
  const c = await child1Ctx.newPage();

  await c.goto(URL_GAME, { waitUntil: 'networkidle' });
  const trangGame = await c.locator('body').innerText();
  check(
    'Trang game của bé 1 không hé lộ rằng có người theo dõi',
    !/theo dõi/i.test(trangGame),
    trangGame.match(/.{0,30}theo dõi.{0,30}/i)?.[0] ?? 'không có chữ "theo dõi" nào'
  );

  await c.goto(`${APP}/`, { waitUntil: 'networkidle' });
  check(
    'Trang chủ của bé 1 cũng không có dải bạn bè (bé 1 không theo dõi ai)',
    (await c.locator('[data-testid=game-ban-be]').count()) === 0
  );

  /*
   * Phép kiểm quan trọng nhất của cả bộ. Bé 1 ĐANG có một người theo dõi thật. Nếu
   * trang này liệt kê ra dù chỉ một dòng, thì "ẩn danh một nửa" đã thành "công
   * khai", và không một phép kiểm nào khác trong repo bắt được điều đó.
   */
  await c.goto(`${APP}/ban-be`, { waitUntil: 'networkidle' });
  check(
    'Trang bạn bè của bé 1 RỖNG, dù bé 1 đang có người theo dõi',
    (await c.locator('[data-testid=ban-dang-theo-doi]').count()) === 0,
    `DB: ${dem(`select count(*) from "Follow" where "authorId"='${CHILD1_ID}'`)} người đang theo dõi bé 1`
  );
  const trangBanBe = await c.locator('body').innerText();
  check(
    'Và không có con số người theo dõi nào trên đó',
    !/\d+\s*(bạn|người)\s*(đang\s*)?theo dõi bạn/i.test(trangBanBe)
  );
  await c.close();
}

// ---------- Chốt server: gửi lại request từ phiên khác ----------
if (!banGhi) {
  check('Không bắt được request nên bỏ qua ba phép chốt', false);
} else {
  // 1. Chủ game tự theo dõi chính mình. Không có nút nào để gỡ rào, nên đây là
  //    đường duy nhất hỏi được câu này.
  {
    const truoc = dem(`select count(*) from "Follow" where "followerId"='${CHILD1_ID}'`);
    const st = await guiLai(child1Ctx, banGhi);
    await c2.waitForTimeout(1200);
    check(
      'Bé 1 gửi thẳng request thì KHÔNG tự theo dõi mình được',
      dem(`select count(*) from "Follow" where "followerId"='${CHILD1_ID}'`) === truoc,
      `HTTP ${st}`
    );
  }

  // 2. Phụ huynh — vai nguy hiểm nhất, phiên hoàn toàn hợp lệ.
  {
    const truoc = dem('select count(*) from "Follow"');
    const st = await guiLai(parentCtx, banGhi);
    await c2.waitForTimeout(1200);
    check(
      'Phụ huynh gửi thẳng request thì SERVER vẫn từ chối',
      dem('select count(*) from "Follow"') === truoc,
      `HTTP ${st}`
    );
  }

  // 3. Khách.
  {
    const ctx = await newSession();
    const truoc = dem('select count(*) from "Follow"');
    const st = await guiLai(ctx, banGhi);
    await c2.waitForTimeout(1200);
    check(
      'Khách gửi thẳng request thì SERVER vẫn từ chối',
      dem('select count(*) from "Follow"') === truoc,
      `HTTP ${st}`
    );
    await ctx.close();
  }
}

// ---------- Trang bạn bè của bé 2: có bạn, bỏ được ----------
{
  await c2.goto(`${APP}/ban-be`, { waitUntil: 'networkidle' });
  check(
    'Bé 2 thấy đúng một bạn trong danh sách của mình',
    (await c2.locator('[data-testid=ban-dang-theo-doi]').count()) === 1
  );
  check(
    'Và đó đúng là bé 1',
    (await c2.locator('[data-testid=ban-dang-theo-doi]').innerText()).includes(TEN_BE_1)
  );

  check('Bỏ theo dõi từ trang bạn bè được', await bamTheoDoi(c2, 'nut-bo-theo-doi'));
  check('DB không còn hàng nào', soTheoDoi() === 0);
  check(
    'Bỏ nhầm thì theo dõi lại được ngay tại chỗ',
    (await c2.locator('[data-testid=nut-bo-theo-doi]').innerText()).includes('Theo dõi lại')
  );
}

// ---------- Bấm lại trên trang game cũng là bỏ ----------
{
  await c2.goto(URL_GAME, { waitUntil: 'networkidle' });
  check('Theo dõi lại từ trang game', await bamTheoDoi(c2));
  check('Bấm lại lần nữa là BỎ', await bamTheoDoi(c2));
  check('Không còn hàng nào', soTheoDoi() === 0);
}

// ---------- Tài khoản bị khoá thì không theo dõi được ----------
{
  sql(`update "Child" set "isLocked" = true where id = '${CHILD1_ID}'`);
  await c2.goto(URL_GAME, { waitUntil: 'networkidle' });
  await c2.click('[data-testid=nut-theo-doi]');
  await c2.waitForTimeout(1500);
  check('Bạn đang bị khoá tài khoản thì SERVER từ chối', soTheoDoi() === 0);
  check(
    'Và nói ra lý do thay vì im lặng',
    (await c2.locator('[data-testid=theo-doi-loi]').count()) === 1
  );
  sql(`update "Child" set "isLocked" = false where id = '${CHILD1_ID}'`);
}

// ---------- Xoá bé thì quan hệ đi theo, cả hai chiều ----------
{
  await c2.goto(URL_GAME, { waitUntil: 'networkidle' });
  await bamTheoDoi(c2);
  check('Dựng lại một hàng để thử cascade', soTheoDoi() === 1);

  sql(`delete from "Child" where username = '${CHILD2_USER}'`);
  check(
    'Xoá NGƯỜI THEO DÕI thì hàng biến mất',
    dem(`select count(*) from "Follow" where "authorId"='${CHILD1_ID}'`) === 0
  );
}

await c2.close();
await browser.close();

const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
