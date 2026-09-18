/**
 * Phễu đăng game gửi sang Mixpanel — và canh rằng KHÔNG có gì của bé đi theo.
 *
 * VÌ SAO BỘ NÀY TỒN TẠI. Đây là lần đầu dữ liệu của KidoGame rời khỏi máy chủ của mình,
 * sang một công ty khác. Mọi thứ khác trong dự án hỏng thì sửa được; thứ này hỏng thì
 * tên đăng nhập hay tên game của một đứa trẻ đã nằm trong dashboard của người ta rồi,
 * và không có nút hoàn lại. Nên bộ kiểm đọc TỪNG BYTE thật sự được gửi đi.
 *
 * Nó dựng một máy chủ giả đứng vào chỗ Mixpanel, ghi lại mọi request, rồi cho một bé
 * thật đi trọn đường đăng game bằng trình duyệt thật.
 *
 * CẦN dev server chạy KÈM ba biến (giống cách `e2e-glitchtip` cần `GLITCHTIP_DSN`):
 *
 *   MIXPANEL_TOKEN=token-thu MIXPANEL_ID_SALT=<≥16 ký tự> MIXPANEL_API=http://127.0.0.1:3998 \
 *     pnpm --filter @kidogame/web dev > /tmp/kg-mail.log 2>&1 &
 *   SB3_FIXTURE=... MAIL_LOG=/tmp/kg-mail.log node infra/e2e-mixpanel.mjs
 *
 * Thiếu biến thì máy chủ không gửi gì — đúng như production trước khi fen bật — và bộ
 * này ĐỎ kèm câu nhắc, chứ không xanh suông.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { batBuocMailLog, taoBoBamLink } from './e2e-mail.mjs';
import { dungSb3 } from './e2e-zip.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const CONG_GIA = Number(process.env.MIXPANEL_STUB_PORT ?? 3998);
const TOKEN_CHO = process.env.MIXPANEL_TOKEN ?? 'token-thu';
const MAIL_LOG = batBuocMailLog('e2e-mixpanel');

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-mp-${suffix}@kidogame.test`;
const PASS = 'matkhau-dai-1234';
const CHILD1 = `emp1${suffix}`;
const CHILD2 = `emp2${suffix}`;
const CHILD_PASS = 'be1234';
/* Tên bé và tên game KHÔNG được chứa chữ "mixpanel": phép kiểm cuối đọc cả trang
   /upload để chắc không chỗ nào nhắc tới dịch vụ này, mà trang đó in tên bé ra ("Game
   sẽ hiện tên …"). Đặt tên bé là "Bé Mixpanel Một" thì phép ấy đỏ oan — đã vấp. */
const TEN_GAME = `Game phieu ${suffix}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const ROOT = path.join(import.meta.dirname, '..');
const DB = (
  fs.readFileSync(path.join(ROOT, 'apps', 'web', '.env'), 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1] ?? ''
).split('?')[0];
const sql = (q) => execFileSync('psql', [DB, '-q', '-t', '-A', '-c', q]).toString().trim();
const dem = (q) => Number(sql(q));

/* ── Máy chủ giả đứng vào chỗ Mixpanel ───────────────────────────────────────
 * Ghi lại nguyên văn thân request. `che` bật lên thì trả 500 để kiểm rằng Mixpanel
 * hỏng KHÔNG làm bé đăng game hỏng theo. */
const nhan = [];
let treo = false;
let hong = false;
const stub = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    nhan.push({ url: req.url, raw, headers: req.headers, luc: Date.now() });
    if (treo) return; // không trả lời: đo cái timeout
    if (hong) {
      res.writeHead(500).end('0');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('1');
  });
});
await new Promise((ok) => stub.listen(CONG_GIA, '127.0.0.1', ok));

/** Mọi sự kiện đã nhận, đã tách khỏi JSON. */
const suKien = () =>
  nhan.flatMap((r) => {
    try {
      return JSON.parse(r.raw);
    } catch {
      return [];
    }
  });
const ten = () => suKien().map((e) => e.event);
/** Chờ tới khi đủ số sự kiện, hoặc hết giờ. Sự kiện gửi kiểu bắn-rồi-quên. */
async function cho(soLuong, giay = 10) {
  for (let i = 0; i < giay * 20; i++) {
    if (suKien().length >= soLuong) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

const FIXTURE_GOC = process.env.SB3_FIXTURE ?? '';
if (!FIXTURE_GOC) {
  console.error('Cần SB3_FIXTURE=<đường dẫn .sb3>.');
  process.exit(1);
}
/* Bản sao ở thư mục tạm — xem `ERR_UPLOAD_FILE_CHANGED` ở `e2e-xem-thu`. */
const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-mp-'));
const FIXTURE = path.join(thuMuc, 'game.sb3');
fs.copyFileSync(FIXTURE_GOC, FIXTURE);
const FIXTURE_2 = dungSb3(path.join(thuMuc, 'be2.sb3'), ['#ffffff'], [`#${suffix.slice(0, 6)}`]);

