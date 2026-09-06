/**
 * Kiểm hạn giữ game đã gỡ: 7 ngày rồi xoá hẳn.
 *
 * VÌ SAO CẦN MỘT BỘ RIÊNG. Cơ chế này xoá dữ liệu người dùng theo một mốc thời
 * gian, và cả hai hướng hỏng của nó đều IM LẶNG:
 *
 *  - Xoá SỚM hoặc xoá SAI NHÓM là mất game của một đứa trẻ, không hoàn tác được.
 *    Không có màn hình nào báo, không có lỗi nào; game chỉ đơn giản không còn.
 *  - KHÔNG xoá gì cả cũng im lặng như thế: hàng đợi vẫn sạch, trang vẫn chạy, và
 *    "một tuần thì xoá luôn" thành một câu trong tài liệu chứ không phải một cơ chế.
 *
 * Và một hướng thứ ba, tệ nhất vì nó chỉ lộ ra khi có tranh chấp thật: xoá game mà
 * xoá theo luôn HỒ SƠ khiếu nại bản quyền. Đó là bảng duy nhất trong hệ thống mang
 * nghĩa vụ pháp lý, nên nó có phép kiểm riêng ở đây.
 *
 * Cần:
 *   - app server đang chạy, có redirect log mail
 *   - `psql` gọi được (bài này phải kéo `removedAt` về quá khứ — không có cách nào
 *     khác để kiểm việc xoá mà không chờ thật 7 ngày)
 *   - một file .sb3 hợp lệ
 *
 * Chạy:
 *   SB3_FIXTURE=... MAIL_LOG=/tmp/kg-mail.log node infra/e2e-prune-removed.mjs
 *
 * CHẠY SAU `e2e-takedown`, KHÔNG CHẠY TRƯỚC. Bài này dựng một yêu cầu gỡ bản quyền
 * và tự đóng nó ở cuối, nhưng nếu nó ĐỔ giữa đường thì hàng đó nằm lại — và
 * `e2e-takedown` khẳng định hàng đợi bản quyền có ĐÚNG một hàng, nên nó sẽ đỏ ở một
 * phép kiểm chẳng liên quan gì ("gửi trùng không tạo thêm hàng thứ hai"), rồi đổ tiếp
 * ở một selector `strict mode violation`. Triệu chứng không chỉ về đâu cả. Dọn bằng:
 *   delete from "TakedownRequest" where "claimantEmail" like '%@vidu.test';
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { batBuocMailLog, choMailToi, taoBoBamLink } from './e2e-mail.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const ADMIN = process.env.ADMIN_ORIGIN ?? 'http://admin.localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'demo@kidogame.local';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'demo1234ab';
const FIXTURE = process.env.SB3_FIXTURE ?? '';
const MAIL_LOG = batBuocMailLog('e2e-prune-removed');

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-pr-${suffix}@kidogame.test`;
const PARENT_PASS = 'matkhau-dai-1234';
const CHILD_USER = `epr${suffix}`;
const CHILD_PASS = 'be1234';
const CLAIMANT_EMAIL = `nguoi-goc-pr-${suffix}@vidu.test`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!FIXTURE) {
  console.error('Cần SB3_FIXTURE=<đường dẫn .sb3>.');
  process.exit(1);
}

/*
 * Cắt query string khỏi DATABASE_URL trước khi đưa cho psql — `?schema=public` là
 * tham số của Prisma, psql sẽ coi nó là phần của tên database. Cùng cách làm như
 * `e2e-auth.mjs`.
 */
const WEB = path.join(import.meta.dirname, '..', 'apps', 'web');
function dbUrl() {
  const raw = fs.readFileSync(path.join(WEB, '.env'), 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1] ?? '';
  return raw.split('?')[0];
}
const DB = dbUrl();

const sql = (q) => execFileSync('psql', [DB, '-q', '-t', '-A', '-c', q]).toString().trim();

