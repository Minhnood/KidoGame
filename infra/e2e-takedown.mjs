/**
 * Kiểm tra end-to-end trang điều khoản + luồng gỡ bản quyền.
 *
 * Cần:
 *   - app server đang chạy
 *   - đã chạy `pnpm db:seed` (bài test dùng tài khoản admin demo)
 *   - một file .sb3 hợp lệ để bé đăng game
 *
 * Chạy:
 *   SB3_FIXTURE=/tmp/meo-phieu-luu.sb3 node infra/e2e-takedown.mjs
 *
 * Đọc log mail (không bắt buộc, nhưng có thì kiểm được cả phần gửi thư):
 *   MAIL_LOG=/tmp/kg-mail.log SB3_FIXTURE=... node infra/e2e-takedown.mjs
 * với app server chạy dạng:
 *   pnpm --filter @kidogame/web dev > /tmp/kg-mail.log 2>&1
 *
 * LƯU Ý: bài test này dựng HAI game. Một để đi hết đường "khiếu nại đúng", một để
 * đi đường "bác bỏ rồi game hiện lại". Không dùng chung một game được, vì gỡ hẳn là
 * trạng thái không quay lui bằng luồng này.
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { batBuocMailLog, choMailToi, taoBoBamLink } from './e2e-mail.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const FIXTURE = process.env.SB3_FIXTURE ?? '';
/*
 * MAIL_LOG giờ BẮT BUỘC (trước đây chỉ để mở thêm hai phép kiểm mail): bài này phải
 * tạo tài khoản cho bé, mà `createChild` đòi phụ huynh đã xác minh email — và link xác
 * minh chỉ có trong thư.
 */