const browser = await chromium.launch({ channel: 'chrome' });
const bamLinkXacMinh = taoBoBamLink(MAIL_LOG, { appOrigin: APP });
const moi = () => browser.newContext({ viewport: { width: 1100, height: 1000 } });

/**
 * Đăng nhập bé rồi đăng một game qua giao diện thật.
 *
 * Trả về cả SỐ MILI GIÂY từ lúc bấm "Đăng game" tới lúc sang trang game. Con số này mới
 * là thứ bắt được lỗi `await` nhầm: một bản gửi sự kiện bị `await` vẫn đăng game thành
 * công, chỉ là bé phải đứng chờ Mixpanel — đo được 6s thay vì 3s ở lượt thử cho đỏ, mà
 * phép kiểm cũ (chỉ hỏi "có đăng được không") vẫn xanh.
 */
async function beDangGame(username, file, tenGame) {
  const ctx = await moi();
  const c = await ctx.newPage();
  await c.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c.fill('#username', username);
  await c.fill('#password', CHILD_PASS);
  await c.click('[data-testid=auth-form] button[type=submit]');
  await c.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});
  await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await c.fill('#title', tenGame);
  await c.setInputFiles('#file', file);
  const bam = Date.now();
  await c.click('[data-testid=upload-form] button[type=submit]');
  await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
  const msDang = Date.now() - bam;
  const url = c.url();
  await ctx.close();
  return { url, msDang };
}

// ---------- Dựng: phụ huynh -> hai bé ----------
{
  const ctx = await moi();
  const p = await ctx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  check('Xác minh được email phụ huynh', await bamLinkXacMinh(p));
  for (const [u, ten] of [
    [CHILD1, 'Bé Phễu Một'],
    [CHILD2, 'Bé Phễu Hai'],
  ]) {
    await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
    await p.fill('#displayName', ten);
    await p.fill('#username', u);
    await p.fill('#password', CHILD_PASS);
    await p.click('[data-testid=auth-form] button[type=submit]');
    await p.waitForTimeout(1500);
  }
  check(
    'Dựng được hai bé',
    dem(`select count(*) from "Child" where username in ('${CHILD1}','${CHILD2}')`) === 2
  );
  await ctx.close();
}

