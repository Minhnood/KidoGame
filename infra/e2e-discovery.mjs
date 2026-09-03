/**
 * Kiểm tra end-to-end phần khám phá: tìm kiếm, lọc theo tag, lọc theo tuổi (M3).
 *
 * Phép kiểm quan trọng nhất là TÌM KHÔNG DẤU: trẻ gõ "meo" phải ra "Mèo bay".
 * Nếu chỗ đó hỏng thì với một đứa bé, ô tìm kiếm coi như không dùng được.
 *
 * Chạy:
 *   SB3_FIXTURE=/tmp/meo-phieu-luu.sb3 node infra/e2e-discovery.mjs
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { batBuocMailLog, taoBoBamLink } from './e2e-mail.mjs';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
/*
 * Cần MAIL_LOG dù bài này chẳng kiểm gì về mail: nó phải tạo tài khoản cho bé, mà
 * `createChild` đòi phụ huynh đã xác minh email, và link xác minh chỉ có trong thư.
 */
const MAIL_LOG = batBuocMailLog('e2e-discovery');
const FIXTURE = process.env.SB3_FIXTURE ?? '';

const suffix = randomBytes(4).toString('hex');
const PARENT_EMAIL = `e2e-kham-pha-${suffix}@kidogame.test`;
const PARENT_PASS = 'matkhau-dai-1234';
const CHILD_USER = `ekp${suffix}`;
const CHILD_PASS = 'be1234';

/** Bé 9 tuổi -> rơi vào khung 8–10. */
const CHILD_AGE = 9;
const BIRTH_YEAR = new Date().getFullYear() - CHILD_AGE;

const TITLE = `Mèo bay ${suffix}`;
const TITLE_NO_DIACRITICS = `meo bay ${suffix}`;
const TAG = 'phieu-luu';
const OTHER_TAG = 'hoc-tap';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (!FIXTURE) {
  console.error('Cần SB3_FIXTURE=<đường dẫn .sb3>');
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'chrome' });
const bamLinkXacMinh = taoBoBamLink(MAIL_LOG, { appOrigin: APP });
const newSession = () => browser.newContext({ viewport: { width: 1300, height: 1000 } });

const anon = await newSession();

/** Mở trang chủ với bộ lọc, trả về danh sách id game hiện ra. */
async function browse(params) {
  const p = await anon.newPage();
  const qs = new URLSearchParams(params).toString();
  await p.goto(`${APP}/${qs ? `?${qs}` : ''}`, { waitUntil: 'networkidle' });
  const hrefs = await p.locator('[data-testid=game-card]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('href') ?? '')
  );
  const emptyState = (await p.locator('text=Không tìm thấy game nào khớp').count()) > 0;
  await p.close();
  return { ids: hrefs.map((h) => h.replace('/game/', '')), emptyState };
}

// ---------- Dựng dữ liệu ----------
let gameId = '';
{
  const parentCtx = await newSession();
  const p = await parentCtx.newPage();
  await p.goto(`${APP}/dang-ky`, { waitUntil: 'networkidle' });
  await p.fill('#email', PARENT_EMAIL);
  await p.fill('#password', PARENT_PASS);
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});

  check('Xác minh được email phụ huynh', await bamLinkXacMinh(p));

  await p.fill('#displayName', 'Bé Khám Phá');
  await p.fill('#username', CHILD_USER);
  await p.fill('#password', CHILD_PASS);
  await p.fill('#birthYear', String(BIRTH_YEAR));
  await p.click('[data-testid=auth-form] button[type=submit]');
  await p.waitForTimeout(2500);
  await parentCtx.close();

  const childCtx = await newSession();
  const c = await childCtx.newPage();
  await c.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await c.fill('#username', CHILD_USER);
  await c.fill('#password', CHILD_PASS);
  await c.click('[data-testid=auth-form] button[type=submit]');
  await c.waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 }).catch(() => {});

  await c.goto(`${APP}/upload`, { waitUntil: 'networkidle' });
  await c.fill('#title', TITLE);
  await c.setInputFiles('#file', FIXTURE);

  check(
    'Form đăng game có chỗ chọn tag',
    (await c.locator('[data-testid=tag-picker]').count()) > 0
  );
  await c.locator(`[data-testid=tag-picker] input[value="${TAG}"]`).check();

  await c.click('[data-testid=upload-form] button[type=submit]');
  await c.waitForURL(/\/game\//, { timeout: 60000 }).catch(() => {});
  gameId = c.url().split('/game/')[1] ?? '';
  check('Đăng được game kèm tag', !!gameId, gameId);
  await childCtx.close();
}