/** Chạy script dọn. Trả về cả stdout và mã thoát — cả hai đều là thứ cần kiểm. */
function chayDon(args = [], env = {}) {
  try {
    const out = execFileSync('pnpm', ['--filter', '@kidogame/web', 'db:prune-removed', ...args], {
      cwd: path.join(import.meta.dirname, '..'),
      env: { ...process.env, ...env },
    }).toString();
    return { ma: 0, out };
  } catch (e) {
    return { ma: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const browser = await chromium.launch({ channel: 'chrome' });
const bamLinkXacMinh = taoBoBamLink(MAIL_LOG, { appOrigin: APP });
const newSession = () => browser.newContext({ viewport: { width: 1300, height: 1000 } });

/*
 * Tham số lọc của khu quản trị là `loc`, KHÔNG phải `filter`.
 *
 * Bản đầu bài kiểm này gõ `?filter=tat-ca`; Next bỏ qua tham số lạ nên trang trả về
 * bộ lọc MẶC ĐỊNH `can-xem` (`reportCount > 0 OR status != PUBLISHED`). Nó vẫn chạy
 * đúng ở game đầu — game ấy đang HIDDEN vì có khiếu nại nên vô tình nằm trong
 * `can-xem` — rồi mới đổ ở game thứ hai, một game PUBLISHED sạch báo cáo. Triệu
 * chứng là "không tìm thấy nút Gỡ", trông y như nút bị mất chứ không như sai URL.
 */
async function confirmClick(row, testId) {
  await row.locator(`[data-testid=${testId}]`).click();
  await row.locator(`[data-testid=${testId}-confirm]`).click();
  await row.page().waitForTimeout(2500);
}

// ---------- Dựng dữ liệu: phụ huynh -> bé -> hai game ----------
const parentCtx = await newSession();
const childCtx = await newSession();
const games = [];

{
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PARENT_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  check('Xác minh được email phụ huynh', await bamLinkXacMinh(p));

  await p.fill('#displayName', 'Bé Hạn Giữ');
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', CHILD_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForTimeout(2500);
  await p.close();

  const c = await childCtx.newPage();
  await c.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c.fill('#username', CHILD_USER);
  await c.fill('#password', CHILD_PASS);
  await c.click('[data-testid=auth-form] button[type=submit]');
  await c.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});

  for (const label of ['gỡ', 'giữ']) {
    await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
    await c.fill('#title', `Game hạn giữ ${label} ${suffix}`);
    await c.setInputFiles('#file', FIXTURE);
    await c.click('[data-testid=upload-form] button[type=submit]');
    await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
    games.push(c.url().split('/game/')[1] ?? '');
  }
  await c.close();

  check('Dựng được hai game', games.length === 2 && games.every(Boolean), games.join(', '));
}

if (!games.every(Boolean)) {
  console.error('Không đăng được game, dừng.');
  await browser.close();
  process.exit(1);
}

const [GAME_GO, GAME_GIU] = games;

// ---------- Một yêu cầu gỡ bản quyền, để kiểm hồ sơ sống sót ----------
{
  const p = await (await newSession()).newPage();
  await p.goto(`${APP}/bao-cao-ban-quyen`, { waitUntil: 'networkidle' });
  await p.fill('#gameRef', GAME_GO);
  await p.fill('#claimantName', 'Người Làm Bản Gốc');
  await p.fill('#claimantEmail', CLAIMANT_EMAIL);
  await p.fill('#evidence', 'Bản gốc của tôi, đăng từ 2019.');
  await p.locator('[data-testid=takedown-attest]').check();
  await p.click('[data-testid=takedown-form] button[type=submit]');
  await p.waitForSelector('[data-testid=takedown-done]', { timeout: 20000 }).catch(() => {});
  check(
    'Gửi được một yêu cầu gỡ bản quyền cho game sắp bị xoá',
    Number(sql(`select count(*) from "TakedownRequest" where "gameId" = '${GAME_GO}'`)) === 1
  );
  await p.close();
}

// ---------- Admin gỡ hẳn ----------
const adminCtx = await newSession();
const admin = await adminCtx.newPage();
{
  await admin.goto(`${ADMIN}/admin/dang-nhap`, { waitUntil: 'networkidle' });
  await admin.fill('#email', ADMIN_EMAIL);
  await admin.fill('#password', ADMIN_PASS);
  await admin.click('[data-testid=auth-form] button[type=submit]');
  await admin.waitForURL((u) => u.pathname === '/admin', { timeout: 20000 }).catch(() => {});

  await admin.goto(`${ADMIN}/admin?loc=tat-ca`, { waitUntil: 'networkidle' });
  const row = admin.locator(`[data-testid=admin-game][data-game-id="${GAME_GO}"]`);
  await confirmClick(row, 'admin-remove');

  check(
    'Gỡ hẳn thì `removedAt` được đặt',
    sql(`select "removedAt" is not null from "Game" where id = '${GAME_GO}'`) === 't'
  );

  /*
   * Hạn phải hiện NGAY CẠNH nút "Cho hiện lại". Sau hạn đó chính cái nút ấy không
   * còn gì để hiện lại, nên người trực phải đọc được số ngày còn lại ở đúng chỗ họ
   * đang quyết định — chứ không phát hiện ra bằng cách bấm một nút không làm gì.
   */
  await admin.goto(`${ADMIN}/admin?loc=da-go`, { waitUntil: 'networkidle' });
  const han = admin.locator(
    `[data-testid=admin-game][data-game-id="${GAME_GO}"] [data-testid=admin-han-xoa]`
  );
  const chuHan = (await han.count()) > 0 ? await han.innerText() : '';
  check('Khu quản trị hiện hạn xoá hẳn của game đã gỡ', /còn \d+ ngày/.test(chuHan), chuHan);

  /*
   * THƯ BÁO PHỤ HUYNH, KÈM LINK TẢI FILE GỐC.
   *
   * Đây là phép kiểm cho cái đắt nhất của cả cơ chế này: bảy ngày nữa file `.sb3`
   * của một đứa trẻ bị xoá không lấy lại được, và phụ huynh chỉ kịp cứu nếu họ BIẾT.
   * Đường hỏng thì im hoàn toàn — game vẫn gỡ đúng, hạn vẫn chạy đúng, chỉ có lá thư
   * là không bao giờ tới, và không ai phát hiện ra cho tới lúc file đã mất.
   *
   * Ba phép, ba thứ khác nhau, vì thư tới mà thiếu link thì cũng vô dụng như không
   * có thư:
   *  1. thư có tới đúng hòm thư của phụ huynh không,
   *  2. trong thư có ĐÚNG hash của file game này không (không phải một link chung
   *     chung, cũng không phải hash của game khác),
   *  3. có nói ra một cái NGÀY không — "sẽ bị xoá" mà không kèm ngày thì phụ huynh
   *     không biết mình còn bao lâu.
   */
  const sha = sql(`select "sb3Sha256" from "Game" where id = '${GAME_GO}'`);
  check(
    'Gỡ hẳn thì phụ huynh nhận được thư báo',
    await choMailToi(MAIL_LOG, PARENT_EMAIL, /đã bị gỡ khỏi KidoGame/i),
    PARENT_EMAIL
  );
  check(
    'Thư có link tải đúng file .sb3 gốc của game vừa gỡ',
    /^[0-9a-f]{64}$/.test(sha) && (await choMailToi(MAIL_LOG, PARENT_EMAIL, new RegExp(sha))),
    sha.slice(0, 12)
  );
  check(
    'Thư nói rõ ngày file gốc bị xoá hẳn',
    await choMailToi(MAIL_LOG, PARENT_EMAIL, /XOÁ HẲN NGÀY \d{1,2}\/\d{1,2}\/\d{4}/)
  );
}

// ---------- Chạy khô: game vừa gỡ KHÔNG được coi là quá hạn ----------
{
  const { ma, out } = chayDon();
  check('Chạy khô thành công', ma === 0, `mã ${ma}`);
  check(
    'Game vừa gỡ hôm nay KHÔNG nằm trong nhóm quá hạn',
    /Quá hạn.*: 0 game/.test(out),
    out.match(/Quá hạn[^\n]*/)?.[0] ?? '(không thấy dòng nào)'
  );
  check(
    'Chạy khô không xoá gì',
    Number(sql(`select count(*) from "Game" where id = '${GAME_GO}'`)) === 1
  );
}

// ---------- Cho hiện lại thì đồng hồ phải được xoá ----------
/*
 * Vòng này phải làm trên game KHÔNG có khiếu nại bản quyền.
 *
 * `adminRestoreGameAction` cố tình TỪ CHỐI cho hiện lại một game đang có yêu cầu gỡ
 * chờ xử lý — việc đúng ở đó là bác khiếu nại trong hàng đợi bản quyền. Bản đầu của
 * bài kiểm này thử hiện lại chính GAME_GO (game có khiếu nại) và đọc ra "removedAt
 * chưa về null", trông y như lỗi của `adminRestoreGame`; thật ra là chốt an toàn kia
 * đang chạy đúng. Đó cũng là lý do game bị gỡ theo đường bản quyền chắc chắn đi tới
 * hạn xoá — không ai bật lại nó được bằng một cái nút.
 */
{
  await admin.goto(`${ADMIN}/admin?loc=tat-ca`, { waitUntil: 'networkidle' });
  await confirmClick(
    admin.locator(`[data-testid=admin-game][data-game-id="${GAME_GIU}"]`),
    'admin-remove'
  );
  check(
    'Game không khiếu nại: gỡ thì đồng hồ chạy',
    sql(`select "removedAt" is not null from "Game" where id = '${GAME_GIU}'`) === 't'
  );

  await admin.goto(`${ADMIN}/admin?loc=da-go`, { waitUntil: 'networkidle' });
  await confirmClick(
    admin.locator(`[data-testid=admin-game][data-game-id="${GAME_GIU}"]`),
    'admin-restore'
  );
  check(
    'Cho hiện lại thì `removedAt` về null',
    sql(`select "removedAt" is null from "Game" where id = '${GAME_GIU}'`) === 't'
  );
  check(
    'Và game về lại PUBLISHED',
    sql(`select status from "Game" where id = '${GAME_GIU}'`) === 'PUBLISHED'
  );
}

// ---------- Kéo mốc về quá khứ, rồi kiểm chốt an toàn ----------
{
  sql(
    `update "Game" set "removedAt" = (now() at time zone 'UTC') - interval '8 days' where id = '${GAME_GO}'`
  );

  const { out } = chayDon();
  check(
    'Quá 8 ngày thì chạy khô LIỆT KÊ game đó là quá hạn',
    /Quá hạn.*: 1 game/.test(out),
    out.match(/Quá hạn[^\n]*/)?.[0] ?? ''
  );
  check(
    'Nhưng chạy khô vẫn KHÔNG xoá',
    Number(sql(`select count(*) from "Game" where id = '${GAME_GO}'`)) === 1
  );

  /*
   * Hạn giữ 0 ngày biến cơ chế này thành "xoá ngay khi bấm gỡ", tức mất sạch cửa sổ
   * sửa sai — và nó là một biến môi trường, thứ dễ đặt sai bằng một dòng trong .env
   * hơn là bằng code ai đó phải review. Phải TỪ CHỐI, không phải làm theo.
   */
  const so0 = chayDon(['--xoa'], { REMOVED_KEEP_DAYS: '0' });
  check('REMOVED_KEEP_DAYS=0 thì script từ chối chạy', so0.ma === 2, `mã ${so0.ma}`);
  const chu = chayDon(['--xoa'], { REMOVED_KEEP_DAYS: 'bay' });
  check('REMOVED_KEEP_DAYS không phải số thì cũng từ chối', chu.ma === 2, `mã ${chu.ma}`);
  check(
    'Hai lần từ chối đó không xoá gì cả',
    Number(sql(`select count(*) from "Game" where id = '${GAME_GO}'`)) === 1
  );
}

// ---------- Xoá thật ----------
{
  /*
   * Game thứ hai đang PUBLISHED nhưng bị đặt `removedAt` — trạng thái không nên tồn
   * tại, dựng ra ở đây đúng để chứng minh truy vấn dọn lọc theo CẢ status. Nếu nó chỉ
   * lọc theo thời gian thì lượt này sẽ xoá một game đang chạy công khai trên trang
   * chủ, và không có gì trong hệ thống báo lại.
   */
  sql(
    `update "Game" set "removedAt" = (now() at time zone 'UTC') - interval '30 days' where id = '${GAME_GIU}'`
  );

  const soVetTruoc = Number(
    sql(`select count(*) from "ModerationLog" where "gameId" = '${GAME_GO}'`)
  );

  const { ma, out } = chayDon(['--xoa']);
  check('Xoá thật chạy xong không lỗi', ma === 0, `mã ${ma}`);
  check(
    'Game quá hạn bị xoá khỏi DB',
    Number(sql(`select count(*) from "Game" where id = '${GAME_GO}'`)) === 0
  );
  check(
    'Game đang PUBLISHED thì KHÔNG bị chạm, dù `removedAt` đã quá hạn',
    Number(sql(`select count(*) from "Game" where id = '${GAME_GIU}'`)) === 1
  );

  /* Hồ sơ pháp lý phải sống. Đây là phép kiểm quan trọng nhất của cả bộ. */
  const hoSo = sql(
    `select "gameId" is null, "gameTitle" from "TakedownRequest" where "claimantEmail" = '${CLAIMANT_EMAIL}'`
  );
  check(
    'Hồ sơ khiếu nại bản quyền SỐNG SÓT qua việc xoá game',
    hoSo.startsWith('t|') && hoSo.includes(suffix),
    hoSo || '(không còn hàng nào)'
  );

  /*
   * Vết kiểm duyệt của GAME thì đi theo game — cố ý, `onDelete: Cascade`. Xoá dữ
   * liệu mà giữ lại một danh sách "đã từng có game tên X của bé Y" là giữ lại đúng
   * thứ vừa hứa xoá. Vết nhắm vào TÀI KHOẢN trẻ (`childId`) nằm ở hàng khác và
   * không bị ảnh hưởng.
   */
  check(
    'Vết kiểm duyệt của game đi theo game (cascade, có chủ ý)',
    soVetTruoc > 0 &&
      Number(sql(`select count(*) from "ModerationLog" where "gameId" = '${GAME_GO}'`)) === 0,
    `trước ${soVetTruoc} dòng`
  );

  check(
    'Bản báo có nhắc chạy tiếp storage:prune',
    /storage:prune/.test(out),
    out.match(/storage:prune[^\n]*/)?.[0] ?? ''
  );
}

// ---------- Hàng đợi bản quyền vẫn xử được khi game đã biến mất ----------
/*
 * ĐÂY LÀ HỆ QUẢ TRỰC TIẾP của việc xoá hẳn, và nó dễ bị bỏ sót nhất.
 *
 * Yêu cầu gỡ vẫn OPEN trong lúc game bị xoá — nó không tự đóng. Nếu
 * `adminResolveTakedown` cứ giả định game còn tồn tại thì thao tác này nổ, và hàng
 * đó nằm mãi trong hàng đợi: tệ hơn, nó vẫn đếm vào hạn trả lời, nên khu quản trị
 * mọc ra một dòng ĐỎ vĩnh viễn không thao tác nào xoá được. Người trực sẽ học cách
 * bỏ qua màu đỏ — và đó là lúc hạn trả lời thật mất tác dụng.
 */
{
  await admin.goto(`${ADMIN}/admin`, { waitUntil: 'networkidle' });
  /*
   * Chọn hàng theo `suffix` của lượt chạy này, KHÔNG dùng `.first()`.
   *
   * Hàng đợi bản quyền cố ý không phân trang và không theo bộ lọc nào, nên nó chứa
   * cả hàng còn lại từ những lượt chạy trước (và từ những lượt ĐỔ giữa đường, vốn
   * không dọn được sau mình). `.first()` lấy hàng cũ nhất — bản đầu bài kiểm này đọc
   * ra một game của lượt trước và báo đỏ ba phép liền, trong khi code không sai gì.
   */
  const row = admin.locator('[data-testid=admin-takedown]').filter({ hasText: suffix });
  const chu = await row.innerText().catch(() => '');
  check(
    'Hàng đợi hiện yêu cầu của game đã xoá, bằng tên đã chụp',
    chu.includes(suffix) && /đã xoá hẳn khỏi hệ thống/.test(chu),
    chu.split('\n')[0] ?? ''
  );
  check(
    'Và KHÔNG render link tới game không còn tồn tại',
    (await row.locator(`a[href="/game/${GAME_GO}"]`).count()) === 0
  );

  await row.locator('[data-testid=takedown-accept]').click();
  await row.locator('textarea[name=note]').fill('Game đã bị xoá trước khi tới lượt xử lý.');
  await row.locator('[data-testid=takedown-accept-confirm]').click();
  await admin.waitForTimeout(3000);

  const hang = sql(
    `select status, "resolvedAt" is not null from "TakedownRequest" where "claimantEmail" = '${CLAIMANT_EMAIL}'`
  );
  check('Xử lý được yêu cầu của game đã xoá, không nổ', hang === 'ACCEPTED|t', hang);
  check(
    'Hàng của lượt này rời khỏi hàng đợi sau khi xử lý',
    (await admin.locator('[data-testid=admin-takedown]').filter({ hasText: suffix }).count()) === 0
  );
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
