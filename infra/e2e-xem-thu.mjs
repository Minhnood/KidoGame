/**
 * Đăng game: CHỌN FILE LÀ THẤY GAME NGAY (chơi thử + chọn bìa), điền tên rồi "Đăng game".
 *
 * ═══ VÌ SAO CÓ BƯỚC NÀY ═══
 *
 * Trước đây bấm một nút là game lên trang chủ ngay và thư đã đi tới bố mẹ. Game hỏng,
 * bìa xấu, gõ nhầm tên — bé chỉ biết SAU khi cả trang đã thấy. Fen muốn bé được chơi thử
 * và xem bìa trước, ưng rồi mới đăng.
 *
 * ═══ NHỮNG GÌ BỘ NÀY PHẢI GIỮ ═══
 *
 *  1. Chọn file là có bản xem thử, không cần tên, không cần bấm gì — và nó KHÔNG tạo game,
 *     KHÔNG gửi thư cho bố mẹ.
 *  2. Bản thử chạy được thật: bìa tải được, khung game trỏ đúng player origin.
 *  3. Chọn file khác thì bản thử đổi theo; chọn dồn hai file thì chỉ file SAU được giữ.
 *  4. Đăng là đăng ĐÚNG file và bìa vừa thử, với tên bé điền, đúng một lần, và lúc đó
 *     mới báo bố mẹ. Tên sai thì bản thử được giữ lại để bé sửa.
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
 * đã chọn mà bị đổi giờ sửa (`ERR_UPLOAD_FILE_CHANGED`): lần gửi lại (tạo lại bản thử
 * hết hạn) ra "Không gửi được file". Người thật chọn file trên máy mình nên không gặp;
 * đo được ở lần chạy đầu của bộ này.
 */
const FIXTURE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kg-xem-thu-')), 'game.sb3');
fs.copyFileSync(FIXTURE_GOC, FIXTURE);

/*
 * Game NHIỀU BÌA: 2 cảnh nền, 3 nhân vật khác màu. File mẫu chung chỉ có một nhân vật
 * và một cảnh nền, nên với nó phần chọn bìa không có gì để chọn.
 */
/** Dựng một .sb3: mỗi màu trong `nenMau` là một cảnh nền, mỗi màu trong `nvMau` một nhân vật. */
function dungSb3(ra, nenMau, nvMau) {
  const hinh = (noiDung) => {
    const data = Buffer.from(noiDung, 'utf8');
    const id = createHash('md5').update(data).digest('hex');
    return { data, costume: { name: id, bitmapResolution: 1, dataFormat: 'svg', assetId: id, md5ext: `${id}.svg`, rotationCenterX: 24, rotationCenterY: 24 } };
  };
  const nen = nenMau.map((m) => hinh(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="${m}"/></svg>`));
  const nv = nvMau.map((m) => hinh(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="20" fill="${m}"/></svg>`));
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
  const tenHinh = new Set();
  const files = [{ ten: 'project.json', data: Buffer.from(JSON.stringify(project), 'utf8') }];
  for (const h of [...nen, ...nv]) {
    if (tenHinh.has(h.costume.md5ext)) continue;
    tenHinh.add(h.costume.md5ext);
    files.push({ ten: h.costume.md5ext, data: h.data });
  }
  fs.writeFileSync(ra, zip(files));
  return ra;
}

/*
 * Game NHIỀU BÌA: 2 cảnh nền, 3 nhân vật khác màu. File mẫu chung chỉ có một nhân vật
 * và một cảnh nền, nên với nó phần chọn bìa gần như không có gì để chọn.
 */
const FIXTURE_NHIEU_BIA = dungSb3(path.join(path.dirname(FIXTURE), 'nhieu-bia.sb3'), ['#ffe08a', '#9fd3ff'], ['#e63946', '#2a9d8f', '#6a4c93']);

/*
 * Game CỦA RIÊNG LẦN CHẠY NÀY, cho phép đo `storage:prune`. HTML đóng gói lúc xem thử mang
 * tên chung "KidoGame", nên cùng một .sb3 là cùng một file HTML với game đã đăng ở phần
 * trước — file đó đang được dùng, không bao giờ thành rác, và phép đo đỏ oan (đo được:
 * rác 0→0). Màu nhân vật lấy từ `suffix` để HTML không trùng ai.
 */
