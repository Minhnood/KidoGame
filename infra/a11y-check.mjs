/**
 * Kiểm khả năng dùng bằng BÀN PHÍM và trình đọc màn hình.
 *
 * VÌ SAO tách riêng, không nhét vào `e2e-check.mjs`: đây là một chiều quan tâm
 * khác, đúng như `contrast-check.mjs` đã tách. Tương phản và bàn phím hỏng theo
 * hai kiểu khác nhau, và người phải trả giá cũng khác nhau.
 *
 * VÌ SAO đáng có: dự án đã đo tương phản tới AAA cho mắt trẻ và đã khai riêng
 * token `--color-focus`. Nhưng vòng focus có tồn tại trong CSS không có nghĩa là
 * nó HIỆN trên mọi phần tử, và một trang tab được không có nghĩa là tab được đến
 * chỗ cần đến. Có bé chỉ dùng bàn phím, có bé khó điều khiển chuột — với các bé
 * đó thì đây không phải chi tiết phụ, đây là có vào được hay không.
 *
 * Chạy (cần dev server ở cổng 3000):
 *   node infra/a11y-check.mjs
 *
 * Đổi đích:  APP=https://app.localhost node infra/a11y-check.mjs
 */
import { chromium } from 'playwright';

const APP = process.env.APP ?? 'http://localhost:3000';
const CHILD_USER = process.env.DEMO_CHILD ?? 'beminh';
const CHILD_PASSWORD = process.env.DEMO_CHILD_PASSWORD ?? 'be1234';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });
const guest = await browser.newContext({ ignoreHTTPSErrors: true });

/*
 * Context riêng cho bé. Cần vì bé đã đăng nhập thì /dang-nhap CHUYỂN HƯỚNG về
 * trang chủ — đo bằng một context đã đăng nhập là đo trang chủ ba lần rồi tưởng
 * ba trang đăng nhập đều giống nhau. Đã vấp đúng vậy ở lần soi đầu.
 */
const child = await browser.newContext({ ignoreHTTPSErrors: true });
{
  const p = await child.newPage();
  await p.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await p.fill('input[name=username]', CHILD_USER);
  await p.fill('input[name=password]', CHILD_PASSWORD);
  await p.locator('main button[type=submit]').first().click();
  await p.waitForURL((u) => !u.pathname.includes('be-dang-nhap'), { timeout: 20000 }).catch(() => {});
  await p.close();
}

// ---------------------------------------------------------------------------
// Link nhảy tới nội dung
// ---------------------------------------------------------------------------
console.log('\n── Link nhảy tới nội dung ──────────────────────────────────');
{
  const page = await guest.newPage();
  await page.goto(APP, { waitUntil: 'networkidle' });

  // Ẩn với người dùng chuột, nhưng KHÔNG được `display:none` — thế thì bàn phím
  // cũng không tới được, và link thành vô dụng.
  const atRest = await page.evaluate(() => {
    const a = document.querySelector('a[href="#noi-dung"]');
    if (!a) return 'không có link';
    const box = a.getBoundingClientRect();
    return box.width <= 1 && box.height <= 1 ? 'ẩn' : `hiện ${Math.round(box.width)}×${Math.round(box.height)}`;
  });
  check('Chưa focus thì người dùng chuột không thấy', atRest === 'ẩn', atRest);

  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      href: el?.getAttribute('href'),
      text: el?.textContent?.trim().slice(0, 40),
      width: Math.round(el.getBoundingClientRect().width),
    };
  });
  check('Tab đầu tiên rơi vào link nhảy', first.href === '#noi-dung', first.text);
  check('Được focus thì nó hiện ra', first.width > 20, `rộng ${first.width}px`);

  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const landed = await page.evaluate(() => ({
    id: document.activeElement?.id,
    tag: document.activeElement?.tagName,
  }));
  /*
   * Đây là phép kiểm đáng giá nhất của cả mục này.
   *
   * Thiếu `tabIndex={-1}` trên <main> thì trình duyệt vẫn CUỘN tới nội dung —
   * trông như link hoạt động — nhưng focus còn ở link cũ, nên lần Tab tiếp theo
   * quay về thanh điều hướng, đúng con đường vừa muốn bỏ qua. Phần lớn link nhảy
   * trên mạng hỏng theo đúng kiểu này, và kiểm bằng mắt thì không thấy.
   */
  check('Bấm Enter thì focus chuyển vào chính <main>', landed.id === 'noi-dung', `${landed.tag}#${landed.id}`);

  await page.keyboard.press('Tab');
  const next = await page.evaluate(() => ({
    inMain: !!document.activeElement?.closest('main'),
    text: (document.activeElement?.textContent || '').trim().slice(0, 30),
  }));
  check('Tab tiếp theo ở TRONG nội dung, không quay về nav', next.inMain, next.text);
  await page.close();
}

