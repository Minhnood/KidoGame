/**
 * Kiểm quyền xoá tài khoản gia đình — thứ `/dieu-khoan` hứa công khai.
 *
 * VÌ SAO CẦN MỘT BỘ RIÊNG. Đây là thao tác phá huỷ nhất hệ thống có, và là thao tác
 * DUY NHẤT không có cửa sổ sửa sai: gỡ game còn bảy ngày và một nút "Cho hiện lại"
 * nằm ngay cạnh, còn cái này thì hàng DB đi trong một transaction. Cả bốn hướng hỏng
 * của nó đều không kêu lên tiếng nào:
 *
 *  - XOÁ SÓT. `LoginAttempt` không có khoá ngoại, nên cascade không chạm tới nó và
 *    email cùng username ở lại nguyên dạng thô — trong đúng một bảng không ai nghĩ
 *    tới khi kiểm "đã xoá hết chưa". Nhìn từ ngoài thì tài khoản đã biến mất.
 *  - XOÁ QUÁ TAY. Hồ sơ yêu cầu gỡ bản quyền phải Ở LẠI (nghĩa vụ pháp lý), và dòng
 *    vết kiểm duyệt của chính việc xoá phải sống sót. Cả hai đều nằm sau một cascade
 *    dễ quét trúng.
 *  - XOÁ NHẦM NHÀ. Chốt "gõ lại email" mà chỉ nằm ở nút thì một request nặn tay đi
 *    thẳng vào server action là xoá được nhà bất kỳ.
 *  - KHÔNG XOÁ GÌ mà vẫn báo xong.
 *
 * Cần:
 *   - app server đang chạy, có redirect log mail
 *   - `psql` gọi được
 *   - một file .sb3 hợp lệ
 *
 * Chạy:
 *   SB3_FIXTURE=... MAIL_LOG=/tmp/kg-mail.log node infra/e2e-xoa-gia-dinh.mjs
 *
 * CHẠY SAU `e2e-takedown`, cùng lý do với `e2e-prune-removed`: bài này dựng một yêu
 * cầu gỡ bản quyền và tự dọn ở cuối, nhưng nếu nó đổ giữa đường thì hàng đó nằm lại
 * và `e2e-takedown` — vốn khẳng định hàng đợi có ĐÚNG một hàng — sẽ đỏ ở một phép
 * kiểm chẳng liên quan. Dọn bằng:
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
const MAIL_LOG = batBuocMailLog('e2e-xoa-gia-dinh');

const suffix = randomBytes(4).toString('hex');
const PASS = 'matkhau-dai-1234';
const CHILD_PASS = 'be1234';
const CLAIMANT_EMAIL = `nguoi-goc-xgd-${suffix}@vidu.test`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!FIXTURE) {
  console.error('Cần SB3_FIXTURE=<đường dẫn .sb3>.');
  process.exit(1);
}

const WEB = path.join(import.meta.dirname, '..', 'apps', 'web');
function dbUrl() {
  const raw =
    fs.readFileSync(path.join(WEB, '.env'), 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1] ?? '';
  return raw.split('?')[0];
}
const DB = dbUrl();
const sql = (q) => execFileSync('psql', [DB, '-q', '-t', '-A', '-c', q]).toString().trim();
const dem = (q) => Number(sql(q));
const nhayDon = (s) => s.replace(/'/g, "''");

/** Chạy script xoá. Trả về cả mã thoát lẫn đầu ra — cả hai đều là thứ phải kiểm. */
function chayXoa(args = []) {
  try {
    const out = execFileSync('pnpm', ['--filter', '@kidogame/web', 'db:xoa-gia-dinh', ...args], {
      cwd: path.join(import.meta.dirname, '..'),
      env: process.env,
    }).toString();
    return { ma: 0, out };
  } catch (e) {
    return { ma: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const browser = await chromium.launch({ channel: 'chrome' });
const bamLinkXacMinh = taoBoBamLink(MAIL_LOG, { appOrigin: APP });
const newSession = () => browser.newContext({ viewport: { width: 1300, height: 1000 } });

/**
 * Dựng một gia đình đầy đủ: phụ huynh đã xác minh, hai bé, `soGame` game của bé đầu.
 *
 * Bé thứ hai CỐ Ý không có game nào: cascade đi từ Parent qua Child rồi mới tới Game,
 * nên một gia đình mà mọi bé đều có game sẽ không phân biệt được "xoá bé" với "xoá
 * game của bé" nếu một trong hai nhánh hỏng.
 */
async function dungGiaDinh(ten, soGame) {
  const email = `e2e-xgd-${ten}-${suffix}@kidogame.test`;
  const user1 = `x${ten}a${suffix}`;
  const user2 = `x${ten}b${suffix}`;

  const p = await (await newSession()).newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', email);
  await p.fill('#password', PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  await bamLinkXacMinh(p);

  for (const [u, ten2] of [
    [user1, `Bé ${ten} một`],
    [user2, `Bé ${ten} hai`],
  ]) {
    await p.fill('#displayName', ten2);
    await p.fill('#username', u);
    await p.fill('#password', CHILD_PASS);
    await p.click('[data-testid=auth-form] button[type=submit]');
    await p.waitForTimeout(2000);
  }
  await p.close();

  const c = await (await newSession()).newPage();
  await c.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c.fill('#username', user1);
  await c.fill('#password', CHILD_PASS);
  await c.click('[data-testid=auth-form] button[type=submit]');
  await c.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});

  const games = [];
  for (let i = 0; i < soGame; i++) {
    await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
    await c.fill('#title', `Game xoá nhà ${ten} ${i} ${suffix}`);
    await c.setInputFiles('#file', FIXTURE);
    await c.click('[data-testid=upload-form] button[type=submit]');
    await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
    games.push(c.url().split('/game/')[1] ?? '');
  }
  await c.close();

  return { email, user1, user2, games };
}

const nhaA = await dungGiaDinh('a', 2);
const nhaB = await dungGiaDinh('b', 1);
/* Nhà thứ ba chỉ để làm MỤC TIÊU của phép kiểm "đổi lén email trong form". Phải là
   một nhà thường chứ không phải tài khoản quản trị: lõi `xoaGiaDinh` vốn đã từ chối
   mọi tài khoản admin, nên nhắm vào admin thì phép kiểm xanh nhờ một cái chốt KHÁC
   và không còn nói gì về cái chốt nó định kiểm. */
const nhaC = await dungGiaDinh('c', 0);

check(
  'Dựng được hai gia đình đủ bé và game',
  nhaA.games.length === 2 && nhaA.games.every(Boolean) && nhaB.games.every(Boolean),
  `${nhaA.email} · ${nhaB.email}`
);
if (!nhaA.games.every(Boolean) || !nhaB.games.every(Boolean)) {
  console.error('Không dựng được dữ liệu, dừng.');
  await browser.close();
  process.exit(1);
}

/*
 * Một lần đăng nhập SAI để bảng `LoginAttempt` có hàng cho gia đình này.
 *
 * Không có bước này thì phép kiểm "xoá cả dấu vết đăng nhập" xanh vĩnh viễn: nó đếm
 * 0 hàng trước khi xoá và 0 hàng sau khi xoá, và một cái chốt không bao giờ chạy thì
 * không phải là chốt.
 */
{
  const p = await (await newSession()).newPage();
  await p.goto(`${APP}/dang-nhap`, { waitUntil: 'networkidle' });
  await p.fill('#email', nhaA.email);
  await p.fill('#password', 'sai-mat-khau-roi');
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForTimeout(2000);
  await p.close();

  check(
    'Có hàng LoginAttempt mang email của nhà A (bảng không có khoá ngoại)',
    dem(`select count(*) from "LoginAttempt" where identity = 'parent:${nhaA.email.toLowerCase()}'`) === 1
  );
}

// ---------- Một yêu cầu gỡ bản quyền nhắm vào game của nhà A ----------
{
  const p = await (await newSession()).newPage();
  await p.goto(`${APP}/bao-cao-ban-quyen`, { waitUntil: 'networkidle' });
  await p.fill('#gameRef', nhaA.games[0]);
  await p.fill('#claimantName', 'Người Làm Bản Gốc');
  await p.fill('#claimantEmail', CLAIMANT_EMAIL);
  await p.fill('#evidence', 'Bản gốc của tôi, đăng từ 2019.');
  await p.locator('[data-testid=takedown-attest]').check();
  await p.click('[data-testid=takedown-form] button[type=submit]');
  await p.waitForSelector('[data-testid=takedown-done]', { timeout: 20000 }).catch(() => {});
  await p.close();
  check(
    'Có một hồ sơ khiếu nại bản quyền nhắm vào game của nhà A',
    dem(`select count(*) from "TakedownRequest" where "gameId" = '${nhaA.games[0]}'`) === 1
  );
}

const tenGameA0 = sql(`select title from "Game" where id = '${nhaA.games[0]}'`);
const shaA0 = sql(`select "sb3Sha256" from "Game" where id = '${nhaA.games[0]}'`);

// ---------- Chạy khô ----------
{
  const { ma, out } = chayXoa([nhaA.email]);
  check('Chạy khô thành công', ma === 0, `mã ${ma}`);
  check('Chạy khô đếm đúng 2 bé', /2 bé:/.test(out), out.match(/\d+ bé:/)?.[0] ?? '(không thấy)');
  check(
    'Chạy khô đếm đúng 2 game',
    /2 game, tổng/.test(out),
    out.match(/\d+ game, tổng[^\n]*/)?.[0] ?? '(không thấy)'
  );
  /*
   * Link tải file gốc là điểm chính của lần chạy khô, không phải trang trí: sau khi
   * xoá, file thành mồ côi và `storage:prune --xoa` dọn mất, nên đây là cửa sổ duy
   * nhất còn gửi cho phụ huynh bản gốc công của con họ được.
   */
  check(
    'Chạy khô in link tải .sb3 mang đúng hash của game nhà A',
    /^[0-9a-f]{64}$/.test(shaA0) && out.includes(shaA0),
    shaA0.slice(0, 12)
  );
  check(
    'Chạy khô KHÔNG xoá gì',
    dem(`select count(*) from "Parent" where email = '${nhaA.email}'`) === 1
  );
}

// ---------- Ba cái chốt của script ----------
{
  const { ma, out } = chayXoa([`khong-ton-tai-${suffix}@kidogame.test`]);
  check('Email không có trong hệ thống thì thoát khác 0', ma !== 0, `mã ${ma}`);
  check('… và nói rõ là không tìm thấy', /Không tìm thấy/i.test(out));
}
{
  const { ma } = chayXoa([nhaA.email, '--xoa']);
  check(
    'Thiếu --admin thì từ chối xoá',
    ma !== 0 && dem(`select count(*) from "Parent" where email = '${nhaA.email}'`) === 1,
    `mã ${ma}`
  );
}
{
  /* `--admin` trỏ vào một phụ huynh THƯỜNG: phải từ chối. Không chốt chỗ này thì dòng
     vết ghi tên một người không có quyền làm việc đó, tức bảng vết nói sai đúng câu
     hỏi nó tồn tại để trả lời. */
  const { ma } = chayXoa([nhaA.email, '--xoa', '--admin', nhaB.email]);
  check(
    '--admin trỏ vào tài khoản không phải quản trị thì từ chối',
    ma !== 0 && dem(`select count(*) from "Parent" where email = '${nhaA.email}'`) === 1,
    `mã ${ma}`
  );
}
{
  /*
   * Không xoá được tài khoản ĐANG có quyền quản trị.
   *
   * Dựng bằng cách nâng quyền cho nhà B rồi hạ xuống, KHÔNG thử trên tài khoản admin
   * thật: nếu chốt hỏng thì phép kiểm này xoá mất tài khoản quản trị của hệ thống, và
   * một bài kiểm không được phép là thứ nguy hiểm nhất chạy trong ngày.
   */
  sql(`update "Parent" set "isAdmin" = true where email = '${nhaB.email}'`);
  const { ma, out } = chayXoa([nhaB.email, '--xoa', '--admin', ADMIN_EMAIL]);
  check(
    'Không xoá được tài khoản đang có quyền quản trị',
    ma !== 0 && dem(`select count(*) from "Parent" where email = '${nhaB.email}'`) === 1,
    `mã ${ma}`
  );
  check('… và nói lý do là vết kiểm duyệt mất chỗ tra ra tên', /vết kiểm duyệt/i.test(out));
  check('Chạy khô cũng báo trước rằng --xoa sẽ bị từ chối', /`--xoa` sẽ bị từ chối/.test(chayXoa([nhaB.email]).out));
  sql(`update "Parent" set "isAdmin" = false where email = '${nhaB.email}'`);
}

// ---------- Xoá thật nhà A bằng script ----------
const vetTruoc = dem(`select count(*) from "ModerationLog" where action = 'ADMIN_DELETE_FAMILY'`);
/* Mốc để dọn: chỉ xoá vết do bài này tạo ra, xem phần Dọn ở cuối. */
const mocBatDau = new Date().toISOString();
{
  const { ma, out } = chayXoa([nhaA.email, '--xoa', '--admin', ADMIN_EMAIL, '--ghi-chu', 'Yêu cầu qua mail']);
  check('Xoá thật chạy xong không lỗi', ma === 0, `mã ${ma}`);
  check('… và báo đã xoá', /✓ Đã xoá/.test(out));

  /*
   * Thư xác nhận của ĐƯỜNG SCRIPT phải tìm trong stdout của chính script, KHÔNG tìm
   * trong MAIL_LOG.
   *
   * Ở dev, `sendMail` ghi lá thư bằng `console.log` của tiến trình đang chạy, và
   * `/tmp/kg-mail.log` chỉ là stdout của dev server. Script là một tiến trình khác,
   * nên thư nó gửi không bao giờ xuất hiện ở đó — đọc sai chỗ thì phép kiểm đỏ trong
   * khi thư vẫn gửi đúng, và cái đỏ ấy chỉ về phía lá thư chứ không về phía chỗ đọc.
   * Đường qua nút web thì ngược lại, và có phép kiểm riêng ở dưới.
   */
  check(
    'Script gửi thư xác nhận tới phụ huynh (thư đi qua stdout của script, không qua MAIL_LOG)',
    /┌─ MAIL/.test(out) && out.includes(nhaA.email) && /đã được xoá/i.test(out)
  );

  check(
    'Phụ huynh đi hẳn',
    dem(`select count(*) from "Parent" where email = '${nhaA.email}'`) === 0
  );
  check(
    'Cả hai bé đi theo (cascade)',
    dem(`select count(*) from "Child" where username in ('${nhaA.user1}', '${nhaA.user2}')`) === 0
  );
  check(
    'Hai game của bé đi theo',
    dem(`select count(*) from "Game" where id in ('${nhaA.games[0]}', '${nhaA.games[1]}')`) === 0
  );
  /*
   * Đây là hàng mà cascade KHÔNG chạm tới. Xoá tay bằng `delete from "Parent"` để lại
   * nguyên email và username ở dạng thô — tức việc xoá trông như đã xong trong khi
   * đúng thứ được yêu cầu xoá thì vẫn nằm đó.
   */
  check(
    'Dấu vết đăng nhập (LoginAttempt) cũng bị xoá — cascade không chạm tới bảng này',
    dem(`select count(*) from "LoginAttempt" where identity in ('parent:${nhaA.email.toLowerCase()}', 'child:${nhaA.user1}', 'child:${nhaA.user2}')`) === 0
  );
}

// ---------- Những thứ CỐ Ý ở lại ----------
{
  check(
    'Hồ sơ khiếu nại bản quyền Ở LẠI sau khi xoá cả nhà',
    dem(`select count(*) from "TakedownRequest" where "claimantEmail" = '${CLAIMANT_EMAIL}'`) === 1
  );
  check(
    '… với gameId về null chứ không bị cascade xoá',
    sql(`select "gameId" is null from "TakedownRequest" where "claimantEmail" = '${CLAIMANT_EMAIL}'`) === 't'
  );
  /* Không chụp tên thì hồ sơ còn lại chỉ nói "có người khiếu nại một game nào đó" —
     càng xoá đúng thì hồ sơ pháp lý càng vô dụng. */
  check(
    '… và mang đúng tên game đã chụp lại trước khi xoá',
    sql(`select "gameTitle" from "TakedownRequest" where "claimantEmail" = '${CLAIMANT_EMAIL}'`) ===
      tenGameA0,
    tenGameA0
  );
}
{
  const vet = sql(
    `select "gameId" is null and "childId" is null from "ModerationLog" where action = 'ADMIN_DELETE_FAMILY' order by "createdAt" desc limit 1`
  );
  check(
    'Có thêm một dòng vết kiểm duyệt cho việc xoá',
    dem(`select count(*) from "ModerationLog" where action = 'ADMIN_DELETE_FAMILY'`) === vetTruoc + 1
  );
  /*
   * Cả hai cột phải NULL. Trỏ vào bé hay game của nhà vừa xoá thì dòng vết bị cascade
   * cuốn đi ngay trong chính transaction ghi ra nó — việc phá huỷ lớn nhất hệ thống
   * làm được sẽ không để lại dấu nào, và không có gì báo lỗi.
   */
  check('… và dòng vết KHÔNG trỏ vào game hay bé vừa bị xoá', vet === 't', vet);
  check(
    '… note mang số liệu để đọc lại được sau khi mọi hàng đã đi',
    /2 bé, 2 game/.test(
      sql(
        `select note from "ModerationLog" where action = 'ADMIN_DELETE_FAMILY' order by "createdAt" desc limit 1`
      )
    )
  );
  /* KHÔNG ghi email vào vết: đây là một yêu cầu xoá dữ liệu, giữ lại chính cái định
     danh vừa được yêu cầu xoá trong một bảng không bao giờ dọn là làm hỏng việc mình
     vừa làm. */
  check(
    '… và KHÔNG giữ lại email trong vết',
    dem(
      `select count(*) from "ModerationLog" where action = 'ADMIN_DELETE_FAMILY' and note like '%${nhaA.email}%'`
    ) === 0
  );
}
{
  /*
   * File trên đĩa CỐ Ý còn nguyên. Storage địa chỉ hoá theo nội dung: hai game cùng
   * hash dùng chung một file, nên xoá file theo hash của game vừa xoá là xoá mất bản
   * gốc của game nhà khác, im lặng. Việc dọn thuộc về `storage:prune`, quét ngược từ DB.
   */
  const duong = path.join(WEB, '..', '..', 'storage', 'sb3', shaA0.slice(0, 2), `${shaA0}.sb3`);
  check(
    'File .sb3 trên đĩa KHÔNG bị xoá ở đây — đó là việc của storage:prune',
    fs.existsSync(duong),
    shaA0.slice(0, 12)
  );
}

// ---------- Nút trong khu quản trị, trên nhà B ----------
const adminCtx = await newSession();
const admin = await adminCtx.newPage();
{
  await admin.goto(`${ADMIN}/admin/dang-nhap`, { waitUntil: 'networkidle' });
  await admin.fill('#email', ADMIN_EMAIL);
  await admin.fill('#password', ADMIN_PASS);
  await admin.click('[data-testid=auth-form] button[type=submit]');
  await admin.waitForURL((u) => u.pathname === '/admin', { timeout: 20000 }).catch(() => {});

  const timNha = async (email) => {
    await admin.goto(`${ADMIN}/admin/tai-khoan?q=${encodeURIComponent(email)}`, {
      waitUntil: 'networkidle',
    });
    return admin.locator('[data-testid=tk-gia-dinh]').first();
  };

  const nha = await timNha(nhaB.email);
  check(
    'Tab Tài khoản có nút xoá tài khoản gia đình',
    (await nha.locator('[data-testid=admin-xoa-gia-dinh]').count()) === 1
  );

  /* Tài khoản quản trị KHÔNG được hiện nút. Lõi vẫn từ chối, nhưng để nút hiện rồi
     mới báo đỏ thì người trực đã gõ xong cả email trước khi biết là không được — và
     gõ xong email nghĩa là họ vừa quyết định xoá một gia đình. */
  const nhaAdmin = await timNha(ADMIN_EMAIL);
  check(
    'Tài khoản có quyền quản trị KHÔNG hiện nút xoá',
    (await nhaAdmin.locator('[data-testid=admin-xoa-gia-dinh]').count()) === 0
  );
  check(
    '… mà nói rõ phải gỡ quyền admin trước',
    /Gỡ quyền\s+admin trước/.test(await nhaAdmin.innerText())
  );

  const row = await timNha(nhaB.email);
  await row.locator('[data-testid=admin-xoa-gia-dinh]').click();
  const form = row.locator('[data-testid=admin-xoa-gia-dinh-form]');
  const nut = form.locator('[data-testid=admin-xoa-gia-dinh-confirm]');

  check('Mở ra thì nút xác nhận đang tắt', await nut.isDisabled());
  check(
    'Hộp xác nhận nói bằng SỐ chứ không nói "toàn bộ dữ liệu"',
    /2 tài khoản của bé và 1 game/.test(await form.innerText()),
    (await form.innerText()).split('\n')[0]
  );

  await form.locator('[data-testid=admin-xoa-gia-dinh-email]').fill('sai@kidogame.test');
  check('Gõ sai email thì nút vẫn tắt', await nut.isDisabled());

  await form.locator('[data-testid=admin-xoa-gia-dinh-email]').fill(nhaB.email.toUpperCase());
  check('Gõ đúng email (khác hoa thường) thì nút bật', await nut.isEnabled());

  /*
   * CHỐT PHẢI NẰM Ở SERVER, không chỉ ở nút.
   *
   * Đổi thẳng input hidden `email` sang một nhà khác rồi bấm gửi: đúng thứ một
   * request nặn tay làm được. Nếu server tin vào nút thì nhà C bị xoá bởi một người
   * chưa từng gõ địa chỉ của nó.
   */
  await form.locator('input[name=email]').evaluate((el, v) => {
    el.value = v;
  }, nhaC.email);
  await nut.click();
  await admin.waitForTimeout(2500);
  check(
    'Đổi lén email trong form thì server từ chối, không xoá nhà nào',
    dem(`select count(*) from "Parent" where email in ('${nhaB.email}', '${nhaC.email}')`) === 2
  );

  const row2 = await timNha(nhaB.email);
  await row2.locator('[data-testid=admin-xoa-gia-dinh]').click();
  const form2 = row2.locator('[data-testid=admin-xoa-gia-dinh-form]');
  await form2.locator('[data-testid=admin-xoa-gia-dinh-email]').fill(nhaB.email);
  await form2.locator('[data-testid=admin-xoa-gia-dinh-confirm]').click();
  await admin.waitForTimeout(3000);

  check(
    'Gõ đúng email rồi bấm thì gia đình bị xoá thật',
    dem(`select count(*) from "Parent" where email = '${nhaB.email}'`) === 0
  );
  check(
    '… kéo theo bé và game của nhà đó',
    dem(`select count(*) from "Child" where username in ('${nhaB.user1}', '${nhaB.user2}')`) === 0 &&
      dem(`select count(*) from "Game" where id = '${nhaB.games[0]}'`) === 0
  );
  check(
    '… và ghi thêm một dòng vết nữa',
    dem(`select count(*) from "ModerationLog" where action = 'ADMIN_DELETE_FAMILY'`) ===
      vetTruoc + 2
  );
  /* Đường qua nút chạy TRONG dev server, nên thư của nó vào đúng MAIL_LOG — ngược
     hẳn với đường script ở trên. Hai đường, hai chỗ đọc; gộp một chỗ là bỏ mất một
     trong hai. */
  check(
    'Xoá qua nút thì phụ huynh cũng nhận được thư xác nhận',
    await choMailToi(MAIL_LOG, nhaB.email, /đã được xoá/i),
    nhaB.email
  );

  await admin.goto(`${ADMIN}/admin/tai-khoan?q=${encodeURIComponent(nhaB.email)}`, {
    waitUntil: 'networkidle',
  });
  check(
    'Danh sách không còn gia đình đó nữa',
    (await admin.locator('[data-testid=tk-gia-dinh]').count()) === 0
  );

  /* Vết mới phải đọc được trên tab Tổng quan — đây là dòng vết DUY NHẤT không kèm
     game hay bé, nên nhãn của nó phải tự đứng một mình mà vẫn có nghĩa. */
  await admin.goto(`${ADMIN}/admin/tong-quan`, { waitUntil: 'networkidle' });
  check(
    'Tab Tổng quan đọc được dòng vết không kèm game lẫn bé',
    (await admin.innerText('body')).includes('Admin xoá tài khoản cả gia đình')
  );
}

// ---------- Dọn ----------
sql(`delete from "TakedownRequest" where "claimantEmail" = '${nhayDon(CLAIMANT_EMAIL)}'`);
sql(`delete from "Parent" where email = '${nhaC.email}'`);
sql(
  `delete from "LoginAttempt" where identity like 'child:x%${suffix}' or identity like '%${suffix}@kidogame.test'`
);
/*
 * Chỉ xoá đúng những dòng vết bài này vừa tạo, KHÔNG xoá theo `action`.
 *
 * `delete ... where action = 'ADMIN_DELETE_FAMILY'` trên máy dev thì vô hại, nhưng
 * đây là câu lệnh người ta copy sang chỗ khác — và ở nơi có việc xoá thật, nó xoá
 * đúng hồ sơ duy nhất chứng minh việc đã làm.
 */
sql(
  `delete from "ModerationLog" where action = 'ADMIN_DELETE_FAMILY' and "createdAt" >= '${mocBatDau}'`
);

await browser.close();

const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