const FIXTURE_RIENG = dungSb3(path.join(path.dirname(FIXTURE), 'rieng.sb3'), ['#ffffff'], [`#${suffix.slice(0, 6)}`]);

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

/** Chọn file và trả về JSON bản xem thử server gửi về (hoặc null). Không bấm gì cả. */
async function chonFile(p, file) {
  const cho = p
    .waitForResponse((r) => new URL(r.url()).pathname === '/api/upload', { timeout: 60000 })
    .catch(() => null);
  await p.setInputFiles('#file', file);
  const res = await cho;
  const data = res ? await res.json().catch(() => null) : null;
  await p.waitForSelector('[data-testid=xem-thu], [data-testid=upload-form] [role=alert]', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(300);
  return data;
}

/** POST /api/upload/dang từ trong trang (mang cookie của phiên đó). Trả mã HTTP. */
const guiDang = (p, ma, them = {}) =>
  p.evaluate(
    async ({ ma, them }) => {
      const r = await fetch('/api/upload/dang', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ maXemThu: ma, title: 'Ten hop le', ...them }),
      });
      return r.status;
    },
    { ma, them }
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

// ---------- 1. Chọn file là có bản xem thử — chưa có gì công khai ----------
await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
const ban1 = await chonFile(c, FIXTURE);

check('Chọn file là hiện bản chơi thử ngay, không cần tên, không bấm gì', (await c.locator('[data-testid=xem-thu]').count()) === 1 && (await c.inputValue('#title')) === '' && new URL(c.url()).pathname === '/upload', c.url());
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

// ---------- 2. Chọn file khác ----------
/* Phân biệt hai file bằng SỐ Ô BÌA: file mẫu thường (1 nhân vật, 1 cảnh nền) cho 2 bìa —
   mặc định và cảnh nền trơn — còn game nhiều bìa cho 5. Bản đầu của phép chọn dồn đòi
   "không có ô chọn bìa" cho file thường và đỏ oan: file đó vốn có 2 bìa. */
