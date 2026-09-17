/**
 * Kiểm tra end-to-end phần đăng nhập / phân quyền (M2).
 *
 * Cần app server đang chạy. Tự tạo tài khoản mới với email ngẫu nhiên nên chạy
 * lại nhiều lần được mà không dọn DB.
 *
 * Chạy:
 *   node infra/e2e-auth.mjs
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { batBuocMailLog, taoBoBamLink } from './e2e-mail.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const FIXTURE = process.env.SB3_FIXTURE ?? '';
const MAIL_LOG = batBuocMailLog('e2e-auth');

/**
 * Đổi cờ xác minh email THẲNG trong DB.
 *
 * Dùng để kiểm rằng lớp bảo vệ nằm ở SERVER, không phải ở việc form bị ẩn: gỡ cờ
 * trong khi form hợp lệ đang mở trên trang, rồi bấm gửi.
 *
 * Cắt query string khỏi DATABASE_URL trước khi gọi psql — `?schema=public` là tham số
 * của Prisma, libpq không hiểu và sẽ báo lỗi. Đây là cái bẫy đã vấp ở script backup.
 */
function datXacMinh(email, daXacMinh) {
  const envPath = path.join(import.meta.dirname, '..', 'apps', 'web', '.env');
  const raw = fs.readFileSync(envPath, 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1] ?? '';
  const url = raw.split('?')[0];
  const gia = daXacMinh ? 'now()' : 'null';
  execFileSync('psql', [url, '-q', '-c', `update "Parent" set "emailVerifiedAt" = ${gia} where email = '${email}'`]);
}

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-${suffix}@kidogame.test`;
const PARENT_PASS = 'matkhau-dai-1234';
const CHILD_USER = `e2e${suffix}`;
const CHILD_PASS = 'be1234';

const results = [];
/*
 * LƯU Ý: luôn khoanh click submit vào đúng form. Thanh điều hướng có nút "Đăng
 * xuất" cũng là <button type=submit>, nên `click('button[type=submit]')` sẽ bấm
 * trúng nút đó và đăng xuất giữa bài test — biểu hiện là test đổ ở chỗ khác hẳn.
 */
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

/** Mỗi context là một "trình duyệt" riêng -> phiên không lẫn vào nhau. */
const newSession = () => browser.newContext({ viewport: { width: 1100, height: 950 } });

const xacMinhEmailCuaTrangHienTai = taoBoBamLink(MAIL_LOG, { appOrigin: APP });

// ---------- Chưa đăng nhập thì không vào được trang cần quyền ----------
{
  const ctx = await newSession();
  const p = await ctx.newPage();

  await p.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  check('Chưa đăng nhập: /upload chuyển sang trang đăng nhập của bé', /be-dang-nhap/.test(p.url()), p.url());

  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  check('Chưa đăng nhập: /phu-huynh chuyển sang trang đăng nhập', /dang-nhap/.test(p.url()), p.url());

  // API phải tự bảo vệ, không dựa vào việc UI đã chặn.
  const status = await p.evaluate(async (app) => {
    const fd = new FormData();
    fd.set('title', 'Không được phép');
    fd.set('file', new File([new Uint8Array([1, 2, 3])], 'x.sb3'));
    const r = await fetch(`${app}/api/upload`, { method: 'POST', body: fd });
    return r.status;
  }, APP);
  check('Chưa đăng nhập: POST /api/upload trả 401', status === 401, `HTTP ${status}`);

  await ctx.close();
}

// ---------- Phụ huynh đăng ký rồi tạo tài khoản cho con ----------
const parentCtx = await newSession();
{
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PARENT_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  check('Phụ huynh đăng ký xong vào được trang quản lý', /phu-huynh/.test(p.url()), p.url());

  /*
   * Chưa xác minh email thì chưa được tạo tài khoản cho con — tạo tài khoản cho con
   * chính là lúc phụ huynh thay con đồng ý với điều khoản, nên hòm thư phải được
   * chứng minh là của họ trước.
   */
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  check(
    'Chưa xác minh email: KHÔNG có khung tạo tài khoản cho bé',
    (await p.locator('[data-testid=create-child-blocked]').count()) > 0 &&
      (await p.locator('#username').count()) === 0
  );

  // Bấm link xác minh trong thư.
  const daXacMinh = await xacMinhEmailCuaTrangHienTai(p);
  check('Bấm link trong thư thì xác minh được email', daXacMinh);

  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  check(
    'Xác minh xong thì khung tạo tài khoản hiện ra',
    (await p.locator('#username').count()) > 0 &&
      (await p.locator('[data-testid=create-child-blocked]').count()) === 0
  );

  /*
   * Và server phải TỰ kiểm, không dựa vào việc form đã bị ẩn.
   *
   * Cách kiểm: form đang hiện hợp lệ trên trang, nhưng ta gỡ dấu xác minh trong DB
   * TRƯỚC khi bấm gửi. Phiên vẫn thật, action vẫn thật — chỉ có điều kiện trong DB
   * đã đổi. Đó đúng là tình huống của một người tự dựng request để lách form.
   *
   * Ẩn form là trải nghiệm; lớp bảo vệ nằm ở `createChild` trong src/lib/auth.ts.
   */
  await datXacMinh(PARENT_EMAIL, false);
  await p.fill('#displayName', 'Bé Test');
  await p.fill('#username', `${CHILD_USER}x`);
  await p.fill('#password', CHILD_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForSelector('[data-testid=auth-form] [role=alert]', { timeout: 15000 }).catch(() => {});
  const loiServer = await p.locator('[data-testid=auth-form] [role=alert]').innerText().catch(() => '');
  check(
    'Server tự từ chối khi email chưa xác minh, không chỉ ẩn form',
    /xác minh email/i.test(loiServer),
    loiServer.replace(/\n/g, ' ')
  );
  await datXacMinh(PARENT_EMAIL, true);

  // Mật khẩu quá ngắn phải bị từ chối.
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });

  /*
   * FORM TẠO BÉ TRẢI HẾT BỀ NGANG, bốn ô xếp hai cột THẲNG HÀNG.
   *
   * Nó từng là cột 500px dạt trái nằm dưới hai khối rộng hết cỡ, bên phải trống một
   * khoảng lớn — fen chụp màn hình và nói giao diện xấu. `AuthForm` dùng chung với mọi
   * trang đăng nhập, nơi cột 500px là đúng, nên sửa nhầm chỗ là trang bố mẹ dạt lại mà
   * không gì đỏ.
   *
   * Đo ở khung nhìn mặc định của bộ này (từ `sm` trở lên mới có hai cột). So với khối
   * ghi chú phía trên chứ không so một con số px: bề rộng thật đổi theo khung nhìn.
   */
  {
    const d = await p.evaluate(() => {
      const r = (el) => el.getBoundingClientRect();
      const form = r(document.querySelector('[data-testid=auth-form]'));
      const o = Object.fromEntries(['displayName', 'username', 'password', 'birthYear'].map((id) => [id, r(document.getElementById(id))]));
      return {
        formW: Math.round(form.width),
        /* Bề rộng VÙNG NỘI DUNG của thẻ cha, trừ lề trong. Bản đầu lấy cả hộp (1024px)
           rồi so với form 984px và đỏ, trong khi form đã trải đúng hết chỗ: thẻ cha là
           `Wrap` có `px-5`. */
        cotW: (() => {
          const cha = document.querySelector('[data-testid=auth-form]').parentElement;
          const cs = getComputedStyle(cha);
          return Math.round(cha.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
        })(),
        hang1: [Math.round(o.displayName.top), Math.round(o.username.top)],
        hang2: [Math.round(o.password.top), Math.round(o.birthYear.top)],
        haiCot: o.username.left > o.displayName.right,
        vw: innerWidth,
      };
    });
    check(
      'Form tạo bé trải hết bề ngang cột nội dung, không dạt về cột 500px',
      d.formW >= d.cotW - 2,
      `form ${d.formW}px / cột ${d.cotW}px, khung nhìn ${d.vw}px`
    );
    check(
      '… và bốn ô xếp hai cột thẳng hàng',
      d.haiCot && d.hang1[0] === d.hang1[1] && d.hang2[0] === d.hang2[1],
      `hàng 1 y=${d.hang1.join('/')}, hàng 2 y=${d.hang2.join('/')}`
    );
  }
  await p.fill('#displayName', 'Bé Test');
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', '123');
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForTimeout(1500);
  const shortPassBlocked =
    (await p.locator('form [role=alert]').count()) > 0 ||
    (await p.locator('#password:invalid').count()) > 0;
  check('Mật khẩu quá ngắn của bé bị từ chối', shortPassBlocked);

  // Tạo thật.
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  await p.fill('#displayName', 'Bé Test');
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', CHILD_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  /*
   * KHÔNG tải lại trang. Bản cũ `reload()` rồi mới tìm bé, nên xanh suốt trong khi trên
   * màn hình thật bé vừa tạo không hiện: thông báo "Đã tạo" nằm dưới form, còn phía trên
   * vẫn "Chưa có bé nào" — vì `createChildAction` thiếu `revalidatePath`. Đi tay trên
   * iPhone mới thấy, và trên điện thoại "tải lại trang" không phải việc bố mẹ tự nghĩ ra.
   */
  await p.waitForSelector('[data-testid=auth-form] [role=status]', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(500);
  check(
    'Tạo được tài khoản cho bé — thẻ của bé hiện ngay, không cần tải lại trang',
    (await p.locator(`#be-${CHILD_USER}`).count()) > 0 &&
      (await p.locator('text=Chưa có bé nào').count()) === 0,
    CHILD_USER
  );

  // Phụ huynh KHÔNG được đăng game hộ con.
  await p.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  const parentUploadBlocked =
    (await p.locator('input[type=file]').count()) === 0 &&
    (await p.locator('text=tài khoản của bé').count()) > 0;
  check('Phụ huynh không thấy form đăng game, có hướng dẫn thay thế', parentUploadBlocked);
}

