/**
 * Đăng game hai bước: "Xem thử game" (chơi thử + xem bìa) rồi mới "Đăng game".
 *
 * ═══ VÌ SAO CÓ BƯỚC NÀY ═══
 *
 * Trước đây bấm một nút là game lên trang chủ ngay và thư đã đi tới bố mẹ. Game hỏng,
 * bìa xấu, gõ nhầm tên — bé chỉ biết SAU khi cả trang đã thấy. Fen muốn bé được chơi thử
 * và xem bìa trước, ưng rồi mới đăng.
 *
 * ═══ NHỮNG GÌ BỘ NÀY PHẢI GIỮ ═══
 *
 *  1. Xem thử KHÔNG tạo game và KHÔNG gửi thư cho bố mẹ — chưa có gì công khai.
 *  2. Bản thử chạy được thật: bìa tải được, khung game trỏ đúng player origin.
 *  3. "Sửa lại" giữ nguyên chữ đã gõ và file đã chọn.
 *  4. Đăng là đăng ĐÚNG bản vừa thử (tên, bìa), đúng một lần, và lúc đó mới báo bố mẹ.
 *  5. Mã bản thử không dùng được bởi bé khác, bởi bố mẹ, bởi người chưa đăng nhập, và
 *     không dùng lại được sau khi hết hạn.
 *  6. `storage:prune` KHÔNG dọn file của bản thử đang chơi dở, nhưng vẫn dọn khi đã cũ.
 *  7. Bé chọn được bìa khác lấy từ chính game, và game đăng lên mang ĐÚNG bìa đã chọn.
 *
 * Chạy:
 *   SB3_FIXTURE=<đường-dẫn.sb3> MAIL_LOG=/tmp/kg-mail.log node infra/e2e-xem-thu.mjs
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { batBuocMailLog, choMailToi, taoBoBamLink } from './e2e-mail.mjs';
import { zip } from './e2e-zip.mjs';
import { createHash } from 'node:crypto';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const PLAYER = process.env.PLAYER_ORIGIN ?? 'http://127.0.0.1:3001';
const FIXTURE_GOC = process.env.SB3_FIXTURE ?? '';
const MAIL_LOG = batBuocMailLog('e2e-xem-thu');

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-xt-${suffix}@kidogame.test`;
const PASS = 'matkhau-dai-1234';
const BE1 = `ext${suffix}`;
const BE2 = `ext2${suffix}`;
const BE_PASS = 'be1234';
const TEN1 = `Game xem thu ${suffix}`;
const TEN2 = `Game xem thu da sua ${suffix}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!FIXTURE_GOC) {
  console.error('Cần SB3_FIXTURE=<đường dẫn .sb3>.');
  process.exit(1);
}

/*
 * Chọn một BẢN SAO ở thư mục tạm, không chọn thẳng file mẫu.
 *
 * File mẫu quen dùng nằm ngay trong `storage/sb3/`. Xem thử lần đầu ghi đúng file đó
 * (trùng hash), `putObject` chạm lại giờ sửa của nó — và Chrome từ chối gửi lại một file
 * đã chọn mà bị đổi giờ sửa (`ERR_UPLOAD_FILE_CHANGED`): bấm "Sửa lại" rồi xem thử lại
 * ra "Không gửi được file". Người thật chọn file trên máy mình nên không gặp; đo được ở
 * lần chạy đầu của bộ này.
 */
const FIXTURE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kg-xem-thu-')), 'game.sb3');
fs.copyFileSync(FIXTURE_GOC, FIXTURE);

/*
 * Game NHIỀU BÌA: 2 cảnh nền, 3 nhân vật khác màu. File mẫu chung chỉ có một nhân vật
 * và một cảnh nền, nên với nó phần chọn bìa không có gì để chọn.
 */
