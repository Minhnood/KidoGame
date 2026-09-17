/**
 * Ảnh bìa không tải được thì hiện ô thay thế — chữ cái đầu tên game trên nền màu theo tên.
 *
 * VÌ SAO CẦN. Trước đây ảnh bìa là `<img>` trần: file mất, player origin sập hay mạng rớt
 * thì thẻ game hiện icon ảnh vỡ của trình duyệt. Fen thấy đúng cảnh đó trên máy dev (game
 * có file bìa 3 byte `ff d8 ff`, sót lại từ một lượt thử cho đỏ) và chốt kiểu thay thế.
 *
 * ĐỐI CHIẾU VỚI SỰ THẬT, không đếm ô thay thế trần. Với mỗi thẻ, bộ này lấy mã bìa từ DB
 * rồi tự giải mã ảnh đó trong trình duyệt; thẻ phải hiện ô thay thế KHI VÀ CHỈ KHI ảnh đó
 * hỏng thật. Chỉ đòi "có ô thay thế khi chặn ảnh" thì một bản thay-thế-mọi-lúc vẫn xanh;
 * chỉ đòi "không có ô thay thế khi không chặn" thì DB dev có sẵn một bìa hỏng thật làm đỏ oan.
 *
 * Chạy (cần app + player đang chạy, `psql`, tài khoản demo):
 *   node infra/e2e-bia-hong.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@kidogame.local';
const DEMO_PASS = process.env.DEMO_PASSWORD ?? 'demo1234ab';

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

/** Chữ cái đầu viết hoa, cùng cách với `AnhBia` (theo grapheme). */
const chuDau = (ten) =>
  ([...new Intl.Segmenter('vi', { granularity: 'grapheme' }).segment(ten.trim())][0]?.segment ?? '?').toLocaleUpperCase('vi');

/** Tương phản chữ trắng trên một màu `rgb(r, g, b)`. */
function tuongPhanChuTrang(rgb) {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (L + 0.05);
}