// ---------- Bé đăng nhập và đăng game ----------
const childCtx = await newSession();
let gameUrl = '';
{
  const p = await childCtx.newPage();
  await p.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });

  // Sai mật khẩu trước.
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', 'sai-mat-khau');
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForSelector('form [role=alert]', { timeout: 15000 }).catch(() => {});
  const wrongMsg = await p.locator('form [role=alert]').first().innerText().catch(() => '');
  check('Sai mật khẩu bị từ chối, không tiết lộ tài khoản có tồn tại', /không đúng/i.test(wrongMsg), wrongMsg.replace(/\n/g, ' '));

  /*
   * Form đang ở đúng trạng thái cần soi: vừa báo sai mật khẩu. React 19 reset form
   * sau khi action chạy xong KỂ CẢ khi action trả lỗi, nên nếu AuthForm không trả
   * lại giá trị thì tên đăng nhập bé vừa gõ đã biến mất.
   *
   * Đáng canh thường trực vì đây là loại lỗi không ai báo: form vẫn hiện, thông báo
   * lỗi vẫn đúng, chỉ có chữ đã gõ lặng lẽ mất. Trên trang đăng nhập của TRẺ, gõ lại
   * là chỗ bỏ cuộc.
   */
  const keptUser = await p.inputValue('#username').catch(() => '');
  check('Báo lỗi xong vẫn giữ tên đăng nhập vừa gõ', keptUser === CHILD_USER, JSON.stringify(keptUser));

  // Mật khẩu thì CỐ Ý không giữ: trình quản lý mật khẩu điền hộ, còn để một mật
  // khẩu sai nằm lại trong DOM thì không được gì.
  const keptPass = await p.inputValue('#password').catch(() => 'không đọc được');
  check('Báo lỗi xong thì xoá ô mật khẩu', keptPass === '', JSON.stringify(keptPass));

  // Đúng mật khẩu.
  await p.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', CHILD_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});
  check('Bé đăng nhập được', !/be-dang-nhap/.test(p.url()), p.url());
  check(
    'Thanh điều hướng hiện tên bé',
    (await p.locator('text=Bé Test').count()) > 0 || (await p.locator('text=Đăng game').count()) > 0
  );

  // Kiểm THUỘC TÍNH của cookie phiên thật. Đây là nền của việc tách origin:
  // nếu cookie có `domain` thì nó sẽ lọt sang player origin và toàn bộ lớp cách
  // ly sụp, mà không có biểu hiện gì trên giao diện.
  const cookies = await childCtx.cookies();
  const session = cookies.find((c) => c.name === 'kidogame_session');
  check('Cookie phiên tồn tại', !!session);
  if (session) {
    check('Cookie phiên là host-only (domain không có dấu chấm đầu)', !session.domain.startsWith('.'), session.domain);
    check('Cookie phiên httpOnly (JS không đọc được)', session.httpOnly === true);
    check('Cookie phiên sameSite=Lax (chặn POST từ site khác)', session.sameSite === 'Lax', String(session.sameSite));
    const visibleToJs = await p.evaluate(() => document.cookie);
    check('document.cookie không chứa token phiên', !visibleToJs.includes('kidogame_session'), visibleToJs || '(rỗng)');
  }

  if (FIXTURE) {
    await p.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
    await p.fill('#title', `Game của bé ${suffix}`);
    await p.setInputFiles('#file', FIXTURE);
    await p.click('[data-testid=upload-form] button[type=submit]');
    await p.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
    gameUrl = p.url();
    check('Bé đăng game thành công', /\/game\//.test(gameUrl), gameUrl);

    const credit = await p.locator('[data-testid=page-lead]').first().innerText().catch(() => '');
    check('Game ghi công đúng tên bé', /Bé Test/.test(credit), credit);
  }
}