const MAIL_LOG = batBuocMailLog('e2e-takedown');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'demo@kidogame.local';
/* Khu quản trị trên origin riêng — xem `infra/e2e-admin-origin.mjs`. */
const ADMIN = process.env.ADMIN_ORIGIN ?? 'http://admin.localhost:3000';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'demo1234ab';

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-td-${suffix}@kidogame.test`;
const PARENT_PASS = 'matkhau-dai-1234';
const CHILD_USER = `etd${suffix}`;
const CHILD_PASS = 'be1234';
const CLAIMANT_EMAIL = `nguoi-goc-${suffix}@vidu.test`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!FIXTURE) {
  console.error('Cần SB3_FIXTURE=<đường dẫn .sb3> để bé có game mà khiếu nại.');
  process.exit(1);
}

const browser = await chromium.launch({ channel: 'chrome' });
const bamLinkXacMinh = taoBoBamLink(MAIL_LOG, { appOrigin: APP });
const newSession = () => browser.newContext({ viewport: { width: 1300, height: 1000 } });

const status = async (ctx, url) => {
  const p = await ctx.newPage();
  const res = await p.goto(url, { waitUntil: 'networkidle' });
  const code = res?.status();
  await p.close();
  return code;
};

/** Đọc log mail nếu có. Không có thì trả chuỗi rỗng và các phép kiểm mail tự bỏ qua. */
async function mailLog() {
  if (!MAIL_LOG) return '';
  return readFile(MAIL_LOG, 'utf8').catch(() => '');
}

/**
 * Gửi một yêu cầu gỡ.
 *
 * Điền cả ô cam đoan — nếu không thì `required` của trình duyệt chặn ngay tại chỗ và
 * bài test sẽ treo ở nút submit chứ không nhận được lỗi từ server.
 */
async function submitTakedown(page, { gameRef, email, evidence, attest = true }) {
  await page.goto(`${APP}/bao-cao-ban-quyen`, { waitUntil: 'networkidle' });
  await page.fill('#gameRef', gameRef);
  await page.fill('#claimantName', 'Người Làm Bản Gốc');
  await page.fill('#claimantEmail', email);
  await page.fill('#evidence', evidence);
  if (attest) await page.locator('[data-testid=takedown-attest]').check();
  await page.click('[data-testid=takedown-form] button[type=submit]');
  await page.waitForSelector('[data-testid=takedown-done]', { timeout: 20000 }).catch(() => {});
  return (await page.locator('[data-testid=takedown-done]').count()) > 0 ? 'da-nhan' : 'chua';
}

// ---------- Dựng dữ liệu: phụ huynh -> bé -> hai game ----------
const parentCtx = await newSession();
const childCtx = await newSession();
const anonCtx = await newSession();

const games = [];

{
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PARENT_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});

  // Xác minh email trước, không thì `createChild` từ chối.
  check('Xác minh được email phụ huynh', await bamLinkXacMinh(p));

  await p.fill('#displayName', 'Bé Bản Quyền');
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

  for (const label of ['A', 'B']) {
    await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
    await c.fill('#title', `Game bản quyền ${label} ${suffix}`);
    await c.setInputFiles('#file', FIXTURE);
    await c.click('[data-testid=upload-form] button[type=submit]');
    // Bước xem thử: bấm "Đăng game" mới thành game thật.
    await c.click('[data-testid=dang-game-that]', { timeout: 60000 }).catch(() => {});
    await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
    const url = c.url();
    games.push({ url, id: url.split('/game/')[1] ?? '' });
  }
  await c.close();

  check(
    'Dựng được hai game để thử hai nhánh phán xử',
    games.length === 2 && games.every((g) => g.id),
    games.map((g) => g.id).join(', ')
  );
}

if (!games.every((g) => g.id)) {
  console.error('Không đăng được game, dừng bài test.');
  await browser.close();
  process.exit(1);
}

// ---------- Trang điều khoản ----------
{
  const p = await anonCtx.newPage();
  const res = await p.goto(`${APP}/dieu-khoan`, { waitUntil: 'networkidle' });
  check('Khách chưa đăng nhập mở được /dieu-khoan', res?.status() === 200, `HTTP ${res?.status()}`);

  const text = await p.locator('article').innerText();
  // Không kiểm từng chữ trong văn bản — nó sẽ được sửa. Kiểm những MỤC bắt buộc phải có.
  for (const [id, label] of [
    ['tai-khoan', 'tài khoản'],
    ['ban-quyen', 'bản quyền'],
    ['quy-trinh-go', 'quy trình xử lý yêu cầu gỡ'],
    ['du-lieu', 'dữ liệu lưu giữ'],
    ['lien-he', 'liên hệ'],
  ]) {
    check(
      `Điều khoản có mục ${label}`,
      (await p.locator(`[data-testid=terms-${id}]`).count()) > 0
    );
  }
  check(
    'Điều khoản nói rõ game công khai ngay, không duyệt trước',
    /không qua bước duyệt trước/i.test(text)
  );
  check(
    'Điều khoản nêu hạn xử lý khiếu nại bằng số ngày cụ thể',
    /\d+\s*ngày làm việc/i.test(text)
  );
  check(
    'Điều khoản có email liên hệ',
    (await p.locator('[data-testid=terms-operator-email] a[href^="mailto:"]').count()) > 0
  );

  check(
    'Chân trang có link Điều khoản trên mọi trang',
    (await p.locator('[data-testid=footer-dieu-khoan]').count()) > 0
  );
  check(
    'Chân trang có link Yêu cầu gỡ bản quyền',
    (await p.locator('[data-testid=footer-bao-cao-ban-quyen]').count()) > 0
  );
  await p.close();
}

// ---------- Lối vào từ trang game ----------
{
  const p = await anonCtx.newPage();
  await p.goto(games[0].url, { waitUntil: 'networkidle' });
  await p.locator('[data-testid=report-box] summary').click();
  const link = p.locator('[data-testid=report-takedown-link]');
  check('Hộp báo cáo có lối riêng cho người giữ bản quyền', (await link.count()) > 0);

  await link.click();
  await p.waitForURL(/bao-cao-ban-quyen/, { timeout: 20000 }).catch(() => {});
  const prefilled = await p.inputValue('#gameRef').catch(() => '');
  check(
    'Đi từ trang game sang thì ô "Game nào?" đã điền sẵn',
    prefilled.includes(games[0].id),
    prefilled
  );
  await p.close();
}

// ---------- Từ chối đầu vào sai ----------
{
  const p = await anonCtx.newPage();

  check(
    'Link game không tồn tại thì bị từ chối',
    (await submitTakedown(p, {
      gameRef: `${APP}/game/khong-co-that-${suffix}`,
      email: CLAIMANT_EMAIL,
      evidence: 'Tôi là tác giả bản gốc, bản gốc ở https://scratch.mit.edu/projects/1',
    })) === 'chua'
  );

  check(
    'Căn cứ quá sơ sài thì bị từ chối',
    (await submitTakedown(p, {
      gameRef: games[0].url,
      email: CLAIMANT_EMAIL,
      evidence: 'cua toi',
    })) === 'chua'
  );

  /*
   * Khoanh vào TRONG form. `[role=alert]` trần khớp nhiều hơn một phần tử trên
   * trang, và Playwright ở chế độ strict sẽ ném lỗi thay vì chọn bừa — phép kiểm
   * sẽ đỏ vì lý do không liên quan gì tới thứ đang được kiểm.
   */
  const err = await p
    .locator('[data-testid=takedown-form] [role=alert]')
    .last()
    .innerText()
    .catch(() => '');
  check('Có thông báo lỗi giải thích cần điền gì', err.length > 10, err.slice(0, 60));

  /*
   * Phép kiểm chống hồi quy cho một lỗi ĐÃ TỪNG CÓ THẬT.
   *
   * React reset form sau khi một action chạy xong, kể cả khi action trả về lỗi. Với ô
   * nhập uncontrolled, người khiếu nại gõ xong một đoạn dài, bấm gửi, gõ sai mỗi cái
   * link, và mất sạch. Phần lớn người ta sẽ bỏ luôn — một yêu cầu gỡ có thật không bao
   * giờ tới nơi. Các ô chữ vì vậy được điều khiển bằng state (xem takedown-form.tsx).
   */
  check(
    'Gửi hỏng thì chữ đã gõ vẫn còn nguyên, không phải gõ lại',
    (await p.inputValue('#evidence')) === 'cua toi' &&
      (await p.inputValue('#claimantEmail')) === CLAIMANT_EMAIL,
    `evidence="${await p.inputValue('#evidence')}"`
  );
  // Riêng ô cam đoan thì CỐ Ý bị bỏ tích: lời cam đoan nên được khẳng định lại mỗi lần bấm gửi.
  check(
    'Ô cam đoan bị bỏ tích sau lần gửi hỏng, phải khẳng định lại',
    (await p.locator('[data-testid=takedown-attest]').isChecked()) === false
  );

  check('Game vẫn hiện bình thường sau các lần gửi hỏng', (await status(anonCtx, games[0].url)) === 200);
  await p.close();
}

// ---------- Nhánh 1: khiếu nại đúng -> ẩn ngay -> admin gỡ hẳn ----------
const adminCtx = await newSession();
const admin = await adminCtx.newPage();
{
  const p = await anonCtx.newPage();
  check(
    'Gửi yêu cầu gỡ hợp lệ thì nhận xác nhận',
    (await submitTakedown(p, {
      gameRef: games[0].url,
      email: CLAIMANT_EMAIL,
      evidence: 'Tôi là tác giả bản gốc.\nBản gốc: https://scratch.mit.edu/projects/123456',
    })) === 'da-nhan'
  );

  check('Game bị ẩn NGAY khi nhận yêu cầu, khách vào trả 404', (await status(anonCtx, games[0].url)) === 404);

  /*
   * Phụ huynh KHÔNG được lật lệnh ẩn này.
   *
   * Đã từng là lỗ thật, dựng lại được bằng luồng thật: yêu cầu gỡ ẩn game xong, phụ
   * huynh bấm "Hiện lại" một cái là game công khai trở lại, không lỗi gì — trong khi
   * /dieu-khoan hứa công khai với người khiếu nại là ẩn ngay và trả lời trong hạn.
   *
   * Còn một hệ quả khó thấy hơn nữa: lúc admin bác khiếu nại, `adminResolveTakedown`
   * tính "đã cho hiện lại chưa" bằng điều kiện `status: 'HIDDEN'`. Game đã bị phụ huynh
   * bật lại thì điều kiện không khớp và người khiếu nại nhận thư nói "game vẫn đang ẩn"
   * trong khi nó đang chạy công khai.
   */
  {
    const ph = await parentCtx.newPage();
    await ph.goto(`${APP}/phu-huynh`, { waitUntil: 'networkidle' });
    const row = ph.locator('li', { has: ph.locator(`a[href="/game/${games[0].id}"]`) }).last();
    check(
      'Phụ huynh KHÔNG có nút bật lại game đang bị khiếu nại bản quyền',
      (await row.locator('[data-testid=game-visibility] button').count()) === 0
    );
    check(
      'Trang phụ huynh nói rõ vì sao game bị ẩn',
      /yêu cầu gỡ bản quyền/.test(await row.innerText())
    );
    check('Game vẫn 404 với khách', (await status(anonCtx, games[0].url)) === 404);
    await ph.close();
  }

  check(
    'Gửi trùng vẫn thấy xác nhận, không lộ là đã có người gửi',
    (await submitTakedown(p, {
      gameRef: games[0].url,
      email: CLAIMANT_EMAIL,
      evidence: 'Tôi là tác giả bản gốc.\nBản gốc: https://scratch.mit.edu/projects/123456',
    })) === 'da-nhan'
  );
  await p.close();

  const log = await mailLog();
  if (log) {
    check('Có mail báo cho phụ huynh biết game của bé đang tạm ẩn', log.includes(PARENT_EMAIL));
  }

  /*
   * Hai cửa: site cho quyền đọc (xem game đã ẩn), quản trị cho quyền ghi. Xem chú
   * thích dài hơn trong `e2e-moderation.mjs`.
   */
  await admin.goto(`${APP}/dang-nhap`, { waitUntil: 'networkidle' });
  await admin.fill('#email', ADMIN_EMAIL);
  await admin.fill('#password', ADMIN_PASS);
  await admin.click('[data-testid=auth-form] button[type=submit]');
  await admin.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});

  await admin.goto(`${ADMIN}/admin/dang-nhap`, { waitUntil: 'networkidle' });
  await admin.fill('#email', ADMIN_EMAIL);
  await admin.fill('#password', ADMIN_PASS);
  await admin.click('[data-testid=auth-form] button[type=submit]');
  await admin.waitForURL((u) => u.pathname === '/admin', { timeout: 20000 }).catch(() => {});

  await admin.goto(`${ADMIN}/admin`, { waitUntil: 'networkidle' });
  const queue = admin.locator('[data-testid=admin-takedowns]');
  check('Trang kiểm duyệt có hàng đợi yêu cầu gỡ', (await queue.count()) > 0);

  const queueText = await queue.innerText();
  check('Hàng đợi hiện email người khiếu nại để còn liên hệ', queueText.includes(CLAIMANT_EMAIL));
  check('Hàng đợi hiện hạn phải trả lời', /hạn trả lời/i.test(queueText));
  check(
    'Gửi trùng KHÔNG tạo thêm hàng thứ hai trong hàng đợi',
    (await admin.locator('[data-testid=admin-takedown]').count()) === 1,
    `${await admin.locator('[data-testid=admin-takedown]').count()} hàng`
  );

  const evidence = await admin.locator('[data-testid=admin-takedown-evidence]').innerText();
  check('Căn cứ giữ nguyên xuống dòng người gửi đã viết', evidence.split('\n').length >= 2);

  const row = admin.locator('[data-testid=admin-takedown]').first();
  await row.locator('[data-testid=takedown-accept]').click();
  await row.locator('textarea[name=note]').fill('Đã đối chiếu với bản gốc trên Scratch.');
  await row.locator('[data-testid=takedown-accept-confirm]').click();
  await admin.waitForTimeout(3000);

  check('Chấp nhận xong thì hàng đợi rỗng', (await admin.locator('[data-testid=admin-takedown]').count()) === 0);
  check('Game bị gỡ hẳn, khách vẫn 404', (await status(anonCtx, games[0].url)) === 404);

  await admin.goto(`${ADMIN}/admin?loc=da-go`, { waitUntil: 'networkidle' });
  const removed = admin.locator(`[data-testid=admin-game][data-game-id="${games[0].id}"]`);
  check('Game nằm trong bộ lọc "Đã gỡ"', (await removed.count()) > 0);

  await removed.locator('[data-testid=admin-log] summary').click();
  const logText = await removed.locator('[data-testid=admin-log]').innerText();
  check('Lịch sử ghi lần tạm ẩn vì yêu cầu gỡ', /tạm ẩn vì có yêu cầu gỡ/i.test(logText));
  check('Lịch sử ghi lần admin chấp nhận yêu cầu gỡ', /chấp nhận yêu cầu gỡ/i.test(logText));
  check('Vết chấp nhận ghi rõ admin nào làm', logText.includes(ADMIN_EMAIL));

  /*
   * Đường thứ hai dẫn tới REMOVED, và nó xoá file gốc của bé y hệt đường kia — nên
   * phụ huynh ở đây cũng phải đọc được mình còn bao nhiêu ngày.
   *
   * CỐ Ý KHÔNG đòi có link tải trong lá thư này, khác với thư của `adminRemoveGame`:
   * game vừa bị kết luận là có nội dung của người khác, nên việc có tự tay gửi đi một
   * link tải hay không là quyết định của bên vận hành, không phải của một phép kiểm.
   * Nếu sau này đổi ý và thêm link, phép kiểm này vẫn xanh — nó canh cái hạn, thứ mà
   * cả hai đường đều phải nói ra.
   */
  check(
    'Chấp nhận gỡ thì thư gửi phụ huynh có nói hạn xoá file gốc',
    await choMailToi(MAIL_LOG, PARENT_EMAIL, /còn được giữ tới ngày \d{1,2}\/\d{1,2}\/\d{4}/)
  );
}

// ---------- Nhánh 2: khiếu nại không đủ căn cứ -> game hiện lại ----------
{
  const p = await anonCtx.newPage();
  check(
    'Gửi yêu cầu cho game thứ hai',
    (await submitTakedown(p, {
      gameRef: games[1].id, // cố ý dùng MÃ trần chứ không phải link, phải nhận cả hai dạng
      email: `khac-${CLAIMANT_EMAIL}`,
      evidence: 'Tôi nghĩ game này giống bài của tôi ở https://vidu.test/ban-goc',
    })) === 'da-nhan'
  );
  await p.close();

  check('Nhận mã game trần cũng ẩn được game', (await status(anonCtx, games[1].url)) === 404);

  await admin.goto(`${ADMIN}/admin`, { waitUntil: 'networkidle' });
  const row = admin.locator('[data-testid=admin-takedown]').first();
  await row.locator('[data-testid=takedown-reject]').click();
  await row.locator('textarea[name=note]').fill('Hai game khác nhau hoàn toàn.');
  await row.locator('[data-testid=takedown-reject-confirm]').click();
  await admin.waitForTimeout(3000);

  check('Bác bỏ xong thì game hiện lại cho khách', (await status(anonCtx, games[1].url)) === 200);
  check('Hàng đợi rỗng sau khi bác bỏ', (await admin.locator('[data-testid=admin-takedown]').count()) === 0);

  await admin.goto(`${ADMIN}/admin?loc=tat-ca`, { waitUntil: 'networkidle' });
  const back = admin.locator(`[data-testid=admin-game][data-game-id="${games[1].id}"]`);
  await back.locator('[data-testid=admin-log] summary').click();
  const logText = await back.locator('[data-testid=admin-log]').innerText();
  check('Lịch sử ghi lần bác bỏ và việc cho hiện lại', /bác bỏ yêu cầu gỡ/i.test(logText));

  const log = await mailLog();
  if (log) {
    check('Có mail báo kết quả cho người khiếu nại', log.includes(`khac-${CLAIMANT_EMAIL}`));
  }
}

// ---------- Game đã gỡ hẳn thì không nhận khiếu nại nữa ----------
{
  const p = await anonCtx.newPage();
  check(
    'Game đã gỡ hẳn thì từ chối nhận yêu cầu mới',
    (await submitTakedown(p, {
      gameRef: games[0].url,
      email: `nguoi-thu-ba-${CLAIMANT_EMAIL}`,
      evidence: 'Tôi cũng cho rằng game này chép của tôi, bản gốc ở https://vidu.test/x',
    })) === 'chua'
  );
  await p.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
