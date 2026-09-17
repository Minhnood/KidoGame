/**
 * Kiểm ranh giới giữa ẨN và XOÁ HẲN — và canh rằng tài liệu không nói quá.
 *
 * VÌ SAO CẦN MỘT BỘ RIÊNG. Nút "Ẩn game" của phụ huynh KHÔNG thu hồi nội dung: player
 * origin phục vụ thuần theo mã nội dung và không tra database, nên ai còn giữ URL của
 * file vẫn mở được game đã ẩn — vĩnh viễn, vì `storage:prune` chỉ xoá file mồ côi mà
 * game đang ẩn vẫn trỏ tới file. Lý do thường nhất để một phụ huynh bấm ẩn lại chính
 * là game để lộ gì đó về con họ.
 *
 * Bộ này canh BA sự thật mà cả `/dieu-khoan` lẫn trang phụ huynh đang dựa vào để nói
 * với người dùng. Cả ba đều im lặng khi hỏng:
 *
 *  1. ẨN KHÔNG THU HỒI FILE. Nếu một ngày nào đó player origin bắt đầu tra DB thì câu
 *     chữ trên hai trang kia thành nói giảm, và không có gì báo. Phép kiểm đo cả hai
 *     phía: trang game trả 404 nhưng file vẫn trả 200.
 *  2. XOÁ HẲN THÌ THU HỒI ĐƯỢC BẢN CHƠI ĐƯỢC. Sau khi dọn, file HTML và file .sb3 của
 *     một game KHÔNG trùng file với ai đều trả 404. Đây là lời hứa trên `/dieu-khoan`;
 *     nếu nó không đúng thì trang đang hứa sai.
 *  3. FILE DÙNG CHUNG THÌ KHÔNG BỊ XOÁ — cả .sb3 LẪN HTML. Storage địa chỉ hoá theo nội
 *     dung: hai game dựng từ cùng một .sb3 chia nhau đúng một file .sb3, và từ khi HTML
 *     đóng gói lúc xem thử mang tên chung "KidoGame" (chưa có tên game) thì chia nhau cả
 *     file HTML. Xoá theo mã là xoá mất bản của game khác — nên `/dieu-khoan` phải đặt
 *     CẢ BẢN ĐÃ ĐÓNG GÓI dưới mệnh đề "nếu không còn game nào khác dùng đúng file đó", và
 *     phép kiểm này giữ mệnh đề ấy trung thực.
 *
 * Cần: app server + player server đang chạy, `psql`, một file .sb3 hợp lệ.
 *
 * Chạy:
 *   SB3_FIXTURE=... MAIL_LOG=/tmp/kg-mail.log node infra/e2e-an-vs-xoa.mjs
 *
 * CHẠY SAU `e2e-takedown`: nó dựng một yêu cầu gỡ bản quyền để kiểm chốt "đang khiếu
 * nại thì chưa xoá được", và tự dọn ở cuối.
 *
 * LƯU Ý: bài này chạy `db:prune-removed --xoa` và `storage:prune --xoa` THẬT trên máy
 * đang chạy nó — không có cách nào khác để kiểm rằng xoá hẳn thu hồi được file. Hệ quả
 * ngoài phạm vi bài: mọi file mồ côi khác trên đĩa cũng bị dọn trong lượt đó, và mọi
 * game `REMOVED` đã quá hạn giữ cũng bị xoá thật. Trên máy dev thì đó đúng là việc nên
 * làm; ĐỪNG chạy bộ này với `DATABASE_URL` trỏ vào production.
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { batBuocMailLog, choMailToi, taoBoBamLink } from './e2e-mail.mjs';
import { dungSb3 } from './e2e-zip.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const PLAYER = process.env.PLAYER_ORIGIN ?? 'http://127.0.0.1:3001';
const FIXTURE = process.env.SB3_FIXTURE ?? '';
const MAIL_LOG = batBuocMailLog('e2e-an-vs-xoa');

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-avx-${suffix}@kidogame.test`;
/*
 * Nhà THỨ HAI — một phụ huynh thật, đăng nhập thật, không có con nào ở đây.
 *
 * Cần vì điều kiện đáng canh nhất của nút ẩn trên trang game là "đúng bố mẹ của bé
 * NÀY", chứ không phải "có đăng nhập". Đo bằng khách chưa đăng nhập thì gỡ mất vế
 * `parentId` đi phép kiểm vẫn xanh nguyên — trong khi lúc đó mọi phụ huynh khác đều
 * xem được game đang ẩn của nhà người ta và bấm ẩn được game của con họ.
 *
 * Cố ý KHÔNG xác minh email tài khoản này: chưa xác minh chỉ chặn việc tạo tài khoản
 * cho con, không chặn đăng nhập — nên đây vẫn đúng là một phiên phụ huynh hợp lệ, và
 * bớt được một vòng đọc hộp thư.
 */