// ---------- Phụ huynh ẩn game của con ----------
if (gameUrl) {
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  await p.locator('button:has-text("Ẩn game")').first().click();
  await p.waitForTimeout(2500);

  const anon = await browser.newContext();
  const guest = await anon.newPage();
  const res = await guest.goto(gameUrl, { waitUntil: 'networkidle' });
  check('Game bị ẩn thì khách vào trả 404', res?.status() === 404, `HTTP ${res?.status()}`);
  await anon.close();
}

// ---------- Danh sách game của bé trên trang bố mẹ: 5 game, "Xem tất cả", phân trang ----------
/*
 * Trước đây danh sách in hết một lượt: bé Minh trong DB dev có 26 game, thẻ của bé cao
 * hơn 2.000px và form tạo bé bị đẩy xuống tận đáy.
 *
 * DỰNG GAME BẰNG SQL, không bằng upload: cần hơn 10 game cho MỘT bé, mà trần là 10 game
 * mỗi bé trong 24 giờ — upload thật thì chính bộ này tự chạm trần, và đỏ ở một phép
 * kiểm chẳng liên quan gì tới phân trang. Bản sao dùng lại file của game vừa upload
 * (cùng sha), và `createdAt` lùi về QUÁ KHỨ để game thật vẫn đứng đầu danh sách — phép
 * kiểm "Ẩn game" phía trên bấm vào nút đầu tiên và phải trúng đúng game của nó.
 *
 * Lùi từ `createdAt` CỦA GAME GỐC, KHÔNG từ `now()`. Prisma ghi giờ UTC vào cột
 * `timestamp` không múi giờ, còn `now()` của Postgres dev ra giờ Asia/Ho_Chi_Minh — bản
 * đầu viết `now() - n giờ` và mỗi lượt chạy đặt 13 game ở TƯƠNG LAI 7 tiếng. Sau vài
 * lượt, 51 game tương lai chiếm trọn trang 1 trang chủ, game vừa đăng thật của các bộ
 * khác rơi sang trang 2, và `e2e-dang-tai` đổ vì không tìm thấy thẻ của chính nó.
 */