if (!gameId) {
  console.error('Không đăng được game, dừng bài test.');
  await browser.close();
  process.exit(1);
}

// ---------- Trang chủ có đủ bộ lọc ----------
{
  const p = await anon.newPage();
  await p.goto(APP, { waitUntil: 'networkidle' });
  check('Trang chủ có ô tìm kiếm', (await p.locator('[data-testid=search-form]').count()) > 0);
  check('Trang chủ có bộ lọc tag', (await p.locator('[data-testid=tag-filters]').count()) > 0);
  check('Trang chủ có bộ lọc tuổi', (await p.locator('[data-testid=age-filters]').count()) > 0);
  await p.close();
}

// ---------- Tìm kiếm ----------
{
  const withMarks = await browse({ q: TITLE });
  check('Tìm CÓ dấu ra đúng game', withMarks.ids.includes(gameId), `${withMarks.ids.length} kết quả`);

  // Đây là phép kiểm quan trọng nhất của cả bộ.
  const withoutMarks = await browse({ q: TITLE_NO_DIACRITICS });
  check(
    'Tìm KHÔNG dấu vẫn ra game có dấu ("meo" -> "Mèo")',
    withoutMarks.ids.includes(gameId),
    `${withoutMarks.ids.length} kết quả`
  );

  const nonsense = await browse({ q: `khongcogamenaoten${suffix}` });
  check('Tìm không ra thì hiện trạng thái rỗng', nonsense.ids.length === 0 && nonsense.emptyState);
}

// ---------- Lọc theo tag ----------
{
  const inTag = await browse({ tag: TAG });
  check(`Lọc tag "${TAG}" có chứa game vừa đăng`, inTag.ids.includes(gameId), `${inTag.ids.length} game`);

  const otherTag = await browse({ tag: OTHER_TAG });
  check(
    `Lọc tag "${OTHER_TAG}" KHÔNG chứa game đó`,
    !otherTag.ids.includes(gameId),
    `${otherTag.ids.length} game`
  );
}

// ---------- Lọc theo tuổi ----------
{
  const right = await browse({ tuoi: '8-10' });
  check(
    `Lọc tuổi 8–10 có game của bé ${CHILD_AGE} tuổi`,
    right.ids.includes(gameId),
    `${right.ids.length} game`
  );

  const wrong = await browse({ tuoi: '14+' });
  check(
    'Lọc tuổi 14+ KHÔNG có game đó',
    !wrong.ids.includes(gameId),
    `${wrong.ids.length} game`
  );
}

// ---------- Các bộ lọc cộng dồn được ----------
{
  const both = await browse({ q: TITLE_NO_DIACRITICS, tag: TAG, tuoi: '8-10' });
  check('Ba bộ lọc dùng cùng lúc vẫn ra game', both.ids.includes(gameId), `${both.ids.length} game`);

  const conflicting = await browse({ q: TITLE_NO_DIACRITICS, tag: OTHER_TAG });
  check(
    'Bộ lọc mâu thuẫn nhau thì ra rỗng (lọc là AND, không phải OR)',
    !conflicting.ids.includes(gameId),
    `${conflicting.ids.length} game`
  );
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