const PARENT2_EMAIL = `e2e-avx2-${suffix}@kidogame.test`;
const PASS = 'matkhau-dai-1234';
const CHILD_USER = `eavx${suffix}`;
const CHILD_PASS = 'be1234';
const CLAIMANT_EMAIL = `nguoi-goc-avx-${suffix}@vidu.test`;

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

/** Mã HTTP của một file trên player origin, theo bucket và mã nội dung. */
async function maFile(bucket, sha, ext) {
  const r = await fetch(`${PLAYER}/${bucket}/${sha.slice(0, 2)}/${sha}${ext}`, {
    method: 'GET',
  });
  return r.status;
}

function chayCli(script, args = []) {
  try {
    const out = execFileSync('pnpm', ['--filter', '@kidogame/web', script, ...args], {
      cwd: ROOT,
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

/*
 * Game CỦA RIÊNG LẦN CHẠY NÀY: màu nhân vật lấy từ `suffix`, nên cả .sb3 lẫn HTML của nó
 * không trùng game nào khác trong DB. Chỉ với một game như vậy mới đo được "xoá hẳn thì
 * bản chơi được biến mất" — game dựng từ file mẫu chung thì HTML của nó còn bị các game
 * cũ trong DB dev trỏ tới. Để ở thư mục tạm, không cạnh file mẫu (xem
 * `ERR_UPLOAD_FILE_CHANGED` ở `e2e-xem-thu`).
 */
const FIXTURE_RIENG = dungSb3(
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kg-an-vs-xoa-')), 'rieng.sb3'),
  ['#ffffff'],
  [`#${suffix.slice(0, 6)}`]
);

// ---------- Dựng: phụ huynh -> bé -> bốn game (ba game dùng CHUNG file .sb3) ----------
const parentCtx = await newSession();

/** Phiên của nhà hàng xóm — xem ghi chú ở `PARENT2_EMAIL`. */
const parent2Ctx = await newSession();
{
  const p = await parent2Ctx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT2_EMAIL);
  await p.fill('#password', PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  check(
    'Dựng được một phụ huynh thứ hai để thử ranh giới quyền',
    dem(`select count(*) from "Parent" where email = '${PARENT2_EMAIL}'`) === 1
  );
  await p.close();
}

const games = [];
{
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  check('Xác minh được email phụ huynh', await bamLinkXacMinh(p));

  await p.fill('#displayName', 'Bé Ẩn Xoá');
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

  /* BA game từ CÙNG một file .sb3, cố ý: hai game đầu để kiểm rằng file dùng chung
     không bị xoá theo một game, game thứ ba để kiểm chốt khiếu nại bản quyền. Game thứ
     tư có file riêng, để kiểm rằng xoá hẳn thu hồi được bản chơi được. */
  for (const [nhan, file] of [
    ['xoa', FIXTURE],
    ['giu', FIXTURE],
    ['khieu-nai', FIXTURE],
    ['rieng', FIXTURE_RIENG],
  ]) {
    await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
    await c.fill('#title', `Game ẩn xoá ${nhan} ${suffix}`);
    await c.setInputFiles('#file', file);
    await c.click('[data-testid=upload-form] button[type=submit]');
    await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
    games.push(c.url().split('/game/')[1] ?? '');
  }
  await c.close();
  check('Dựng được bốn game', games.length === 4 && games.every(Boolean));
}

if (!games.every(Boolean)) {
  console.error('Không đăng được game, dừng.');
  await browser.close();
  process.exit(1);
}

const [GAME_XOA, GAME_GIU, GAME_KN, GAME_RIENG] = games;
const shaCua = (id) =>
  sql(`select "sb3Sha256" || ' ' || "htmlSha256" from "Game" where id = '${id}'`).split(' ');
const [SB3_XOA, HTML_XOA] = shaCua(GAME_XOA);
const [SB3_GIU, HTML_GIU] = shaCua(GAME_GIU);
const [SB3_RIENG, HTML_RIENG] = shaCua(GAME_RIENG);

/*
 * Điều kiện của cả bài: hai game dựng từ cùng .sb3 chia nhau CẢ HAI file, còn game riêng
 * thì không chia gì với chúng. Nếu storage thôi địa chỉ hoá theo nội dung, hoặc HTML lại
 * mang tên game, thì mọi kết luận bên dưới đổi nghĩa — nên khẳng định ra thành phép kiểm
 * chứ không giả định.
 *
 * Phép kiểm HTML ở đây TỪNG khẳng định điều ngược lại ("HTML mang tên game, nên là hai
 * file khác nhau"). Nó đỏ ở lượt chạy đủ đầu tiên sau khi HTML đóng gói lúc xem thử mang
 * tên chung "KidoGame" — và kéo theo phép "xoá hẳn thì HTML trả 404" đỏ, vì HTML đó còn
 * game `giu` trỏ tới. Tức `/dieu-khoan` lúc ấy đang hứa "bản đã đóng gói luôn mất".
 */
check('Hai game dùng CHUNG file .sb3 (storage địa chỉ hoá theo nội dung)', SB3_XOA === SB3_GIU, SB3_XOA.slice(0, 12));
check('… và CHUNG cả file HTML (HTML đóng gói lúc xem thử, mang tên chung)', HTML_XOA === HTML_GIU, HTML_XOA.slice(0, 12));
check(
  'Game file riêng không chia file nào với hai game kia',
  SB3_RIENG !== SB3_XOA && HTML_RIENG !== HTML_XOA,
  `${SB3_RIENG.slice(0, 12)} / ${HTML_RIENG.slice(0, 12)}`
);

// ---------- Sự thật 1: ẨN không thu hồi file ----------
{
  /* `parentCtx` đã mang phiên từ lúc đăng ký — đăng nhập lại ở đây thì `/dang-nhap`
     redirect thẳng sang `/phu-huynh` và bài kiểm chờ một ô `#email` không bao giờ có. */
  const parent = await parentCtx.newPage();
  await parent.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });

  /*
   * Ảnh bìa trong danh sách game của bé. Đo TRƯỚC khi ẩn, lúc trang còn ở trạng
   * thái bình thường.
   *
   * `naturalWidth` chứ không phải "thẻ img có tồn tại không": một ô ảnh vỡ vẫn là
   * một thẻ `img` đầy đủ trong DOM, và đó đúng là cách hỏng dễ xảy ra nhất ở đây —
   * sai một mắt xích trong `objectUrl('thumb', …)` thì trang vẫn dựng, vẫn 200,
   * chỉ có ảnh là không bao giờ hiện.
   */
  const anhBia = parent.locator('[data-testid=anh-bia-game]').first();
  check('Trang bố mẹ có ảnh bìa game', (await anhBia.count()) > 0);
  const anh = await anhBia.evaluate((el) => ({
    tai: el.naturalWidth > 0 && el.naturalHeight > 0,
    alt: el.getAttribute('alt'),
    rong: Math.round(el.getBoundingClientRect().width),
    cao: Math.round(el.getBoundingClientRect().height),
    soLink: el.closest('li').querySelectorAll('a[href]').length,
  }));
  check('Ảnh bìa tải được thật, không phải ô vỡ', anh.tai);
  check('Ảnh bìa giữ khổ 4:3 của sân khấu Scratch', anh.rong === 80 && anh.cao === 60, `${anh.rong}x${anh.cao}`);
  /*
   * Hai phép dưới đây đi cùng nhau và chúng nói một điều: ảnh là TRANG TRÍ, nghĩa
   * nằm ở cái tên bên cạnh. Bọc ảnh thành link nữa thì mỗi game có hai điểm dừng
   * bàn phím trỏ về cùng một trang và trình đọc màn hình đọc tên game hai lần —
   * với một nhà bốn game là tám lần.
   */
  check('Ảnh bìa có alt rỗng', anh.alt === '', JSON.stringify(anh.alt));
  check('Thẻ game vẫn chỉ có ĐÚNG MỘT link', anh.soLink === 1, `${anh.soLink} link`);

  const dong = parent.locator(`[data-testid=game-visibility]`).first();
  await dong.locator('button[type=submit]').click();
  await parent.waitForTimeout(2500);

  check(
    'Bấm ẩn thì game về HIDDEN',
    sql(`select status from "Game" where id = '${GAME_XOA}'`) === 'HIDDEN' ||
      sql(`select status from "Game" where id = '${GAME_KN}'`) === 'HIDDEN' ||
      dem(`select count(*) from "Game" where "childId" in (select id from "Child" where username = '${CHILD_USER}') and status = 'HIDDEN'`) === 1
  );

  /* Game nào vừa bị ẩn thì đọc lại từ DB — thứ tự thẻ trên trang không phải hợp đồng. */
  const idAn = sql(
    `select id from "Game" where "childId" in (select id from "Child" where username = '${CHILD_USER}') and status = 'HIDDEN' limit 1`
  );
  const [sb3An, htmlAn] = shaCua(idAn);

  /*
   * "Người thường" phải là MỘT PHIÊN KHÁC, không phải `parent`.
   *
   * Dòng này trước đây gọi `parent.goto(...)` trong khi tên phép kiểm nói "cho người
   * thường" — và nó xanh suốt chỉ vì hồi đó phụ huynh cũng nhận 404. Khi bố mẹ được
   * quyền xem game đang ẩn của con mình, phép kiểm đỏ với thông điệp chỉ sai hướng:
   * nó tố "người thường vào được game đã ẩn", tức báo một lỗ bảo mật không hề có.
   *
   * Nên tách hẳn hai vai và đo cả hai. Đó mới là ranh giới thật, và nó cũng bắt được
   * cái lỗ mà tên phép kiểm cũ đang hứa canh.
   */
  const khach = await browser.newContext();
  const trangKhach = await khach.newPage();
  const maKhach = (await trangKhach.goto(`${APP}/game/${idAn}`)).status();
  const khachThayNut = await trangKhach.locator('[data-testid=chu-nhan-dieu-khien]').count();
  await khach.close();

  /* Nhà hàng xóm: ĐANG ĐĂNG NHẬP, chỉ không phải bố mẹ của bé này. */
  const hangXom = await parent2Ctx.newPage();
  const maHangXom = (await hangXom.goto(`${APP}/game/${idAn}`)).status();
  const hangXomThayNut = await hangXom.locator('[data-testid=chu-nhan-dieu-khien]').count();
  await hangXom.close();

  const maChuNhan = (await parent.goto(`${APP}/game/${idAn}`)).status();

  /*
   * BA PHÉP KIỂM NÀY LÀ TRỌNG TÂM CỦA CẢ BỘ, và chúng phải đi cùng nhau: một mình
   * "trang trả 404" chỉ nói ẩn có tác dụng, một mình "file trả 200" chỉ nói player còn
   * sống. Đặt cạnh nhau thì chúng nói ra đúng cái ranh giới mà `/dieu-khoan` và trang
   * phụ huynh phải mô tả cho đúng.
   */
  check('Game đã ẩn: trang /game/<id> trả 404 cho người lạ', maKhach === 404, `${maKhach}`);
  check(
    'Game đã ẩn: chính bố mẹ của bé vẫn xem được (để còn bấm Hiện lại)',
    maChuNhan === 200,
    `${maChuNhan}`
  );
  check(
    '… nhưng file HTML của nó VẪN trả 200 trên player origin — ẩn không thu hồi nội dung',
    (await maFile('html', htmlAn, '.html')) === 200
  );
  check('… và file .sb3 gốc cũng vẫn trả 200', (await maFile('sb3', sb3An, '.sb3')) === 200);

  /*
   * Nút ẩn/hiện ngay trên trang chơi game. Đo cả hai vai từ cùng một game, cùng
   * một thời điểm: chỉ đo "chủ nhân thấy nút" thì một lỗi cho MỌI người thấy nút
   * vẫn xanh, và cái nút đó bấm vào sẽ ẩn game của con nhà khác.
   */
  check(
    'Trang game: bố mẹ thấy dải điều khiển của mình',
    (await parent.locator('[data-testid=chu-nhan-dieu-khien]').count()) === 1
  );
  check('Trang game: người lạ KHÔNG thấy dải đó', khachThayNut === 0, `${khachThayNut}`);
  /*
   * Hai phép này là ranh giới quyền thật, và chúng đắt hơn hẳn hai phép về khách:
   * một phụ huynh ĐANG ĐĂNG NHẬP mà không phải bố mẹ của bé này phải thấy đúng như
   * người qua đường. Gỡ vế `parentId` khỏi `laChuNhan` thì đúng hai dòng dưới đây đỏ.
   */
  check('Phụ huynh nhà khác vẫn nhận 404 với game đang ẩn', maHangXom === 404, `${maHangXom}`);
  check(
    'Phụ huynh nhà khác KHÔNG thấy dải điều khiển',
    hangXomThayNut === 0,
    `${hangXomThayNut}`
  );
  check(
    'Game đang ẩn thì nhãn nút là "Hiện lại"',
    (await parent.locator('[data-testid=game-visibility] button').first().innerText()).trim() ===
      'Hiện lại'
  );

  await parent.close();
}

// ---------- Chốt: đang có khiếu nại bản quyền thì chưa xoá được ----------
{
  const p = await (await newSession()).newPage();
  await p.goto(`${APP}/bao-cao-ban-quyen`, { waitUntil: 'networkidle' });
  await p.fill('#gameRef', GAME_KN);
  await p.fill('#claimantName', 'Người Làm Bản Gốc');
  await p.fill('#claimantEmail', CLAIMANT_EMAIL);
  await p.fill('#evidence', 'Bản gốc của tôi, đăng từ 2019.');
  await p.locator('[data-testid=takedown-attest]').check();
  await p.click('[data-testid=takedown-form] button[type=submit]');
  await p.waitForSelector('[data-testid=takedown-done]', { timeout: 20000 }).catch(() => {});
  await p.close();

  const parent = await parentCtx.newPage();
  await parent.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  const chu = await parent.innerText('body');
  check(
    'Game đang bị khiếu nại thì trang phụ huynh nói rõ lý do tạm ẩn',
    /tạm ẩn vì có yêu cầu gỡ bản quyền/.test(chu)
  );
  /*
   * KHÔNG hiện nút nào cho nhóm ấy — cả ẩn/hiện lẫn xoá. Nhất quán với chốt đã có ở
   * `setGameHiddenAction`, và cần thiết vì `/dieu-khoan` hứa với người khiếu nại rằng
   * đội kiểm duyệt XEM nội dung rồi trả lời trong hạn; một hàng DB đã xoá thì không
   * còn gì để xem.
   */
  const soThe = await parent.locator('[data-testid=game-delete]').count();
  const soGameConNut = dem(
    `select count(*) from "Game" where "childId" in (select id from "Child" where username = '${CHILD_USER}') and status <> 'REMOVED' and id <> '${GAME_KN}'`
  );
  check(
    'Game đang bị khiếu nại KHÔNG có nút xoá, các game khác thì có',
    soThe === soGameConNut,
    `${soThe} nút / ${soGameConNut} game xoá được`
  );
  await parent.close();
}

// ---------- Sự thật 2 và 3: xoá hẳn rồi dọn ----------
{
  const parent = await parentCtx.newPage();
  await parent.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });

  /* Xoá đúng game GAME_XOA: khoanh theo tiêu đề chứ không theo thứ tự thẻ. */
  const the = parent.locator('li', { hasText: `Game ẩn xoá xoa ${suffix}` }).last();
  await the.locator('[data-testid=game-delete]').click();
  const form = parent.locator('[data-testid=game-delete-form]');
  check(
    'Hộp xác nhận nói rõ là không tự bật lại được',
    /không tự bật lại được/.test(await form.innerText())
  );
  check(
    'Hộp xác nhận nêu số ngày trước khi file gốc bị xoá',
    /file gốc bị xoá sau \d+ ngày/.test(await form.innerText()),
    (await form.innerText()).split('\n')[0]
  );
  await form.locator('[data-testid=game-delete-confirm]').click();
  await parent.waitForTimeout(3000);

  check(
    'Xoá hẳn thì game về REMOVED và đồng hồ bắt đầu chạy',
    sql(`select status || ' ' || ("removedAt" is not null)::text from "Game" where id = '${GAME_XOA}'`) ===
      'REMOVED true'
  );
  check(
    'Có dòng vết PARENT_DELETE trỏ vào đúng game đó',
    dem(
      `select count(*) from "ModerationLog" where action = 'PARENT_DELETE' and "gameId" = '${GAME_XOA}'`
    ) === 1
  );
  check(
    'Phụ huynh nhận thư kèm link tải .sb3 gốc',
    await choMailToi(MAIL_LOG, PARENT_EMAIL, new RegExp(SB3_XOA))
  );
  check(
    '… và thư nói rõ NGÀY file gốc bị xoá hẳn',
    await choMailToi(MAIL_LOG, PARENT_EMAIL, /XOÁ HẲN NGÀY \d{1,2}\/\d{1,2}\/\d{4}/)
  );
  /* Nút "Hiện lại" không được xuất hiện cho game đã xoá — phụ huynh không tự lật được,
     và `setGameHiddenAction` cũng từ chối, nên một cái nút ở đó chỉ để báo lỗi. */
  await parent.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  const theSau = parent.locator('li', { hasText: `Game ẩn xoá xoa ${suffix}` }).last();
  check(
    'Game đã xoá không còn nút nào, chỉ còn nhãn "đã bị gỡ"',
    (await theSau.locator('[data-testid=game-delete]').count()) === 0 &&
      /đã bị gỡ/.test(await theSau.innerText())
  );
  await parent.close();

  /* Kéo `removedAt` về quá khứ rồi chạy đúng hai bước của service prune: không có cách
     nào khác để kiểm một cái hạn mà không chờ thật bảy ngày. */
  sql(
    `update "Game" set "removedAt" = now() - interval '30 days' where id = '${GAME_XOA}'`
  );
  /* Game file riêng: đưa thẳng về REMOVED quá hạn bằng SQL. Đường bấm nút đã đo trọn ở
     GAME_XOA phía trên; ở đây chỉ cần đúng trạng thái đầu vào cho lượt dọn. */
  sql(
    `update "Game" set status = 'REMOVED', "removedAt" = now() - interval '30 days' where id = '${GAME_RIENG}'`
  );
  const donDb = chayCli('db:prune-removed', ['--xoa']);
  check('Bước dọn DB chạy được', donDb.ma === 0, `mã ${donDb.ma}`);
  check(
    'Game quá hạn bị xoá khỏi DB',
    dem(`select count(*) from "Game" where id in ('${GAME_XOA}', '${GAME_RIENG}')`) === 0
  );
  /*
   * Lùi giờ sửa của các file sắp đo về 3 ngày trước, TRƯỚC khi dọn.
   *
   * `storage:prune` chừa mọi file sửa trong 6 giờ qua (để không xoá file của bản xem thử
   * đang chơi dở), mà cả bốn game của bài này vừa đăng xong. Không lùi thì game file riêng
   * không bao giờ bị dọn — đo được: HTML và .sb3 của nó vẫn 200 — còn hai phép "file dùng
   * CHUNG không bị xoá" xanh nhờ lớp chừa chứ không nhờ việc game `giu` còn trỏ tới, tức
   * không đỏ được. Lùi cả file dùng chung là để chúng chỉ còn được cứu bởi đúng lý do đó.
   * Trên production, file của một game đã quá hạn giữ 7 ngày thì vốn đã cũ hơn 6 giờ.
   */
  const cu = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  for (const [bucket, sha, ext] of [
    ['html', HTML_RIENG, '.html'],
    ['sb3', SB3_RIENG, '.sb3'],
    ['html', HTML_XOA, '.html'],
    ['sb3', SB3_XOA, '.sb3'],
  ]) {
    const f = path.join(ROOT, 'storage', bucket, sha.slice(0, 2), `${sha}${ext}`);
    if (fs.existsSync(f)) fs.utimesSync(f, cu, cu);
  }
  const donFile = chayCli('storage:prune', ['--xoa']);
  check('Bước dọn file chạy được', donFile.ma === 0, `mã ${donFile.ma}`);

  check(
    'XOÁ HẲN thu hồi được bản chơi được: file HTML của game file riêng trả 404',
    (await maFile('html', HTML_RIENG, '.html')) === 404,
    HTML_RIENG.slice(0, 12)
  );
  check(
    '… và cả file .sb3 gốc của nó',
    (await maFile('sb3', SB3_RIENG, '.sb3')) === 404,
    SB3_RIENG.slice(0, 12)
  );
  /* Cùng lý lẽ với .sb3 ngay dưới: HTML dùng chung mà bị xoá là game `giu` chết theo. */
  check(
    'File HTML dùng CHUNG với game còn lại thì KHÔNG bị xoá',
    (await maFile('html', HTML_XOA, '.html')) === 200,
    HTML_XOA.slice(0, 12)
  );
  /*
   * VÀ ĐÂY LÀ MỆNH ĐỀ MÀ `/dieu-khoan` PHẢI GIỮ: file .sb3 dùng chung KHÔNG bị xoá, vì
   * game còn lại vẫn trỏ tới nó. Bỏ mệnh đề "nếu không còn game nào khác dùng đúng file
   * đó" khỏi trang điều khoản là hứa một việc mà cơ chế không làm — và không nên làm,
   * vì xoá theo mã nội dung là xoá mất bản gốc của game khác.
   */
  check(
    'File .sb3 dùng CHUNG với game còn lại thì KHÔNG bị xoá',
    (await maFile('sb3', SB3_XOA, '.sb3')) === 200,
    SB3_XOA.slice(0, 12)
  );
  check(
    'Game còn lại vẫn chơi được bình thường',
    (await maFile('html', HTML_GIU, '.html')) === 200
  );
}

// ---------- Dọn ----------
sql(`delete from "TakedownRequest" where "claimantEmail" = '${CLAIMANT_EMAIL}'`);
sql(`delete from "Parent" where email = '${PARENT_EMAIL}'`);
sql(`delete from "Parent" where email = '${PARENT2_EMAIL}'`);
sql(`delete from "LoginAttempt" where identity like '%${suffix}%'`);
/* Dọn nốt file của hai game vừa xoá cùng phụ huynh, không thì storage dev tích rác sau
   mỗi lượt chạy. Chạy sau khi hàng DB đã đi nên chúng đã thành mồ côi. */
chayCli('storage:prune', ['--xoa']);

check(
  'Dọn sạch: không còn yêu cầu gỡ nào của bài này',
  dem(`select count(*) from "TakedownRequest" where "claimantEmail" = '${CLAIMANT_EMAIL}'`) === 0
);

await browser.close();

const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