/** Cuộn hết trang cho ảnh `loading="lazy"` tải, chờ mọi ảnh xong, rồi đọc từng thẻ. */
async function docThe(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
    window.scrollTo(0, 0);
  });
  await page
    .waitForFunction(() => [...document.querySelectorAll('[data-testid=game-card] img')].every((i) => i.complete), null, { timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  return page.$$eval('[data-testid=game-card]', (the) =>
    the.map((c) => {
      const img = c.querySelector('img');
      const tt = c.querySelector('[data-bia-thay-the]');
      const ps = c.querySelectorAll('p');
      const hop = (img ?? tt)?.getBoundingClientRect();
      return {
        id: (c.getAttribute('href') ?? '').split('/game/')[1] ?? '',
        ten: ps[ps.length - 2]?.textContent?.trim() ?? '',
        src: img?.getAttribute('src') ?? null,
        anhTaiDuoc: !!img && img.naturalWidth > 0,
        coImg: !!img,
        thayThe: !!tt,
        chu: tt?.textContent?.trim() ?? null,
        nen: tt ? getComputedStyle(tt).backgroundColor : null,
        ariaHidden: tt?.getAttribute('aria-hidden') ?? null,
        rong: hop ? Math.round(hop.width) : 0,
        cao: hop ? Math.round(hop.height) : 0,
      };
    })
  );
}

/** Ảnh ở từng URL có giải mã được thật không — hỏi chính trình duyệt, không đoán theo mã HTTP. */
const giaiMaDuoc = (page, urls) =>
  page.evaluate(
    (ds) =>
      Promise.all(
        ds.map(
          (u) =>
            new Promise((r) => {
              const i = new Image();
              i.onload = () => r([u, i.naturalWidth > 0]);
              i.onerror = () => r([u, false]);
              i.src = u;
            })
        )
      ).then(Object.fromEntries),
    urls
  );

const browser = await chromium.launch({ channel: 'chrome' });
const newCtx = (opt = {}) => browser.newContext({ viewport: { width: 1300, height: 1000 }, ...opt });

// ---------- A. Không chặn gì: ô thay thế khi và chỉ khi bìa hỏng thật ----------
const ctxA = await newCtx();
const pA = await ctxA.newPage();
await pA.goto(`${APP}/`, { waitUntil: 'networkidle' });
const theA = await docThe(pA);
check('Trang chủ có thẻ game để đo', theA.length > 0, `${theA.length} thẻ`);

/* Gốc player lấy từ biến môi trường, KHÔNG từ `src` của ảnh trên trang: bản lỗi "lúc nào
   cũng hiện ô thay thế" thì trang không còn `src` nào, gốc thành rỗng, mọi URL đối chiếu
   trỏ nhầm vào app và "sự thật" thành "mọi bìa đều hỏng" — phép khi-và-chỉ-khi xanh theo.
   Đo được đúng như vậy ở lượt thử cho đỏ đầu tiên. */
const goc = process.env.PLAYER_ORIGIN ?? 'http://127.0.0.1:3001';
const shaCua = Object.fromEntries(
  sql(`select id || ' ' || "thumbSha256" from "Game" where id in (${theA.map((t) => `'${t.id}'`).join(',') || "''"})`)
    .split('\n')
    .filter(Boolean)
    .map((d) => d.split(' '))
);
const urlCua = (id) => `${goc}/thumb/${shaCua[id].slice(0, 2)}/${shaCua[id]}.webp`;
const that = await giaiMaDuoc(pA, [...new Set(theA.filter((t) => shaCua[t.id]).map((t) => urlCua(t.id)))]);
const lechA = theA.filter((t) => t.thayThe === that[urlCua(t.id)]);
check(
  'Không chặn gì: thẻ hiện ô thay thế KHI VÀ CHỈ KHI ảnh bìa hỏng thật',
  lechA.length === 0 && theA.every((t) => t.coImg !== t.thayThe),
  `${theA.filter((t) => t.thayThe).length} ô thay thế / ${theA.filter((t) => !that[urlCua(t.id)]).length} bìa hỏng thật, lệch ${lechA.length}`
);
await ctxA.close();

// ---------- B. Chặn đúng một ảnh bìa ----------
const mau = theA.find((t) => t.anhTaiDuoc);
if (!mau) {
  check('Có một thẻ ảnh bìa tốt để chặn', false);
} else {
  const ctxB = await newCtx();
  await ctxB.route(mau.src, (r) => r.abort());
  const pB = await ctxB.newPage();
  await pB.goto(`${APP}/`, { waitUntil: 'networkidle' });
  const theB = await docThe(pB);
  const biChan = theB.filter((t) => urlCua(t.id) === mau.src);
  const conLai = theB.filter((t) => urlCua(t.id) !== mau.src);

  check(
    'Chặn ảnh bìa của một game: thẻ đó hiện ô thay thế, không còn <img> vỡ',
    biChan.length > 0 && biChan.every((t) => t.thayThe && !t.coImg),
    `${biChan.filter((t) => t.thayThe).length}/${biChan.length} thẻ`
  );
  check(
    '… các thẻ khác KHÔNG bị kéo theo (vẫn đúng như sự thật)',
    conLai.every((t) => t.thayThe === !that[urlCua(t.id)]),
    `${conLai.length} thẻ`
  );
  const o = biChan[0];
  if (o?.thayThe) {
    check('Ô thay thế mang chữ cái đầu tên game, viết hoa', o.chu === chuDau(o.ten), `"${o.chu}" cho "${o.ten}"`);
    const cu = theA.find((t) => t.id === o.id);
    check(
      'Ô thay thế đúng kích thước ảnh thật — thẻ không nhảy',
      !!cu && Math.abs(cu.rong - o.rong) <= 1 && Math.abs(cu.cao - o.cao) <= 1,
      cu ? `ảnh ${cu.rong}×${cu.cao}, ô ${o.rong}×${o.cao}` : ''
    );
    check('Ô thay thế là trang trí (aria-hidden) — tên game đã nằm ngay dưới', o.ariaHidden === 'true', String(o.ariaHidden));
    const tp = tuongPhanChuTrang(o.nen);
    check('Chữ trắng trên nền đủ tương phản cho chữ lớn (≥3:1)', tp >= 3, `${tp.toFixed(2)}:1 trên ${o.nen}`);

    await pB.reload({ waitUntil: 'networkidle' });
    const lai = (await docThe(pB)).find((t) => t.id === o.id);
    check('Tải lại trang: vẫn đúng màu đó (màu cố định theo tên)', lai?.nen === o.nen, `${o.nen} → ${lai?.nen}`);
  }
  await ctxB.close();
}

// ---------- C. Player sập: chặn MỌI ảnh bìa ----------
{
  const ctx = await newCtx();
  await ctx.route('**/thumb/**', (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(`${APP}/`, { waitUntil: 'networkidle' });
  const the = await docThe(p);
  check('Chặn mọi ảnh bìa: MỌI thẻ hiện ô thay thế', the.length > 0 && the.every((t) => t.thayThe && !t.coImg), `${the.filter((t) => t.thayThe).length}/${the.length}`);
  const tenKhac = new Set(the.map((t) => t.ten)).size;
  const mauKhac = new Set(the.map((t) => t.nen)).size;
  check('… và nhiều game khác tên thì KHÔNG cùng một màu (còn nhận ra game nào với game nào)', tenKhac < 2 || mauKhac >= 2, `${tenKhac} tên, ${mauKhac} màu`);
  await ctx.close();
}

// ---------- D. Trang bố mẹ, điện thoại, player sập ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('**/thumb/**', (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(`${APP}/dang-nhap`, { waitUntil: 'networkidle' });
  await p.fill('input[name=email]', DEMO_EMAIL);
  await p.fill('input[name=password]', DEMO_PASS);
  await p.locator('main button[type=submit]').first().click();
  await p.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(800);
  const o = await p.$$eval('[data-testid=anh-bia-game]', (ds) =>
    ds.map((d) => ({ thayThe: d.hasAttribute('data-bia-thay-the'), rong: Math.round(d.getBoundingClientRect().width), cao: Math.round(d.getBoundingClientRect().height), chu: d.textContent?.trim() ?? '' }))
  );
  check('Trang bố mẹ, chặn mọi ảnh bìa: mọi ảnh thành ô thay thế', o.length > 0 && o.every((x) => x.thayThe), `${o.filter((x) => x.thayThe).length}/${o.length}`);
  check('… đúng khổ 64×48 như ảnh ở màn 390px, có chữ cái', o.length > 0 && o.every((x) => x.rong === 64 && x.cao === 48 && x.chu.length > 0), o[0] ? `${o[0].rong}×${o[0].cao} "${o[0].chu}"` : '');
  await ctx.close();
}

await browser.close();
const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