if (gameUrl) {
  const envPath = path.join(import.meta.dirname, '..', 'apps', 'web', '.env');
  const dbUrl = (fs.readFileSync(envPath, 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1] ?? '').split('?')[0];
  const gameId = gameUrl.split('/game/')[1];
  execFileSync('psql', [dbUrl, '-q', '-c', `
    insert into "Game" (id, "childId", title, "sb3Sha256", "sb3Size", "htmlSha256", "thumbSha256", "createdAt", "updatedAt")
    select 'e2eph' || n || '${suffix}', "childId", 'Game phân trang ' || n, "sb3Sha256", "sb3Size", "htmlSha256", "thumbSha256",
           "createdAt" - (n || ' hours')::interval, "updatedAt"
    from "Game", generate_series(1, 13) as n
    where id = '${gameId}'`]);

  {
    const tuongLai = execFileSync('psql', [dbUrl, '-tAc', `
      select count(*) from "Game" g, "Game" goc
      where g.id like 'e2eph%${suffix}' and goc.id = '${gameId}' and g."createdAt" >= goc."createdAt"`]).toString().trim();
    check('Game dựng bằng SQL đều CŨ HƠN game vừa đăng thật (không nằm ở tương lai)', tuongLai === '0', `${tuongLai}/13 không cũ hơn`);
  }

  const p = await parentCtx.newPage();
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  const the = p.locator(`#be-${CHILD_USER}`);
  const hrefs = () => the.locator('a[href^="/game/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));

  /*
   * MẶC ĐỊNH 5 game mới nhất, bấm "Xem tất cả" mới ra 10 game một trang có phân trang
   * — yêu cầu của fen. Trước đó trang mở ra thẳng 10 dòng một trang.
   */
  const t0 = await hrefs();
  const tieuDe0 = (await p.locator(`[data-testid=tieu-de-game-be-${CHILD_USER}]`).innerText({ timeout: 3000 }).catch(() => '')).replace(/\s+/g, ' ');
  check('Trang bố mẹ: mặc định mỗi bé chỉ bày 5 game', t0.length === 5, `${t0.length} dòng`);
  /* Đếm TỔNG, không đếm dòng đang bày — nếu không một bé 14 game hiện "(5)". */
  check('… tiêu đề vẫn đếm TỔNG và nói đây là 5 game mới nhất', /\(14\)/.test(tieuDe0) && /5 game mới nhất/.test(tieuDe0), tieuDe0);
  const xemTatCa = p.locator(`[data-testid=xem-tat-ca-be-${CHILD_USER}]`);
  check(
    '… không có thanh phân trang, chỉ có link "Xem tất cả" kèm con số',
    (await p.locator(`[data-testid=pager-be-${CHILD_USER}]`).count()) === 0 &&
      /Xem tất cả 14 game/.test(await xemTatCa.innerText().catch(() => ''))
  );

  /* Không có link thì các phép trên đã đỏ; mở thẳng URL để phần còn lại vẫn đo được,
     đừng để `click()` treo 30 giây rồi làm đổ cả bộ — lần thử phá đầu tiên đổ đúng vậy. */
  if (await xemTatCa.count()) await xemTatCa.click();
  else await p.goto(`${APP}/phu-huynh?be=${CHILD_USER}&xem=tat-ca#be-${CHILD_USER}`);
  await p.waitForURL(/xem=tat-ca/, { timeout: 20000 });
  await p.waitForSelector(`[data-testid=pager-be-${CHILD_USER}]`, { timeout: 10000 }).catch(() => {});
  const t1 = await hrefs();
  const tieuDe = await p.locator(`[data-testid=tieu-de-game-be-${CHILD_USER}]`).innerText({ timeout: 3000 }).catch(() => '');
  check('Bấm "Xem tất cả": 10 game một trang', t1.length === 10, `${t1.length} dòng`);
  check(
    '… năm game mặc định chính là năm game ĐẦU của trang 1 (cùng thứ tự mới nhất)',
    t0.every((h, i) => t1[i] === h)
  );
  check('… tiêu đề chuyển sang "trang 1/2"', /\(14\)/.test(tieuDe) && /trang 1\/2/.test(tieuDe), tieuDe.replace(/\s+/g, ' '));

  await p.locator(`[data-testid=pager-be-${CHILD_USER}-sau]`).click();
  await p.waitForURL(/trang=2/, { timeout: 20000 });
  await p.waitForSelector(`#be-${CHILD_USER} a[href^="/game/"]`);
  const t2 = await hrefs();
  const u = new URL(p.url());
  check(
    'Sang trang 2 của bé ra 4 game KHÁC, không lặp trang 1',
    t2.length === 4 && t2.every((h) => !t1.includes(h)),
    `${t2.length} dòng, ${t2.filter((h) => t1.includes(h)).length} trùng`
  );
  check(
    '… URL giữ "xem tất cả", chỉ đúng bé đó và neo về thẻ của bé',
    u.searchParams.get('be') === CHILD_USER &&
      u.searchParams.get('xem') === 'tat-ca' &&
      u.searchParams.get('trang') === '2' &&
      u.hash === `#be-${CHILD_USER}`,
    u.search + u.hash
  );

  const thuGon = p.locator(`[data-testid=thu-gon-be-${CHILD_USER}]`);
  if (await thuGon.count()) await thuGon.click();
  else await p.goto(`${APP}/phu-huynh#be-${CHILD_USER}`);
  await p.waitForURL((x) => !x.search.includes('xem'), { timeout: 20000 });
  await p.waitForTimeout(800);
  check(
    'Bấm "Thu gọn": về lại 5 game, hết thanh phân trang, vẫn neo ở thẻ của bé',
    (await hrefs()).length === 5 &&
      (await p.locator(`[data-testid=pager-be-${CHILD_USER}]`).count()) === 0 &&
      new URL(p.url()).hash === `#be-${CHILD_USER}`,
    new URL(p.url()).search + new URL(p.url()).hash
  );

  /* Xem tất cả của MỘT bé khác không được kéo bé này mở theo: `?be=` chỉ bé khác thì bé
     này vẫn thu gọn. Không có bé thứ hai thật trong bộ này, nhưng luật được đo đúng ở
     chỗ nó quyết định — tên trong `be` không khớp thì là thu gọn. */
  await p.goto(`${APP}/phu-huynh?be=bekhac&xem=tat-ca&trang=2`, { waitUntil: 'networkidle' });
  check(
    'Xem tất cả / lật trang của bé khác không kéo bé này mở ra',
    (await hrefs()).length === 5 && (await p.locator(`[data-testid=pager-be-${CHILD_USER}]`).count()) === 0
  );

  /* Link lật trang CŨ (trước khi có "Xem tất cả") không có `xem` — vẫn phải ra đúng trang
     nó ghi, không phải 5 game đầu. */
  await p.goto(`${APP}/phu-huynh?be=${CHILD_USER}&trang=2`, { waitUntil: 'networkidle' });
  const tCu = await hrefs();
  check('Link cũ ?be=…&trang=2 (không có xem=) vẫn mở đúng trang 2', tCu.length === 4 && tCu.every((h) => t2.includes(h)), `${tCu.length} dòng`);

  await p.goto(`${APP}/phu-huynh?be=${CHILD_USER}&xem=tat-ca&trang=9`, { waitUntil: 'networkidle' });
  check(
    'Trang vượt quá cuối nói ra, không giả vờ "Bé chưa đăng game nào"',
    (await p.locator(`[data-testid=pager-be-${CHILD_USER}-khong-co]`).count()) === 1 &&
      (await the.locator('text=Bé chưa đăng game nào').count()) === 0
  );
  await p.close();

  /*
   * ĐIỆN THOẠI 390px: form tạo bé phải TÌM ĐƯỢC từ màn đầu, và dòng game không phình.
   *
   * Đo trước khi sửa, bé 26 game: tiêu đề form ở 2.761px, không gì trên màn đầu nói
   * rằng thêm bé làm ở trang này; mỗi dòng game cao 142px. Dòng game không gọn hơn
   * được bao nhiêu (hai nút cao 48px không vừa chung dòng với tên game ở 390px), nên
   * ngưỡng ở đây canh để nó không trôi ngược về cỡ cũ.
   */
  const dt = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await dt.addCookies(await parentCtx.cookies());
  const pd = await dt.newPage();
  await pd.goto(`${APP}/phu-huynh`, { waitUntil: 'domcontentloaded' });
  await pd.waitForSelector(`#be-${CHILD_USER} a[href^="/game/"]`);
  const nhay = pd.locator('[data-testid=nhay-tao-tai-khoan]');
  const hopNhay = (await nhay.count()) ? await nhay.boundingBox() : null;
  check(
    '390px: link "Thêm tài khoản cho bé" nằm trong màn đầu, cao đủ tầm tay',
    hopNhay && hopNhay.y + hopNhay.height <= 844 && hopNhay.height >= 44,
    hopNhay ? `đáy ở ${Math.round(hopNhay.y + hopNhay.height)}px, cao ${Math.round(hopNhay.height)}px` : 'không có link'
  );
  const dong = await pd.locator(`#be-${CHILD_USER} ul li`).evaluateAll((els) =>
    els.map((e) => {
      const anh = e.querySelector('[data-testid=anh-bia-game]').getBoundingClientRect();
      return { cao: Math.round(e.getBoundingClientRect().height), tiLe: anh.width / anh.height };
    })
  );
  const caoNhat = Math.max(...dong.map((d) => d.cao));
  check('390px: mỗi dòng game không cao quá 130px (trước khi sửa: 142px)', caoNhat <= 130, `cao nhất ${caoNhat}px`);
  check(
    '… và ảnh bìa vẫn đúng khổ 4:3 của sân khấu Scratch',
    dong.every((d) => Math.abs(d.tiLe - 4 / 3) < 0.02),
    dong.map((d) => d.tiLe.toFixed(2)).slice(0, 3).join(', ')
  );
  /* Không có link thì báo ĐỎ, đừng để `click()` treo 30 giây rồi ném lỗi làm đổ cả bộ
     — lần thử phá đầu tiên đổ đúng như vậy, và không in ra một dòng kết quả nào. */
  if (hopNhay) {
    await nhay.click();
    await pd.waitForTimeout(800);
  }
  const dinhForm = await pd.evaluate(
    () => document.getElementById('tao-tai-khoan')?.getBoundingClientRect().top ?? -1
  ).then(Math.round);
  check(
    '390px: bấm link là tới ĐÚNG tiêu đề form, sát mép trên',
    new URL(pd.url()).hash === '#tao-tai-khoan' && dinhForm >= 0 && dinhForm <= 60,
    `tiêu đề cách đỉnh ${dinhForm}px`
  );
  await dt.close();
}

// ---------- Khoá tài khoản là thu hồi phiên đang mở ----------
if (gameUrl) {
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  await p.locator('button:has-text("Tạm khoá tài khoản")').first().click();
  await p.waitForTimeout(2500);

  /* Không tải lại trang. Từng không đổi gì trên màn hình: khoá đã có hiệu lực ở server
     nhưng nút vẫn "Tạm khoá tài khoản", không có "(đang khoá)" — trông như bấm hỏng, đúng
     ở nút an toàn. `setChildLockedAction` thiếu `revalidatePath`. */
  const theBe = p.locator(`#be-${CHILD_USER}`);
  check(
    'Bấm khoá thì thẻ của bé đổi ngay: nút "Mở khoá tài khoản" và "(đang khoá)", không cần tải lại',
    (await theBe.locator('button:has-text("Mở khoá tài khoản")').count()) > 0 &&
      (await theBe.locator('text=(đang khoá)').count()) > 0
  );

  // Dùng lại đúng context của bé — phiên cũ phải mất hiệu lực NGAY.
  const childPage = await childCtx.newPage();
  await childPage.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  check(
    'Khoá tài khoản: phiên đang mở của bé mất hiệu lực ngay',
    /be-dang-nhap/.test(childPage.url()),
    childPage.url()
  );
}

/*
 * ---------- Bố mẹ đưa điện thoại cho bé: "Cho bé đăng nhập trên máy này" ----------
 *
 * Đi tay luồng phụ huynh mới ở khổ iPhone: tạo bé xong, trang bố mẹ không nói bé đăng
 * nhập ở đâu. Bố mẹ phải tự mò "Đăng xuất" rồi "Bé đăng nhập", rồi gõ lại tên đăng nhập
 * vừa đặt. Nút này làm cả ba việc trong một cú chạm.
 *
 * Để CUỐI bộ: nút huỷ phiên của bố mẹ, mà các phần trên còn dùng `parentCtx`.
 */
{
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  const nutTrongThe = () => p.locator(`#be-${CHILD_USER} [data-testid=cho-be-dang-nhap]`);

  // Phần trên vừa khoá bé (khi có game). Bé bị khoá thì có vào cũng bị từ chối.
  if (gameUrl) {
    check('Bé đang khoá: KHÔNG có nút cho bé đăng nhập', (await nutTrongThe().count()) === 0);
    await p.locator(`#be-${CHILD_USER} button:has-text("Mở khoá tài khoản")`).click();
    await p.waitForSelector(`#be-${CHILD_USER} button:has-text("Tạm khoá tài khoản")`, { timeout: 15000 }).catch(() => {});
  }

  /* Server phải tự kiểm "bé đang khoá", không dựa vào việc nút bị ẩn: trang `p` còn mở
     nút từ lúc bé chưa khoá, tab khác khoá bé, rồi bấm nút cũ. Không được đăng xuất bố mẹ. */
  await p.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  if ((await nutTrongThe().count()) > 0) {
    const tabKhac = await parentCtx.newPage();
    await tabKhac.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
    await tabKhac.locator(`#be-${CHILD_USER} button:has-text("Tạm khoá tài khoản")`).click();
    await tabKhac.waitForSelector(`#be-${CHILD_USER} button:has-text("Mở khoá tài khoản")`, { timeout: 15000 }).catch(() => {});

    await nutTrongThe().locator('button').click();
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.waitForTimeout(1000);
    const conDangNhap = await (async () => {
      const t = await parentCtx.newPage();
      await t.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
      const ok = /\/phu-huynh/.test(t.url());
      await t.close();
      return ok;
    })();
    check(
      'Bấm nút cũ sau khi bé vừa bị khoá: server từ chối, bố mẹ KHÔNG bị đăng xuất',
      !/be-dang-nhap/.test(p.url()) && conDangNhap,
      `${p.url()} · phiên bố mẹ ${conDangNhap ? 'còn' : 'MẤT'}`
    );

    // Mở lại trang trước khi bấm: đừng để phần dọn dẹp phụ thuộc vào nút đổi chữ tại chỗ.
    await tabKhac.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
    const moKhoa = tabKhac.locator(`#be-${CHILD_USER} button:has-text("Mở khoá tài khoản")`);
    if ((await moKhoa.count()) > 0) {
      await moKhoa.click();
      await tabKhac.waitForTimeout(2500);
    }
    await tabKhac.close();
  } else {
    check('Bấm nút cũ sau khi bé vừa bị khoá: server từ chối, bố mẹ KHÔNG bị đăng xuất', false, 'không có nút để thử');
  }
  await p.close();

  const dt = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await dt.addCookies(await parentCtx.cookies());
  const pd = await dt.newPage();
  await pd.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  const nut = pd.locator(`#be-${CHILD_USER} [data-testid=cho-be-dang-nhap] button`);
  const hop = (await nut.count()) ? await nut.boundingBox() : null;
  check(
    '390px: thẻ của bé có nút "Cho bé đăng nhập trên máy này", cao đủ tầm tay',
    hop !== null && hop.height >= 44,
    hop ? `cao ${Math.round(hop.height)}px` : 'không có nút'
  );

  if (hop) {
    await nut.tap();
    await pd.waitForURL(/be-dang-nhap/, { timeout: 15000 }).catch(() => {});
  }
  check('Chạm nút thì sang trang bé đăng nhập', /\/be-dang-nhap/.test(pd.url()), pd.url());
  const tenDien = (await pd.locator('#username').count()) ? await pd.inputValue('#username') : '(không có ô)';
  check('… tên đăng nhập của bé đã điền sẵn', tenDien === CHILD_USER, tenDien);

  /* Phiên bố mẹ phải CHẾT thật ở server, không chỉ mất cookie ở máy này: dùng
     `parentCtx`, context vẫn còn giữ cookie cũ. */
  const pc = await parentCtx.newPage();
  await pc.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
  check('… và phiên của bố mẹ đã huỷ ở server (cookie cũ không vào được /phu-huynh)', /\/dang-nhap/.test(pc.url()), pc.url());
  await pc.close();

  if ((await pd.locator('#password').count()) > 0) {
    await pd.locator('#password').tap();
    await pd.keyboard.type(CHILD_PASS);
    await pd.locator('[data-testid=auth-form] button[type=submit]').tap();
    await pd.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});
  }
  check(
    '… bé chỉ gõ mật khẩu là vào, thanh trên có "Đăng game"',
    !/be-dang-nhap/.test(pd.url()) && (await pd.locator('header a[href="/upload"]').count()) > 0,
    pd.url()
  );

  // `?ten=` chỉ nhận đúng dạng tên đăng nhập; thứ khác thì ô để trống.
  const lạ = await dt.newPage();
  await dt.clearCookies();
  await lạ.goto(`${APP}/be-dang-nhap?ten=${encodeURIComponent('"><b>x</b>')}`, { waitUntil: 'networkidle' });
  const giaTriLa = (await lạ.locator('#username').count()) ? await lạ.inputValue('#username') : '(không có ô)';
  check('?ten= sai dạng tên đăng nhập thì ô để trống', giaTriLa === '', JSON.stringify(giaTriLa));

  /*
   * Ô TÊN ĐIỀN SẴN, khi bé không để yên nó.
   *
   * Bé chưa chắc biết ô đã có tên: chạm vào rồi gõ tên mình. Trước đây con trỏ đặt ở cuối
   * nên tên nối thành `beminhbeminh` và báo sai. Tệ hơn, sau khi báo lỗi form bị React
   * reset về `defaultValue` — tức lại đúng tên điền sẵn — và `AuthForm` chỉ trả lại chữ
   * đã gõ vào ô TRỐNG, nên bé nhìn thấy một cái tên đúng cạnh câu "sai tên hoặc mật
   * khẩu" và không có cách nào hiểu vì sao.
   */
  const goLai = await dt.newPage();
  await goLai.goto(`${APP}/be-dang-nhap?ten=${CHILD_USER}`, { waitUntil: 'networkidle' });
  if ((await goLai.locator('#username').count()) > 0) {
    await goLai.locator('#username').tap();
    await goLai.keyboard.type(CHILD_USER);
  }
  const sauKhiCham = (await goLai.locator('#username').count()) ? await goLai.inputValue('#username') : '(không có ô)';
  check('Chạm vào ô tên điền sẵn rồi gõ lại tên mình: tên KHÔNG bị lặp', sauKhiCham === CHILD_USER, JSON.stringify(sauKhiCham));

  /* Cùng chuyện đó bằng chuột, trên máy tính: nhấp chuột đặt con trỏ khác chạm ngón tay. */
  const mayTinh = await browser.newContext();
  const goChuot = await mayTinh.newPage();
  await goChuot.goto(`${APP}/be-dang-nhap?ten=${CHILD_USER}`, { waitUntil: 'networkidle' });
  if ((await goChuot.locator('#username').count()) > 0) {
    await goChuot.locator('#username').click();
    await goChuot.keyboard.type(CHILD_USER);
  }
  const sauKhiNhap = (await goChuot.locator('#username').count()) ? await goChuot.inputValue('#username') : '(không có ô)';
  check('… và bằng chuột trên máy tính cũng không lặp', sauKhiNhap === CHILD_USER, JSON.stringify(sauKhiNhap));

  /* Bé cố ý sửa tên thành tên khác thì vẫn sửa được — chọn hết không được biến ô thành
     ô chỉ-đọc. Lần chạm THỨ HAI phải đặt được con trỏ như bình thường. */
  /* Không dùng phím End: trên macOS nó không đưa con trỏ về cuối ô. Đo đúng điều cần
     đo — chữ gõ thêm được CHÈN vào tên, không thay cả tên. */
  await goChuot.locator('#username').click().catch(() => {});
  await goChuot.keyboard.type('x').catch(() => {});
  const suaTiep = await goChuot.inputValue('#username').catch(() => '');
  check(
    '… nhưng lần nhấp thứ hai đặt con trỏ như ô thường (chữ gõ thêm được chèn, không thay cả tên)',
    suaTiep.length === CHILD_USER.length + 1 && suaTiep.replace('x', '') === CHILD_USER,
    JSON.stringify(suaTiep)
  );
  await mayTinh.close();

  const TEN_GO_NHAM = `${CHILD_USER}nham`;
  if ((await goLai.locator('#username').count()) > 0) {
    await goLai.fill('#username', TEN_GO_NHAM);
    await goLai.locator('#password').tap();
    await goLai.keyboard.type('khong-phai-mat-khau');
    await goLai.locator('[data-testid=auth-form] button[type=submit]').tap();
    await goLai.waitForSelector('[data-testid=auth-form] [role=alert]', { timeout: 15000 }).catch(() => {});
    await goLai.waitForTimeout(300);
  }
  const sauLoi = (await goLai.locator('#username').count()) ? await goLai.inputValue('#username') : '(không có ô)';
  check(
    'Báo lỗi xong, ô tên hiện ĐÚNG chữ bé vừa gõ, không nhảy về tên điền sẵn',
    (await goLai.locator('[data-testid=auth-form] [role=alert]').count()) > 0 && sauLoi === TEN_GO_NHAM,
    JSON.stringify(sauLoi)
  );
  await dt.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