// ---------------------------------------------------------------------------
// Từng trang
// ---------------------------------------------------------------------------
const PAGES = [
  ['/', 'khách'],
  ['/dang-nhap', 'khách'],
  ['/be-dang-nhap', 'khách'],
  ['/dang-ky', 'khách'],
  ['/quen-mat-khau', 'khách'],
  ['/dieu-khoan', 'khách'],
  ['/bao-cao-ban-quyen', 'khách'],
  ['/upload', 'bé'],
];

console.log('\n── Từng trang ──────────────────────────────────────────────');
for (const [path, role] of PAGES) {
  const page = await (role === 'bé' ? child : guest).newPage();
  await page.goto(APP + path, { waitUntil: 'networkidle' });

  const landedPath = new URL(page.url()).pathname;
  if (landedPath !== path) {
    check(`${path} mở đúng trang đó`, false, `bị chuyển hướng sang ${landedPath}`);
    await page.close();
    continue;
  }

  const info = await page.evaluate(() => {
    const h1 = [...document.querySelectorAll('h1')];
    const unlabeled = [];
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      const labelled =
        (el.id && document.querySelector(`label[for="${el.id}"]`)) ||
        el.closest('label') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby');
      if (!labelled) unlabeled.push(`${el.tagName}[name=${el.name || '?'}]`);
    }
    return {
      lang: document.documentElement.lang,
      h1Count: h1.length,
      h1Text: h1[0]?.textContent.trim().slice(0, 30) ?? '',
      imgNoAlt: document.querySelectorAll('img:not([alt])').length,
      unlabeled,
      main: document.querySelectorAll('main').length,
    };
  });

  // Trình đọc màn hình phát âm theo `lang`. Sai thì tiếng Việt đọc bằng giọng Anh.
  const problems = [
    info.lang !== 'vi' ? `lang=${info.lang || 'thiếu'}` : null,
    // Đúng MỘT h1: nhiều h1 làm trình đọc màn hình mất mốc "trang này nói về gì".
    info.h1Count !== 1 ? `${info.h1Count} thẻ h1` : null,
    info.imgNoAlt ? `${info.imgNoAlt} ảnh thiếu alt` : null,
    info.unlabeled.length ? `ô nhập không label: ${info.unlabeled.join(', ')}` : null,
    info.main !== 1 ? `${info.main} thẻ main` : null,
  ].filter(Boolean);

  // Vòng focus phải NHÌN THẤY trên mọi phần tử tab tới được. Tồn tại trong CSS
  // không đủ — một `outline: none` ở đâu đó là đủ để mất dấu bàn phím.
  const invisible = [];
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const el = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      /*
       * Bỏ qua `<nextjs-portal>`: đó là lớp overlay báo lỗi của Next ở chế độ
       * dev, không phải phần của sản phẩm, và nó không có vòng focus. Không loại
       * ra thì MỌI trang đều báo đỏ ở dev vì một thứ không tồn tại trên
       * production — kiểu báo động giả làm người ta bỏ luôn cả bộ kiểm.
       */
      if (e.tagName === 'NEXTJS-PORTAL' || e.closest('nextjs-portal')) return { skip: true };
      const s = getComputedStyle(e);
      const ring =
        (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
      return {
        key: e.tagName + ':' + (e.getAttribute('aria-label') || e.textContent || e.name || '').trim().slice(0, 20),
        ring,
      };
    });
    if (!el) break;
    if (el.skip) continue;
    if (seen.has(el.key)) break; // đã vòng lại đầu
    seen.add(el.key);
    if (!el.ring) invisible.push(el.key);
  }
  if (invisible.length) problems.push(`không thấy vòng focus: ${invisible.join(', ')}`);

  check(
    `[${role}] ${path}`,
    problems.length === 0,
    problems.length ? problems.join(' | ') : `h1 "${info.h1Text}", ${seen.size} điểm tab`
  );
  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
