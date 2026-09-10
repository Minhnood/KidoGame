/**
 * Kiểm thư nhắc việc có hạn — bước 1/3 của service `prune`.
 *
 * VÌ SAO CẦN MỘT BỘ RIÊNG. Hạn trả lời yêu cầu gỡ bản quyền được hứa CÔNG KHAI ở hai
 * trang, và cả ba hướng hỏng của cơ chế nhắc đều im lặng:
 *
 *  - KHÔNG GỬI GÌ CẢ. Hàng đợi vẫn sạch, bảng vẫn đúng, log vẫn xanh — chỉ là không
 *    ai được nhắc, và "3 ngày làm việc" thành một câu trên trang điều khoản.
 *  - GỬI MỖI ĐÊM DÙ KHÔNG CÓ VIỆC. Hai tuần sau thì lá thư ấy là thứ người ta lọc đi,
 *    kể cả cái đêm nó khác mọi đêm.
 *  - ĐẾM LỆCH VỚI TAB TỔNG QUAN. Bảng nói không có việc gấp, thư nói có ba; người
 *    trực tin cái tiện hơn. Đây là lý do `lib/viec-co-han.ts` tồn tại, và phép kiểm
 *    quan trọng nhất trong bộ này so hai con số đó với nhau.
 *
 * Mốc thời gian tính bằng CHÍNH `slaDueAt` của app, không tự dựng lại lịch ngày làm
 * việc ở đây: một bài kiểm tự tính hạn theo cách riêng là bài kiểm đo cái khác, và nó
 * sẽ đỏ hoặc xanh tuỳ hôm nay là thứ mấy.
 *
 * Cần: app server đang chạy, `psql` gọi được, một file .sb3 hợp lệ.
 *
 * Chạy:
 *   SB3_FIXTURE=... MAIL_LOG=/tmp/kg-mail.log node infra/e2e-nhac-viec.mjs
 *
 * CHẠY SAU `e2e-takedown` như hai bộ kia — nó dựng một yêu cầu gỡ bản quyền và tự dọn.
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { batBuocMailLog, taoBoBamLink } from './e2e-mail.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const ADMIN = process.env.ADMIN_ORIGIN ?? 'http://admin.localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'demo@kidogame.local';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'demo1234ab';
const FIXTURE = process.env.SB3_FIXTURE ?? '';
const MAIL_LOG = batBuocMailLog('e2e-nhac-viec');

const suffix = randomBytes(4).toString('hex');
const PASS = 'matkhau-dai-1234';
const CHILD_PASS = 'be1234';
const PARENT_EMAIL = `e2e-nv-${suffix}@kidogame.test`;
const CHILD_USER = `env${suffix}`;
/*
 * Địa chỉ đơn vị vận hành cho nhánh "đã cấu hình". Trước đây là `@vidu.test`, chọn
 * `.test` vì thư gửi tới đó bảo đảm không tới ai. Không dùng được nữa:
 * `isOperatorConfigured()` giờ coi `.test` là địa chỉ chết, nên script sẽ TỪ CHỐI gửi
 * và nhánh này lại đo nhầm nhánh kia.
 *
 * Lớp chặn gửi thật chuyển sang chỗ chắc hơn hẳn: khối "có cấu hình" bên dưới xoá
 * rỗng cả bốn biến transport trước khi chạy, nên không có đường gửi nào tồn tại —
 * mạnh hơn việc trông vào một địa chỉ bị trả về sau khi thư đã rời máy.
 */
const OPERATOR_EMAIL = `van-hanh-${suffix}@vidu.vn`;