const soOBia = () => c.locator('[data-testid=chon-bia] input[type=radio]').count();
{
  const ban = await chonFile(c, FIXTURE_NHIEU_BIA);
  check('Chọn file khác thì bản chơi thử đổi theo', !!ban && ban.maXemThu !== ban1?.maXemThu && (await soOBia()) === 5, `${await soOBia()} ô bìa`);

  /* Chọn dồn hai file: phản hồi của file ĐẦU về sau cũng không được đè lên file sau. Giữ
     request đầu lại 1,5 giây TRƯỚC khi gửi cho chắc nó về sau. Không dùng `route.fetch()`
     rồi `fulfill`: làm thế hỏng body nhị phân và server trả 400 "không phải file Scratch". */
  let lanDau = true;
  await c.route('**/api/upload', async (r) => {
    if (lanDau) {
      lanDau = false;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    return r.continue();
  });
  /* Số bìa của từng phản hồi, theo THỨ TỰ về tới: phải là [2, 5] — file thường về trước,
     file nhiều bìa (bị giữ lại) về sau. Không đúng thứ tự đó thì phép này không đo được gì. */
  const veLanCuoi = [];
  const nghe = async (r) => {
    if (new URL(r.url()).pathname !== '/api/upload') return;
    const j = await r.json().catch(() => ({}));
    veLanCuoi.push(j.biaUrls?.length ?? -1);
  };
  c.on('response', nghe);
  await c.setInputFiles('#file', FIXTURE_NHIEU_BIA);
  await c.waitForTimeout(100);
  await c.setInputFiles('#file', FIXTURE);
  await c.waitForTimeout(4000);
  c.off('response', nghe);
  await c.unroute('**/api/upload');
  check(
    'Chọn dồn hai file, file ĐẦU trả về SAU: trang vẫn giữ bản thử của file sau (2 ô bìa, không phải 5)',
    veLanCuoi.join(',') === '2,5' && (await soOBia()) === 2,
    `bìa theo thứ tự về: [${veLanCuoi.join(', ')}], trang hiện ${await soOBia()} ô bìa`
  );

  /* Bé sửa game trong Scratch, LƯU ĐÈ cùng tên rồi chọn lại. Trình duyệt không phát
     `change` khi chọn lại đúng file đang chọn — trước khi `FilePicker` tự xoá giá trị,
     trang giữ bản thử cũ và bấm Đăng là đăng bản cũ. Đo được: 0 request. */
  const doi = path.join(path.dirname(FIXTURE), 'luu-de.sb3');
  fs.copyFileSync(FIXTURE, doi);
  await chonFile(c, doi);
  const truocLuuDe = await soOBia();
  fs.copyFileSync(FIXTURE_NHIEU_BIA, doi);
  const banSauLuuDe = await chonFile(c, doi);
  check(
    'Lưu đè game mới vào CÙNG file rồi chọn lại: bản chơi thử đổi sang game mới',
    truocLuuDe === 2 && !!banSauLuuDe && (await soOBia()) === 5,
    `${truocLuuDe} ô bìa → ${await soOBia()} ô bìa`
  );
}

// ---------- 3. Mã bản xem thử không dùng được bởi người khác ----------
const banMoi = await chonFile(c, FIXTURE);
const MA2 = banMoi?.maXemThu ?? 'khong-co-ma-khong-co-ma-khong-co';
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

// ---------- 4. Tên kiểm lúc Đăng; sai thì bản thử được giữ ----------
check('Tên rỗng: 400, không tạo game', (await guiDang(c, MA2, { title: '' })) === 400 && soGame(BE1) === 0);
check('Tên có từ không phù hợp: 400, không tạo game', (await guiDang(c, MA2, { title: 'game dm may' })) === 400 && soGame(BE1) === 0);
check('… bản xem thử vẫn còn, bé sửa tên rồi bấm lại được', fs.existsSync(fileXemThu(MA2)));

await c.click('[data-testid=dang-game-that]');
await c.waitForTimeout(1500);
check('Bấm Đăng mà chưa gõ tên: trình duyệt chặn, vẫn ở /upload, không tạo game', new URL(c.url()).pathname === '/upload' && soGame(BE1) === 0 && (await c.locator('#title:invalid').count()) === 1);

// ---------- 5. Đăng: đúng file và bìa vừa thử, tên bé điền, đúng một lần ----------
await c.fill('#title', TEN1);
await c.fill('#description', 'Mo ta de thu');
const theLoai = c.locator('[data-testid=tag-picker] label').first();
const slugLoai = (await theLoai.count()) ? await theLoai.locator('input').getAttribute('value') : null;
if (slugLoai) await theLoai.click();
await c.click('[data-testid=dang-game-that]');
await c.waitForURL(/\/game\//, { timeout: 30000 }).catch(() => {});
const GAME_ID = c.url().split('/game/')[1] ?? '';
check('Điền tên rồi bấm "Đăng game" thì sang trang game vừa đăng', GAME_ID.length > 0, c.url());
const dong = GAME_ID ? sql(`select title || '|' || description || '|' || "thumbSha256" || '|' || "htmlSha256" from "Game" where id = '${GAME_ID}'`).split('|') : [];
check('Game mang đúng tên và mô tả bé điền lúc Đăng', dong[0] === TEN1 && dong[1] === 'Mo ta de thu', `${dong[0]} / ${dong[1]}`);
check('… đúng bìa và đúng file game của bản thử CUỐI CÙNG', dong[2] === shaTuUrl(banMoi?.thumbUrl) && dong[3] === shaTuUrl(banMoi?.htmlUrl));
const soLoai = GAME_ID && slugLoai ? Number(sql(`select count(*) from "GameTag" gt join "Tag" t on t.id = gt."tagId" where gt."gameId" = '${GAME_ID}' and t.slug = '${slugLoai}'`)) : -1;
check('… và đúng loại game bé tick', soLoai === 1, slugLoai ?? '(không có loại nào để tick)');
check('Đăng xong mới có thư báo bố mẹ, đúng tên game', await choMailToi(MAIL_LOG, PARENT_EMAIL, new RegExp(TEN1)));
check('Bản xem thử đã dùng thì bị xoá khỏi đĩa', !fs.existsSync(fileXemThu(MA2)));
check('Gửi lại đúng mã đó lần nữa: 410, vẫn đúng 1 game', (await guiDang(c, MA2)) === 410 && soGame(BE1) === 1, `${soGame(BE1)} game`);

// ---------- 6. Hết hạn: tạo lại bản thử từ file đang chọn ----------
await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
const ban3 = await chonFile(c, FIXTURE);
if (ban3 && fs.existsSync(fileXemThu(ban3.maXemThu))) {
  const f = fileXemThu(ban3.maXemThu);
  fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, 'utf8')), hetHan: Date.now() - 1000 }));
}
await c.fill('#title', TEN2);
const choTaoLai = c
  .waitForResponse((r) => new URL(r.url()).pathname === '/api/upload', { timeout: 30000 })
  .catch(() => null);