const FIXTURE_NHIEU_BIA = path.join(path.dirname(FIXTURE), 'nhieu-bia.sb3');
{
  const hinh = (noiDung) => {
    const data = Buffer.from(noiDung, 'utf8');
    const id = createHash('md5').update(data).digest('hex');
    return { data, costume: { name: id, bitmapResolution: 1, dataFormat: 'svg', assetId: id, md5ext: `${id}.svg`, rotationCenterX: 24, rotationCenterY: 24 } };
  };
  const nen = ['#ffe08a', '#9fd3ff'].map((m) => hinh(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="${m}"/></svg>`));
  const nv = ['#e63946', '#2a9d8f', '#6a4c93'].map((m) => hinh(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="20" fill="${m}"/></svg>`));
  const chung = { variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0, sounds: [], volume: 100 };
  const project = {
    targets: [
      { ...chung, isStage: true, name: 'Stage', costumes: nen.map((h) => h.costume), layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null },
      ...nv.map((h, i) => ({ ...chung, isStage: false, name: `Nhan vat ${i}`, costumes: [h.costume], layerOrder: i + 1, visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around' })),
    ],
    monitors: [],
    extensions: [],
    meta: { semver: '3.0.0', vm: '2.3.0', agent: 'KidoGame e2e-xem-thu' },
  };
  fs.writeFileSync(
    FIXTURE_NHIEU_BIA,
    zip([{ ten: 'project.json', data: Buffer.from(JSON.stringify(project), 'utf8') }, ...[...nen, ...nv].map((h) => ({ ten: h.costume.md5ext, data: h.data }))])
  );
}

const ROOT = path.join(import.meta.dirname, '..');
const WEB = path.join(ROOT, 'apps', 'web');
const STORAGE = path.join(ROOT, 'storage');
const DB = (
  fs.readFileSync(path.join(WEB, '.env'), 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1] ?? ''
).split('?')[0];
const sql = (q) => execFileSync('psql', [DB, '-q', '-t', '-A', '-c', q]).toString().trim();
const soGame = (be) =>
  Number(sql(`select count(*) from "Game" g join "Child" c on c.id = g."childId" where c.username = '${be}'`));

const fileXemThu = (ma) => path.join(STORAGE, 'xem-thu', `${ma}.json`);
const fileHtml = (sha) => path.join(STORAGE, 'html', sha.slice(0, 2), `${sha}.html`);
const shaTuUrl = (url) => /\/([0-9a-f]{64})\.[a-z]+$/.exec(url ?? '')?.[1] ?? '';

/** Không ném: lỗi thì trả về chuỗi để báo đỏ. */
function chayPrune() {
  try {
    return execFileSync('pnpm', ['--filter', '@kidogame/web', 'storage:prune'], { cwd: ROOT }).toString();
  } catch (e) {
    return `LỖI ${e.status}: ${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}
/** `html  217 file · 215 hash đang dùng (…) ·    3 rác (…) ·   2 mới dưới 6 giờ` -> {rac, moi} */
function demPrune(out) {
  const m = /^html\s+\d+ file · .*?(\d+) rác .*?(\d+) mới dưới/m.exec(out);
  return m ? { rac: Number(m[1]), moi: Number(m[2]) } : null;
}

const browser = await chromium.launch({ channel: 'chrome' });
const bamLinkXacMinh = taoBoBamLink(MAIL_LOG, { appOrigin: APP });

async function dangNhapBe(ctx, be) {
  const p = await ctx.newPage();
  await p.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await p.fill('#username', be);
  await p.fill('#password', BE_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});
  return p;
}

/** Bấm "Xem thử game" và trả về JSON bản xem thử server gửi về (hoặc null). */
async function xemThu(p) {
  const cho = p
    .waitForResponse((r) => new URL(r.url()).pathname === '/api/upload', { timeout: 60000 })
    .catch(() => null);
  await p.click('[data-testid=upload-form] button[type=submit]');
  const res = await cho;
  const data = res ? await res.json().catch(() => null) : null;
  await p.waitForSelector('[data-testid=xem-thu]', { timeout: 15000 }).catch(() => {});
  return data;
}

/** POST /api/upload/dang từ trong trang (mang cookie của phiên đó). `bia` bỏ trống thì không gửi. */
const guiDang = (p, ma, bia) =>
  p.evaluate(
    async ({ ma, bia }) => {
      const r = await fetch('/api/upload/dang', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bia === undefined ? { maXemThu: ma } : { maXemThu: ma, bia }),
      });
      return r.status;
    },
    { ma, bia }
  );

// ---------- Dựng: phụ huynh -> hai bé ----------
const pctx = await browser.newContext({ viewport: { width: 1100, height: 950 } });
const phuHuynh = await pctx.newPage();
{
  const p = phuHuynh;
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  check('Xác minh được email phụ huynh', await bamLinkXacMinh(p));

  for (const [be, ten] of [[BE1, 'Bé Xem Thử'], [BE2, 'Bé Khác']]) {
    await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
    await p.fill('#displayName', ten);
    await p.fill('#username', be);
    await p.fill('#password', BE_PASS);
    await p.click('[data-testid=auth-form] button[type=submit]');
    await p.waitForSelector('[data-testid=auth-form] [role=status]', { timeout: 15000 }).catch(() => {});
  }
  check(
    'Dựng được hai bé',
    Number(sql(`select count(*) from "Child" where username in ('${BE1}', '${BE2}')`)) === 2
  );
}

const ctx1 = await browser.newContext({ viewport: { width: 1100, height: 950 } });
const c = await dangNhapBe(ctx1, BE1);

// ---------- 1. Xem thử: chưa có gì công khai ----------
await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
await c.fill('#title', TEN1);
await c.fill('#description', 'Mo ta de thu');
await c.setInputFiles('#file', FIXTURE);
const ban1 = await xemThu(c);

check('Bấm "Xem thử game" thì hiện bản xem thử, vẫn ở /upload', (await c.locator('[data-testid=xem-thu]').count()) === 1 && new URL(c.url()).pathname === '/upload', c.url());
check('… form được ẩn đi', (await c.locator('[data-testid=upload-form]').count()) === 1 && !(await c.locator('[data-testid=upload-form]').isVisible()));
check('… CHƯA tạo game nào', soGame(BE1) === 0, `${soGame(BE1)} game`);
check(
  '… và CHƯA gửi thư "vừa đăng game" cho bố mẹ',
  !(await choMailToi(MAIL_LOG, PARENT_EMAIL, /vừa đăng game/, 3000))
);
check('… server trả mã bản xem thử 32 ký tự', /^[A-Za-z0-9_-]{32}$/.test(ban1?.maXemThu ?? ''), ban1?.maXemThu ?? '(không có)');
check('… bản xem thử nằm trên đĩa', !!ban1 && fs.existsSync(fileXemThu(ban1.maXemThu)));

const bia = await c.evaluate(() => {
  const img = document.querySelector('[data-testid=bia-xem-thu]');
  return img ? { tai: img.complete && img.naturalWidth > 0, w: img.naturalWidth, src: img.getAttribute('src') } : null;
});
check('Bìa game hiện và tải được', bia?.tai === true, bia ? `${bia.w}px ${bia.src}` : 'không có ảnh');

const khung = await c.locator('[data-testid=xem-thu] iframe').getAttribute('src').catch(() => null);
check('Khung chơi thử trỏ tới player origin, không phải app', (khung ?? '').startsWith(`${PLAYER}/html/`), khung ?? 'không có iframe');
const maHtml = khung ? (await c.request.get(khung).catch(() => null))?.status() : null;
check('… và file game đó mở được (200)', maHtml === 200, `HTTP ${maHtml}`);
const tieuDe1 = await c.locator('#xem-thu-tieu-de').innerText().catch(() => '');
check('Bản xem thử hiện đúng tên game', tieuDe1 === TEN1, tieuDe1);

// ---------- 2. Sửa lại: giữ chữ và file, xem thử lại ----------
await c.click('[data-testid=sua-lai]');
const giuLai = await c.evaluate(() => ({
  hien: document.querySelector('[data-testid=upload-form]')?.hidden === false,
  ten: document.querySelector('#title')?.value ?? '',
  moTa: document.querySelector('#description')?.value ?? '',
  soFile: document.querySelector('#file')?.files.length ?? 0,
}));
check('"Sửa lại" về form, còn nguyên tên, mô tả và file đã chọn', giuLai.hien && giuLai.ten === TEN1 && giuLai.moTa === 'Mo ta de thu' && giuLai.soFile === 1, JSON.stringify(giuLai));

await c.fill('#title', TEN2);
const ban2 = await xemThu(c);
const tieuDe2 = await c.locator('#xem-thu-tieu-de').innerText().catch(() => '');
const loi2 = await c.locator('[data-testid=upload-form] [role=alert]').innerText().catch(() => '');
check(
  'Sửa tên rồi xem thử lại thì bản xem thử mang tên mới',
  tieuDe2 === TEN2 && !!ban2 && ban2.maXemThu !== ban1?.maXemThu,
  `${tieuDe2 || '(không có bản xem thử)'} ${loi2} ${ban2 ? JSON.stringify(ban2).slice(0, 120) : ''}`
);
const MA2 = ban2?.maXemThu ?? 'khong-co-ma-khong-co-ma-khong-co';

// ---------- 3. Mã bản xem thử không dùng được bởi người khác ----------
{
  const ctx2 = await browser.newContext();
  const c2 = await dangNhapBe(ctx2, BE2);
  check('Bé KHÁC dùng mã của bé này: bị từ chối (410)', (await guiDang(c2, MA2)) === 410);
  check('… không bé nào có game', soGame(BE1) === 0 && soGame(BE2) === 0);
  check('… và bản xem thử vẫn còn cho đúng chủ của nó', fs.existsSync(fileXemThu(MA2)));
  check('Mã sai dạng (dò thư mục): 410', (await guiDang(c2, '../../../../etc/passwd')) === 410);
  await ctx2.close();

  check('Bố mẹ dùng mã: 403', (await guiDang(phuHuynh, MA2)) === 403);
  const khach = await (await browser.newContext()).newPage();
  await khach.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  check('Chưa đăng nhập: 401', (await guiDang(khach, MA2)) === 401);
  await khach.context().close();
}

// ---------- 4. Đăng: đúng bản vừa thử, đúng một lần, lúc này mới báo bố mẹ ----------
await c.click('[data-testid=dang-game-that]', { timeout: 10000 }).catch(() => {});
await c.waitForURL(/\/game\//, { timeout: 30000 }).catch(() => {});
const GAME_ID = c.url().split('/game/')[1] ?? '';
check('Bấm "Đăng game" thì sang trang game vừa đăng', GAME_ID.length > 0, c.url());
const dong = sql(`select title || '|' || "thumbSha256" || '|' || "htmlSha256" from "Game" where id = '${GAME_ID}'`).split('|');
check('Game mang đúng tên của bản xem thử cuối cùng', dong[0] === TEN2, dong[0]);
check('… đúng bìa và đúng file game đã chơi thử', dong[1] === shaTuUrl(ban2?.thumbUrl) && dong[2] === shaTuUrl(ban2?.htmlUrl));
check('Đăng xong mới có thư báo bố mẹ, đúng tên game', await choMailToi(MAIL_LOG, PARENT_EMAIL, new RegExp(TEN2)));
check('Bản xem thử đã dùng thì bị xoá khỏi đĩa', !fs.existsSync(fileXemThu(MA2)));
check('Gửi lại đúng mã đó lần nữa: 410, vẫn đúng 1 game', (await guiDang(c, MA2)) === 410 && soGame(BE1) === 1, `${soGame(BE1)} game`);

// ---------- 5. Hết hạn ----------
await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
await c.fill('#title', `Game het han ${suffix}`);
await c.setInputFiles('#file', FIXTURE);
const ban3 = await xemThu(c);
if (ban3 && fs.existsSync(fileXemThu(ban3.maXemThu))) {
  const f = fileXemThu(ban3.maXemThu);
  fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, 'utf8')), hetHan: Date.now() - 1000 }));
}
await c.click('[data-testid=dang-game-that]').catch(() => {});
await c.waitForSelector('[data-testid=upload-form] [role=alert]', { timeout: 15000 }).catch(() => {});
const loiHetHan = await c.locator('[data-testid=upload-form] [role=alert]').innerText().catch(() => '');
check('Bản xem thử hết hạn: về form, báo "hết hạn", không tạo game', /hết hạn/i.test(loiHetHan) && soGame(BE1) === 1, loiHetHan);
check('… file đã chọn vẫn còn, bấm xem thử lại được ngay', (await c.evaluate(() => document.querySelector('#file')?.files.length ?? 0)) === 1);
await ctx1.close();

// ---------- 6. Điện thoại 390px ----------
let HTML_DIEN_THOAI = '';
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await dangNhapBe(ctx, BE1);
  await m.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await m.fill('#title', `Game dien thoai ${suffix}`);
  await m.setInputFiles('#file', FIXTURE);
  const ban = await xemThu(m);
  HTML_DIEN_THOAI = shaTuUrl(ban?.htmlUrl);
  await m.waitForTimeout(500);
  const d = await m.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect() ?? null;
    return {
      tran: document.documentElement.scrollWidth - innerWidth,
      dinh: r('[data-testid=xem-thu]')?.top ?? null,
      nut: r('[data-testid=dang-game-that]')?.height ?? 0,
    };
  });
  check('390px: không tràn ngang', d.tran === 0, `${d.tran}px`);
  check('390px: bản xem thử được cuộn lên đầu màn hình', d.dinh !== null && d.dinh >= -2 && d.dinh <= 120, `đỉnh ${Math.round(d.dinh)}px`);
  check('390px: nút "Đăng game" cao đủ tầm tay', d.nut >= 44, `${Math.round(d.nut)}px`);
  await ctx.close();
}

// ---------- 7. storage:prune chừa file của bản xem thử đang dở ----------
{
  const f = HTML_DIEN_THOAI ? fileHtml(HTML_DIEN_THOAI) : '';
  const co = f && fs.existsSync(f);
  check('File game của bản xem thử chưa đăng nằm trên đĩa', co, HTML_DIEN_THOAI.slice(0, 12));
  const truoc = demPrune(chayPrune());
  if (co) {
    const cu = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    fs.utimesSync(f, cu, cu);
  }
  const sau = demPrune(chayPrune());
  if (co) {
    const now = new Date();
    fs.utimesSync(f, now, now);
  }
  check(
    'storage:prune: file mới của bản xem thử được CHỪA (không tính là rác)',
    !!truoc && !!sau && sau.rac === truoc.rac + 1 && sau.moi === truoc.moi - 1,
    truoc && sau ? `rác ${truoc.rac}→${sau.rac} khi file cũ 3 ngày, mới ${truoc.moi}→${sau.moi}` : 'không đọc được kết quả prune'
  );
}

// ---------- 8. Chọn bìa khác ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await dangNhapBe(ctx, BE2);
  await m.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await m.fill('#title', `Game nhieu bia ${suffix}`);
  await m.setInputFiles('#file', FIXTURE_NHIEU_BIA);
  const ban = await xemThu(m);
  const urls = ban?.biaUrls ?? [];
  // mặc định + 2 nhân vật khác + 1 cảnh nền khác + nền không nhân vật
  check('Game 2 cảnh nền + 3 nhân vật: server đưa 5 bìa khác nhau, bìa đầu là bìa mặc định', urls.length === 5 && new Set(urls).size === 5 && urls[0] === ban?.thumbUrl, `${urls.length} bìa`);

  const oChon = m.locator('[data-testid=chon-bia] input[type=radio]');
  check('… và trang hiện đủ 5 ô chọn bìa', (await oChon.count()) === 5, `${await oChon.count()} ô`);
  const taiHet = await m.evaluate(() =>
    [...document.querySelectorAll('[data-testid=chon-bia] img')].every((i) => i.complete && i.naturalWidth > 0)
  );
  check('… ảnh của mọi ô đều tải được', taiHet);
  const tran = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('390px: hàng bìa không làm tràn ngang', tran === 0, `${tran}px`);

  if ((await oChon.count()) >= 3) {
    await m.locator('[data-testid=chon-bia] label').nth(2).tap();
  }
  const lon = await m.locator('[data-testid=bia-xem-thu]').getAttribute('src').catch(() => null);
  check('Chạm bìa số 3 thì ảnh bìa lớn đổi theo, ô đó được chọn', lon === urls[2] && (await oChon.nth(2).isChecked().catch(() => false)));

  // Bàn phím: radio thật, mũi tên phải sang bìa kế tiếp.
  if ((await oChon.count()) >= 4) {
    await oChon.nth(2).focus();
    await m.keyboard.press('ArrowRight');
  }
  check('Bàn phím: mũi tên phải chọn bìa số 4', await oChon.nth(3).isChecked().catch(() => false));
  if ((await oChon.count()) >= 3) await m.locator('[data-testid=chon-bia] label').nth(2).tap();

  const ma = ban?.maXemThu ?? 'khong-co-ma-khong-co-ma-khong-co';
  check('Chỉ số bìa ngoài danh sách: 400, không tạo game', (await guiDang(m, ma, 99)) === 400 && soGame(BE2) === 0);
  check('Chỉ số bìa sai kiểu ("2"): 400, không tạo game', (await guiDang(m, ma, '2')) === 400 && soGame(BE2) === 0);
  check('… bản xem thử vẫn còn để bé chọn lại', fs.existsSync(fileXemThu(ma)));

  await m.locator('[data-testid=dang-game-that]').tap().catch(() => {});
  await m.waitForURL(/\/game\//, { timeout: 30000 }).catch(() => {});
  const id = m.url().split('/game/')[1] ?? '';
  const thumb = id ? sql(`select "thumbSha256" from "Game" where id = '${id}'`) : '';
  check('Đăng xong: game mang ĐÚNG bìa số 3 đã chọn, không phải bìa mặc định', thumb.length === 64 && thumb === shaTuUrl(urls[2]) && thumb !== shaTuUrl(urls[0]), thumb.slice(0, 12));
  await ctx.close();
}

await pctx.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