/** Xoá mọi đường gửi thật khỏi tiến trình con. Xem ghi chú ở OPERATOR_EMAIL. */
const KHONG_CO_TRANSPORT = { SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', RESEND_API_KEY: '' };

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
function dbUrl() {
  const raw =
    fs.readFileSync(path.join(WEB, '.env'), 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1] ?? '';
  return raw.split('?')[0];
}
const DB = dbUrl();
const sql = (q) => execFileSync('psql', [DB, '-q', '-t', '-A', '-c', q]).toString().trim();
const dem = (q) => Number(sql(q));

/** Chạy script nhắc. Trả về mã thoát và đầu ra — cả hai đều là thứ phải kiểm. */
function chayNhac(args = [], env = {}) {
  try {
    const out = execFileSync(
      'pnpm',
      ['--filter', '@kidogame/web', 'db:nhac-viec-co-han', ...args],
      { cwd: ROOT, env: { ...process.env, ...env } }
    ).toString();
    return { ma: 0, out };
  } catch (e) {
    return { ma: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/*
 * Ba mốc `createdAt`, tính bằng chính `slaDueAt` của app.
 *
 * `sapToiHan` phải DÒ, không tính thẳng được: hạn cộng theo ngày làm việc nên khoảng
 * thời gian cần lùi lại thay đổi theo hôm nay là thứ mấy. Dò từng giờ và lấy mốc đầu
 * tiên mà hạn của nó rơi vào khoảng (bây giờ, ngưỡng nhắc] — đúng định nghĩa nhóm ấy
 * trong `viec-co-han.ts`, đọc từ cùng một hàm.
 */
const mocs = JSON.parse(
  execFileSync(
    'pnpm',
    [
      '--filter',
      '@kidogame/web',
      'exec',
      'tsx',
      '-e',
      `
      import { slaDueAt } from './src/lib/operator';
      import { NHAC_TRUOC_NGAY_LAM_VIEC } from './src/lib/viec-co-han';
      const now = new Date();
      const nguong = slaDueAt(now, NHAC_TRUOC_NGAY_LAM_VIEC);
      let sap = null;
      for (let gio = 1; gio <= 24 * 21; gio++) {
        const t = new Date(now.getTime() - gio * 3600_000);
        const han = slaDueAt(t);
        if (han >= now && han <= nguong) { sap = t; break; }
      }
      console.log(JSON.stringify({
        quaHan: new Date(now.getTime() - 14 * 86400_000).toISOString(),
        sapToiHan: sap ? sap.toISOString() : null,
        conHan: now.toISOString(),
      }));
      `,
    ],
    { cwd: WEB }
  )
    .toString()
    .trim()
    .split('\n')
    .pop()
);

check(
  'Tính được ba mốc thời gian từ chính slaDueAt của app',
  Boolean(mocs.quaHan && mocs.sapToiHan && mocs.conHan),
  `sắp tới hạn: ${mocs.sapToiHan}`
);

/*
 * Còn bao nhiêu việc có hạn, HỎI ĐÚNG HÀM MÀ APP HỎI.
 *
 * Trước đây dòng này là `select count(*) from "TakedownRequest" where status = 'OPEN'`,
 * và nó SAI theo đúng cái kiểu đắt nhất: sai lặng lẽ, xanh từ ngày viết cho tới ngày
 * dữ liệu dev trôi qua một ranh giới.
 *
 * "Việc có hạn" có BỐN nguồn — gỡ quá hạn, gỡ sắp tới hạn, game sắp bị xoá hẳn, game
 * đã quá hạn giữ — còn phép đếm kia chỉ nhìn MỘT. Ngày 10/9/2026 nó đỏ lần đầu và tố
 * rằng bước nhắc "gửi thư khi không có việc gì", tức tố hỏng đúng cái quyết định
 * "im lặng là tín hiệu" mà khối này sinh ra để bảo vệ. Sự thật: hàng đợi bản quyền
 * rỗng THẬT (OPEN = 0), nhưng DB có hai game gỡ ngày 4/9 và tới 10/9 thì chúng bước
 * vào cửa sổ `SAP_XOA_NGAY`. Script làm đúng nghĩa vụ; phép kiểm dựng sai vai.
 *
 * Đây là lần thứ tư cùng một bài học trong repo này (xem `e2e-an-vs-xoa`,
 * `e2e-bieu-do`, và nhóm `@vidu.test`): một phép kiểm chỉ mạnh bằng vai mà nó dựng,
 * và hai chỗ tự trả lời cùng một câu hỏi là hai câu trả lời khác nhau.
 *
 * KHÔNG tính lại cửa sổ bằng SQL với số 5 gõ tay: `NGAY_GIU_GAME_DA_GO` đọc từ
 * `REMOVED_KEEP_DAYS`, tức người vận hành đổi được. Gõ cứng ở đây là dựng lại đúng cái
 * lệch mà `viec-co-han.ts` đã cẩn thận tránh. Khối `mocs` ngay trên đã dùng cách này
 * rồi — hỏi app, đừng đoán.
 */
const soViecCoHan = Number(
  execFileSync(
    'pnpm',
    [
      '--filter',
      '@kidogame/web',
      'exec',
      'tsx',
      '-e',
      `
      import { docViecCoHan } from './src/lib/viec-co-han';
      docViecCoHan().then((v) => {
        console.log(
          v.goQuaHan.length + v.goSapToiHan.length + v.gameSapXoa.length + v.gameQuaHanXoa.length
        );
        process.exit(0);
      });
      `,
    ],
    { cwd: WEB }
  )
    .toString()
    .trim()
    .split('\n')
    .pop()
);

// ---------- Hàng đợi rỗng: KHÔNG được gửi gì ----------
{
  const { ma, out } = chayNhac();
  check('Chạy được khi hàng đợi rỗng', ma === 0, `mã ${ma}`);
  if (soViecCoHan === 0) {
    /*
     * Đây là phép kiểm cho quyết định "im lặng là tín hiệu". Hỏng theo hướng ngược —
     * gửi một lá thư "0 việc" mỗi đêm — không làm đỏ bất cứ thứ gì khác trong repo,
     * nó chỉ dạy người nhận bỏ qua đúng lá thư quan trọng nhất họ nhận được.
     */
    check('Không có việc có hạn thì KHÔNG gửi thư', /KHÔNG gửi thư/.test(out));
    check('… và không soạn thư nào cả', !/┌─ MAIL/.test(out));
  } else {
    // BỎ QUA, không tính là đạt bằng cách giả vờ — và nói ra CON SỐ, vì "bỏ qua" mà
    // không kèm số thì lần sau không ai biết nó bỏ qua vì lý do chính đáng hay vì
    // chốt đã hỏng và luôn rơi vào nhánh này.
    check(
      'Không có việc có hạn thì KHÔNG gửi thư',
      true,
      `BỎ QUA: DB đang có ${soViecCoHan} việc có hạn thật`
    );
    check('… và không soạn thư nào cả', true, `BỎ QUA: cùng lý do`);
  }
}

const browser = await chromium.launch({ channel: 'chrome' });
const bamLinkXacMinh = taoBoBamLink(MAIL_LOG, { appOrigin: APP });
const newSession = () => browser.newContext({ viewport: { width: 1300, height: 1000 } });

// ---------- Dựng: phụ huynh -> bé -> ba game -> ba yêu cầu gỡ ----------
const games = [];
{
  const p = await (await newSession()).newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  check('Xác minh được email phụ huynh', await bamLinkXacMinh(p));

  await p.fill('#displayName', 'Bé Nhắc Việc');
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', CHILD_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForTimeout(2000);
  await p.close();

  const c = await (await newSession()).newPage();
  await c.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c.fill('#username', CHILD_USER);
  await c.fill('#password', CHILD_PASS);
  await c.click('[data-testid=auth-form] button[type=submit]');
  await c.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});

  for (const nhan of ['qua-han', 'sap-toi-han', 'con-han']) {
    await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
    await c.fill('#title', `Game nhắc việc ${nhan} ${suffix}`);
    await c.setInputFiles('#file', FIXTURE);
    await c.click('[data-testid=upload-form] button[type=submit]');
    await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
    games.push(c.url().split('/game/')[1] ?? '');
  }
  await c.close();
  check('Dựng được ba game', games.length === 3 && games.every(Boolean));
}

if (!games.every(Boolean)) {
  console.error('Không đăng được game, dừng.');
  await browser.close();
  process.exit(1);
}

const nhomTheoGame = { [games[0]]: 'quaHan', [games[1]]: 'sapToiHan', [games[2]]: 'conHan' };
{
  for (const [i, gameId] of games.entries()) {
    const p = await (await newSession()).newPage();
    await p.goto(`${APP}/bao-cao-ban-quyen`, { waitUntil: 'networkidle' });
    await p.fill('#gameRef', gameId);
    await p.fill('#claimantName', 'Người Làm Bản Gốc');
    await p.fill('#claimantEmail', `nguoi-goc-nv${i}-${suffix}@vidu.test`);
    await p.fill('#evidence', 'Bản gốc của tôi, đăng từ 2019.');
    await p.locator('[data-testid=takedown-attest]').check();
    await p.click('[data-testid=takedown-form] button[type=submit]');
    await p.waitForSelector('[data-testid=takedown-done]', { timeout: 20000 }).catch(() => {});
    await p.close();
  }
  check(
    'Ba yêu cầu gỡ đang mở',
    dem(`select count(*) from "TakedownRequest" where "gameId" in ('${games.join("','")}')`) === 3
  );

  /* Kéo `createdAt` về quá khứ: không có cách nào khác để kiểm một cái hạn mà không
     chờ thật ba ngày làm việc. Cùng cách `e2e-prune-removed` kéo `removedAt`. */
  for (const [gameId, nhom] of Object.entries(nhomTheoGame)) {
    sql(
      `update "TakedownRequest" set "createdAt" = '${mocs[nhom]}' where "gameId" = '${gameId}'`
    );
  }
}

// ---------- Ba nhóm phải RỜI NHAU và cộng lại bằng hàng đợi ----------
let dauRa = '';
{
  const { ma, out } = chayNhac();
  dauRa = out;
  check('Chạy được khi có việc', ma === 0, `mã ${ma}`);

  const m = out.match(/đang mở: (\d+) \(quá hạn (\d+), sắp tới hạn (\d+), còn hạn (\d+)\)/);
  check('In ra được bốn con số của hàng đợi', Boolean(m), m?.[0] ?? '(không khớp)');
  if (m) {
    const [, tong, qh, st, ch] = m.map(Number);
    /*
     * Phép cộng, cùng khuôn với bộ lọc trạng thái ở `e2e-moderation`. Nó bắt đúng
     * cách hỏng mà đọc từng nhóm riêng sẽ không thấy: một yêu cầu rơi vào hai nhóm
     * (đếm hai lần trong một lá thư) hoặc rơi ra ngoài cả ba (im lặng biến mất).
     */
    check('Ba nhóm cộng lại đúng bằng hàng đợi đang mở', qh + st + ch === tong, `${qh}+${st}+${ch} = ${tong}`);
    check('Nhóm quá hạn có ít nhất yêu cầu vừa kéo về 14 ngày trước', qh >= 1, `${qh}`);
    check('Nhóm sắp tới hạn có ít nhất một', st >= 1, `${st}`);
    check('Nhóm còn hạn có ít nhất yêu cầu vừa gửi', ch >= 1, `${ch}`);
  }

  check(
    'Chủ đề thư nói ngay số việc quá hạn, đọc được mà không mở thư',
    /\[KidoGame\] \d+ yêu cầu gỡ QUÁ HẠN/.test(out),
    out.match(/\[KidoGame\][^\n]*/)?.[0] ?? '(không thấy)'
  );
  check(
    'Thư nêu tên game của yêu cầu quá hạn',
    out.includes(`Game nhắc việc qua-han ${suffix}`)
  );
  check(
    'Thư nêu email người khiếu nại để trả lời được ngay',
    out.includes(`nguoi-goc-nv0-${suffix}@vidu.test`)
  );
  check('Thư nói rõ hạn là mấy ngày làm việc', /\d+ ngày làm việc/.test(out));
  check('Thư có link tới bảng tổng quan', /\/admin\/tong-quan/.test(out));
  check('Chế độ mặc định KHÔNG gửi, chỉ in', /chưa gửi gì/.test(out) && !/✓ Đã gửi/.test(out));
}

// ---------- Chưa cấu hình đơn vị vận hành thì TỪ CHỐI gửi ----------
{
  const { ma, out } = chayNhac(['--gui'], { OPERATOR_NAME: '', OPERATOR_EMAIL: '' });
  check('Chưa khai OPERATOR_* thì từ chối gửi', ma !== 0, `mã ${ma}`);
  check('… và nói rõ mặc định là địa chỉ .local', /chua-cau-hinh@kidogame\.local/.test(out));
  /*
   * Chốt phải đứng SAU phần in: chưa cấu hình thì vẫn phải đọc được danh sách việc
   * đang chờ trong log. Chặn cái không làm được (gửi) chứ không chặn cái làm được.
   */
  check(
    '… nhưng VẪN in danh sách việc ra log trước khi từ chối',
    out.includes(`Game nhắc việc qua-han ${suffix}`)
  );
}

// ---------- Khai một địa chỉ KHÔNG NHẬN ĐƯỢC THƯ thì cũng từ chối ----------
{
  /*
   * Nhánh thứ ba, thêm sau khi phát hiện `isOperatorConfigured()` chỉ hỏi "hai biến
   * có rỗng không". Một địa chỉ dưới TLD dành riêng (`.local`, `.test`, `.invalid`…)
   * KHÔNG BAO GIỜ nhận được thư, nên gửi vào đó là gửi vào hư không — nhưng script
   * lại in `✓ Đã gửi tới …`, một dòng báo thành công cho việc không xảy ra, mỗi đêm.
   * Nguy hơn nhánh "chưa khai" đúng ở chỗ đó: chưa khai thì có người thấy, còn khai
   * sai kiểu này thì mọi dấu hiệu đều nói là ổn.
   */
  const { ma, out } = chayNhac(['--gui'], {
    OPERATOR_NAME: 'Đơn vị kiểm thử',
    OPERATOR_EMAIL: `van-hanh-${suffix}@vidu.local`,
  });
  check('Địa chỉ dưới TLD chết thì từ chối gửi', ma !== 0, `mã ${ma}`);
  check('… và nói rõ địa chỉ nào đang sai', out.includes(`van-hanh-${suffix}@vidu.local`));
  check('… KHÔNG in dòng báo đã gửi', !/✓ Đã gửi/.test(out));
}

// ---------- Có cấu hình thì gửi thật ----------
{
  const { ma, out } = chayNhac(['--gui'], {
    ...KHONG_CO_TRANSPORT,
    OPERATOR_NAME: 'Đơn vị kiểm thử',
    OPERATOR_EMAIL: OPERATOR_EMAIL,
  });
  check('Khai OPERATOR_* thì gửi được', ma === 0 && /✓ Đã gửi/.test(out), `mã ${ma}`);
  /* Thư của script đi qua stdout của CHÍNH script, không qua MAIL_LOG — MAIL_LOG chỉ
     là stdout của dev server. Cùng bẫy đã trả giá ở `e2e-xoa-gia-dinh`. */
  check('Thư gửi tới đúng địa chỉ đơn vị vận hành', out.includes(`tới ${OPERATOR_EMAIL}`));
  check('Lá thư có ra log của script', /┌─ MAIL/.test(out));
}

// ---------- Con số của thư PHẢI khớp tab Tổng quan ----------
{
  const admin = await (await newSession()).newPage();
  await admin.goto(`${ADMIN}/admin/dang-nhap`, { waitUntil: 'networkidle' });
  await admin.fill('#email', ADMIN_EMAIL);
  await admin.fill('#password', ADMIN_PASS);
  await admin.click('[data-testid=auth-form] button[type=submit]');
  await admin.waitForURL((u) => u.pathname === '/admin', { timeout: 20000 }).catch(() => {});
  await admin.goto(`${ADMIN}/admin/tong-quan`, { waitUntil: 'networkidle' });

  const chu = await admin.innerText('body');
  const soTrongThu = Number(dauRa.match(/quá hạn (\d+),/)?.[1] ?? -1);

  /*
   * PHÉP KIỂM QUAN TRỌNG NHẤT CỦA BỘ NÀY, và là lý do `lib/viec-co-han.ts` tồn tại.
   *
   * Trước khi tách, trang này tự tính `goQuaHan` bằng một dòng filter riêng. Hai chỗ
   * tự tính cùng một cái hạn là hai câu trả lời, và cách hỏng của nó không đỏ ở đâu
   * cả: bảng nói không có việc gấp, thư nói có ba, cả hai đều tự tin.
   */
  check(
    'Tab Tổng quan hiện đúng con số mà thư nhắc đếm được',
    soTrongThu >= 1 &&
      new RegExp(`${soTrongThu} yêu cầu gỡ bản quyền đã quá hạn`).test(chu),
    `thư: ${soTrongThu}`
  );
  check(
    'Bảng không còn nói "không có việc gấp" khi thư nói có việc',
    !/Không có việc gấp/.test(chu)
  );
}

// ---------- Dọn ----------
sql(`delete from "TakedownRequest" where "claimantEmail" like '%-${suffix}@vidu.test'`);
sql(`delete from "Parent" where email = '${PARENT_EMAIL}'`);
sql(`delete from "LoginAttempt" where identity like '%${suffix}%'`);

/* Hàng đợi phải trở lại rỗng, không thì `e2e-takedown` ở lượt sau đỏ ở một phép kiểm
   chẳng liên quan — cùng lý do đã ghi trong `e2e-prune-removed`. */
check(
  'Dọn sạch: ba yêu cầu vừa dựng không còn trong hàng đợi',
  dem(`select count(*) from "TakedownRequest" where "claimantEmail" like '%-${suffix}@vidu.test'`) === 0
);

await browser.close();

const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
