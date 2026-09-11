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
   * GỠ RÀO RỒI BẤM. Xem ghi chú số 2 ở đầu file: chỉ kiểm `disabled` là đo cái
   * khoá trên cửa, không đo cái cửa.
   */
  await p.evaluate(() => {
    const b = document.querySelector('[data-testid=icon-tim]');
    if (b) b.removeAttribute('disabled');
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

check('Thả được icon tim', await thaIcon(c1, 'tim'));
check(
  'Ghi đúng một hàng, đúng mã icon',
  dem(`select count(*) from "Reaction" where "gameId"='${GAME_ID}' and icon='tim'`) === 1
);
check(
  'Nút tim hiện là đang chọn',
  (await c1.locator('[data-testid=icon-tim]').getAttribute('data-chon')) === 'co'
);
check('Số đếm hiện lên 1', (await c1.locator('[data-testid=icon-tim]').innerText()).includes('1'));

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
check('Bấm lại đúng icon đang chọn thì GỠ', await thaIcon(c1, 'vui'));
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
   * Lại gỡ rào rồi bấm. Phụ huynh là vai NGUY HIỂM NHẤT cho phép kiểm này: họ ĐANG
   * đăng nhập, có phiên hợp lệ, nên một chốt viết là "phải có actor" thay vì "actor
   * phải là bé" sẽ để lọt đúng vai này mà mọi phép kiểm dùng khách vẫn xanh.
   */
  await p.evaluate(() => {
    const b = document.querySelector('[data-testid=icon-dep]');
    if (b) b.removeAttribute('disabled');
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