// ---------- 1. Bé đăng một game: đủ bốn bước của phễu, đúng thứ tự ----------
const luotThuong = await beDangGame(CHILD1, FIXTURE, TEN_GAME);
const urlGame = luotThuong.url;
await cho(4);
{
  check('Bé đăng được game (phễu đo trên một luồng THẬT)', /\/game\//.test(urlGame), urlGame);
  const t = ten();
  check(
    'Đủ bốn bước: chọn file → xem thử xong → bấm Đăng → đăng xong',
    JSON.stringify(t.slice(0, 4)) === JSON.stringify(['chon-file', 'xem-thu-xong', 'bam-dang', 'dang-xong']),
    t.join(' → ') || 'KHÔNG NHẬN ĐƯỢC SỰ KIỆN NÀO — dev server có chạy kèm MIXPANEL_TOKEN/ID_SALT/API không?'
  );
  check('Mọi request đi đúng đường /track', nhan.every((r) => r.url === '/track'), [...new Set(nhan.map((r) => r.url))].join(' '));
}

// ---------- 2. KHÔNG một mẩu nào của bé lọt sang ----------
{
  const tatCa = nhan.map((r) => r.raw).join('\n');
  const idThat = sql(`select id from "Child" where username = '${CHILD1}'`);
  const camKy = [
    ['tên đăng nhập của bé', CHILD1],
    ['email phụ huynh', PARENT_EMAIL],
    ['tên game', TEN_GAME],
    ['id thật của bé trong DB', idThat],
    ['tên hiển thị của bé', 'Phễu Một'],
  ];
  const lot = camKy.filter(([, v]) => v && tatCa.includes(v)).map(([nhan]) => nhan);
  check('KHÔNG có tên bé, email, tên game hay id thật trong thứ gửi đi', lot.length === 0, lot.join(', ') || `${nhan.length} request sạch`);

  const props = suKien().map((e) => e.properties ?? {});
  const CHO_PHEP = new Set(['token', 'distinct_id', 'time', '$insert_id', '$ip', 'nhom_dung_luong', 'so_bia', 'bia_tu_tai', 'ma_loi', 'mili_giay']);
  const la = [...new Set(props.flatMap((p) => Object.keys(p)))].filter((k) => !CHO_PHEP.has(k));
  check('Chỉ những thuộc tính đã khai được gửi, không có gì lạ', la.length === 0, la.join(', ') || [...new Set(props.flatMap((p) => Object.keys(p)))].join(', '));
  check('Tắt định vị theo IP ($ip = 0)', props.every((p) => p.$ip === '0'), String(props[0]?.$ip));
  check('Mỗi sự kiện có $insert_id riêng (Mixpanel gộp trùng theo nó)', new Set(props.map((p) => p.$insert_id)).size === props.length);
  check('`time` tính bằng GIÂY, không phải mili giây', props.every((p) => String(p.time).length === 10), String(props[0]?.time));
  check('Gửi đúng token của project', props.every((p) => p.token === TOKEN_CHO), String(props[0]?.token).slice(0, 6) + '…');
}

// ---------- 3. Định danh: giả danh, ổn định theo bé, khác nhau giữa hai bé ----------
{
  const idBe1 = [...new Set(suKien().map((e) => e.properties?.distinct_id))];
  check('Cùng một bé thì mọi bước dùng CHUNG một định danh', idBe1.length === 1, idBe1.join(' '));
  check('Định danh là 32 ký tự hex (HMAC), không phải id của DB', /^[0-9a-f]{32}$/.test(idBe1[0] ?? ''), idBe1[0] ?? '');

  const truoc = suKien().length;
  await beDangGame(CHILD2, FIXTURE_2, `Game phieu hai ${suffix}`);
  await cho(truoc + 4);
  const idBe2 = [...new Set(suKien().slice(truoc).map((e) => e.properties?.distinct_id))];
  check('Bé khác ra định danh khác', idBe2.length === 1 && idBe2[0] !== idBe1[0], `${idBe1[0]?.slice(0, 8)}… vs ${idBe2[0]?.slice(0, 8)}…`);
}

// ---------- 4. Mixpanel hỏng thì bé vẫn đăng được game ----------
{
  const truoc = nhan.length;
  hong = true;
  const loi500 = await beDangGame(CHILD1, FIXTURE, `Game phieu hong ${suffix}`);
  hong = false;
  check('Mixpanel trả 500: bé VẪN đăng được game', /\/game\//.test(loi500.url), loi500.url);
  check('… và máy chủ vẫn thử gửi (không tự tắt sau một lần hỏng)', nhan.length > truoc, `${nhan.length - truoc} request`);

  const truoc2 = nhan.length;
  treo = true;
  const luotTreo = await beDangGame(CHILD1, FIXTURE, `Game phieu treo ${suffix}`);
  treo = false;
  check('Mixpanel TREO không trả lời: bé vẫn đăng được game', /\/game\//.test(luotTreo.url), `${nhan.length - truoc2} request`);
  /*
   * VÀ KHÔNG PHẢI CHỜ THEO. Đây mới là phép bắt được `await` nhầm: `guiSuKien` bắn rồi
   * quên, nên Mixpanel im lặng tới hết 3 giây timeout mà bé vẫn bấm xong là xong. Ngưỡng
   * 2 giây so với lượt bình thường: đủ rộng cho nhiễu của trình duyệt, đủ hẹp để một cú
   * `await` (tối thiểu 3 giây timeout) không lọt.
   */
  check(
    '… và KHÔNG phải chờ Mixpanel (bấm Đăng xong là xong)',
    luotTreo.msDang <= luotThuong.msDang + 2000,
    `treo ${luotTreo.msDang}ms vs thường ${luotThuong.msDang}ms`
  );
}

// ---------- 5. Không một dấu vết nào trong trình duyệt của bé ----------
{
  const ctx = await moi();
  const p = await ctx.newPage();
  const raNgoai = [];
  p.on('request', (r) => {
    const h = new URL(r.url()).hostname;
    if (/mixpanel/i.test(h) || h === '127.0.0.1' && new URL(r.url()).port === String(CONG_GIA)) raNgoai.push(r.url());
  });
  await p.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await p.fill('#username', CHILD1);
  await p.fill('#password', CHILD_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});
  await p.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  const html = await p.content();
  check('Trình duyệt của bé KHÔNG gọi Mixpanel một lần nào', raNgoai.length === 0, raNgoai.join(' '));
  check('Trang không nhắc tới mixpanel và không mang token', !/mixpanel/i.test(html) && !html.includes(TOKEN_CHO));
  const csp = (await (await fetch(`${APP}/upload`)).headers.get('content-security-policy')) ?? '';
  check('CSP không mở cửa cho mixpanel', !/mixpanel/i.test(csp), csp ? 'CSP có, không có mixpanel' : 'không đọc được CSP');
  await ctx.close();
}

// ---------- 6. Trang điều khoản khai đúng việc đang làm ----------
{
  const dk = await (await fetch(`${APP}/dieu-khoan`)).text();
  check(
    'Trang điều khoản khai rõ việc gửi Mixpanel, và khai cả cách giấu danh tính',
    /Mixpanel/.test(dk) && /băm một chiều/.test(dk) && /không nhận\s*địa chỉ IP|không nhận địa chỉ IP/.test(dk.replace(/\s+/g, ' ')),
    /Mixpanel/.test(dk) ? 'có đoạn khai' : 'KHÔNG có đoạn nào nhắc Mixpanel'
  );
}

// ---------- Dọn ----------
sql(`delete from "Parent" where email = '${PARENT_EMAIL}'`);
sql(`delete from "LoginAttempt" where identity like '%${suffix}%'`);
await browser.close();
stub.close();

const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