await c.click('[data-testid=dang-game-that]').catch(() => {});
const taoLai = await (await choTaoLai)?.json().catch(() => null);
await c.waitForTimeout(800);
const loiHetHan = await c.locator('[data-testid=upload-form] [role=alert]').innerText().catch(() => '');
check('Bản xem thử hết hạn: báo "hết hạn", không tạo game', /hết hạn/i.test(loiHetHan) && soGame(BE1) === 1, loiHetHan.replace(/\n/g, ' '));
check('… tự tạo lại bản chơi thử mới từ file đang chọn, tên đã gõ còn nguyên', !!taoLai && taoLai.maXemThu !== ban3?.maXemThu && (await c.locator('[data-testid=xem-thu]').count()) === 1 && (await c.inputValue('#title')) === TEN2);
await ctx1.close();

// ---------- 7. Điện thoại 390px ----------
let HTML_DIEN_THOAI = '';
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await dangNhapBe(ctx, BE1);
  await m.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  const ban = await chonFile(m, FIXTURE_RIENG);
  HTML_DIEN_THOAI = shaTuUrl(ban?.htmlUrl);
  const d = await m.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect() ?? null;
    return {
      tran: document.documentElement.scrollWidth - innerWidth,
      nut: r('[data-testid=dang-game-that]')?.height ?? 0,
      khung: r('[data-testid=xem-thu] iframe')?.width ?? 0,
    };
  });
  check('390px: không tràn ngang', d.tran === 0, `${d.tran}px`);
  check('390px: khung chơi thử rộng gần hết màn hình', d.khung >= 300, `${Math.round(d.khung)}px`);
  check('390px: nút "Đăng game" cao đủ tầm tay', d.nut >= 44, `${Math.round(d.nut)}px`);

  /* Gõ tên, chọn file rồi bấm Đăng NGAY, không đợi bản thử hiện ra: trang phải tự chờ bản
     thử xong rồi đăng, không bắt bấm lại. 15 bộ kiểm cũ đăng game đúng kiểu này. */
  await m.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await m.fill('#title', `Game bam dang ngay ${suffix}`);
  const truoc = soGame(BE1);
  await m.setInputFiles('#file', FIXTURE);
  await m.locator('[data-testid=dang-game-that]').tap();
  const nutCho = await m.locator('[data-testid=dang-game-that]').innerText().catch(() => '');
  await m.waitForURL(/\/game\//, { timeout: 30000 }).catch(() => {});
  check(
    'Bấm Đăng ngay khi vừa chọn file: tự chờ bản thử rồi đăng, đúng một game',
    /\/game\//.test(m.url()) && soGame(BE1) === truoc + 1,
    `nút lúc chờ: "${nutCho}", ${soGame(BE1) - truoc} game mới`
  );
  await ctx.close();
}

// ---------- 8. storage:prune chừa file của bản xem thử đang dở ----------
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

// ---------- 9. Chọn bìa khác ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await dangNhapBe(ctx, BE2);
  await m.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  const ban = await chonFile(m, FIXTURE_NHIEU_BIA);
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

  if ((await oChon.count()) >= 3) await m.locator('[data-testid=chon-bia] label').nth(2).tap();
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
  check('Chỉ số bìa ngoài danh sách: 400, không tạo game', (await guiDang(m, ma, { bia: 99 })) === 400 && soGame(BE2) === 0);
  check('Chỉ số bìa sai kiểu ("2"): 400, không tạo game', (await guiDang(m, ma, { bia: '2' })) === 400 && soGame(BE2) === 0);
  check('… bản xem thử vẫn còn để bé chọn lại', fs.existsSync(fileXemThu(ma)));

  await m.fill('#title', `Game nhieu bia ${suffix}`);
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
