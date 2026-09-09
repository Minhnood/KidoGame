/**
 * Kiểm hai biểu đồ trên tab Tổng quan.
 *
 * VÌ SAO CẦN. Một biểu đồ sai thì KHÔNG có gì đỏ: trang vẫn tải, hình vẫn đẹp, chỉ có
 * tỉ lệ là nói sai — và người trực tin nó vì hình trông tự tin hơn một con số. Bốn
 * cách hỏng đã gặp hoặc đã ngăn, cả bốn đều im lặng:
 *
 *  1. TỔNG KHÔNG BẰNG TỔNG. Donut là phần-trên-tổng, nên nếu bốn số không cộng lại
 *     bằng số ở giữa vành thì mọi phần trăm đều sai. Canh bằng phép cộng, cùng khuôn
 *     với bộ lọc trạng thái trong `e2e-moderation`.
 *  2. SỐ TRÊN CHÚ GIẢI KHÔNG BẰNG DANH SÁCH NÓ DẪN TỚI. Luật này đã chốt cho mười hai
 *     ô số của trang; chú giải donut cũng là link nên nó phải chịu cùng luật, không
 *     thì bấm vào "2 đã gỡ" ra một danh sách ba dòng.
 *  3. MÚI 100% BIẾN MẤT. Một cung 360 độ có điểm đầu trùng điểm cuối nên SVG không vẽ
 *     gì cả — và đó là trạng thái THƯỜNG GẶP NHẤT (trang mới thì mọi game đều đang
 *     hiện). Component vẽ `<circle>` cho trường hợp ấy; phép kiểm canh rằng số hình
 *     được vẽ luôn bằng số trạng thái khác 0.
 *  4. NGÀY TRỐNG BIẾN MẤT khỏi biểu đồ cột. Mười bốn ngày mất ba ngày ở giữa đọc như
 *     một chuỗi mười một ngày liên tục, tức hình nói sai về nhịp đăng game.
 *
 * KHÔNG dựng dữ liệu: bài này đọc đúng những gì đang có trong DB và tự so các con số
 * với nhau. Nhờ vậy nó không cần dọn, và nó đúng ở mọi trạng thái dữ liệu — kể cả DB
 * rỗng.
 *
 * Cần: app server đang chạy. Không cần `.sb3`, không cần `MAIL_LOG`.
 *
 * Chạy:
 *   node infra/e2e-bieu-do.mjs
 */
import { chromium } from 'playwright';

const ADMIN = process.env.ADMIN_ORIGIN ?? 'http://admin.localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'demo@kidogame.local';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'demo1234ab';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1400 } });
const p = await ctx.newPage();

await p.goto(`${ADMIN}/admin/dang-nhap`, { waitUntil: 'networkidle' });
await p.fill('#email', ADMIN_EMAIL);
await p.fill('#password', ADMIN_PASS);
await p.click('[data-testid=auth-form] button[type=submit]');
await p.waitForURL((u) => u.pathname === '/admin', { timeout: 20000 }).catch(() => {});
await p.goto(`${ADMIN}/admin/tong-quan`, { waitUntil: 'networkidle' });

const donut = p.locator('[data-testid=tq-donut]');
const cot = p.locator('[data-testid=tq-cot]');
const cotLoi = p.locator('[data-testid=tq-cot-loi]');
check(
  'Tab Tổng quan có cả ba biểu đồ',
  (await donut.count()) === 1 && (await cot.count()) === 1 && (await cotLoi.count()) === 1
);

// ---------- Thẻ lỗi: hình khi có dữ liệu, câu chữ khi không ----------
{
  /*
   * TƯƠNG ĐƯƠNG HAI CHIỀU, cùng khuôn với dòng "Không có việc gấp": thẻ vẽ hình KHI VÀ
   * CHỈ KHI 14 ngày qua có ít nhất một lượt lỗi. Một biểu đồ rỗng và một biểu đồ chưa
   * tải xong trông giống nhau, nên trạng thái rỗng phải nói ra bằng chữ; và nếu câu chữ
   * ấy hiện trong lúc CÓ lỗi thì người trực kết luận ngược hẳn sự thật.
   */
  const coHinh = (await cotLoi.locator('svg').count()) === 1;
  const noiTinTot = /Không có lỗi nào trong 14 ngày qua/.test(await cotLoi.innerText());
  check(
    'Thẻ lỗi: có hình khi và chỉ khi không nói "không có lỗi nào"',
    coHinh !== noiTinTot,
    coHinh ? 'đang vẽ hình' : 'đang nói trạng thái rỗng'
  );
  /* Đếm SỐ LẦN chứ không số nhóm — một lỗi nổ vào mặt hai trăm người phải khác hẳn
     một lỗi xảy ra đúng một lần, và khoảng cách đó là lý do biểu đồ này tồn tại. */
  check(
    'Thẻ lỗi nói rõ đang đếm số LẦN, không phải số nhóm',
    /Số LẦN người dùng gặp lỗi/.test(await cotLoi.innerText())
  );
  check(
    'Thẻ lỗi có đường sang tab Lỗi',
    (await cotLoi.locator('a[href="/admin/loi"]').count()) === 1
  );
}

// ---------- Donut ----------
const dongCG = donut.locator('ul li');
const soDong = await dongCG.count();
check('Chú giải donut có đúng bốn trạng thái', soDong === 4, `${soDong}`);

const muc = [];
for (let i = 0; i < soDong; i++) {
  const li = dongCG.nth(i);
  const chu = (await li.innerText()).split('\n').join(' ');
  const href = await li.locator('a').getAttribute('href');
  /* Đọc số và phần trăm từ chính DOM, không đoán theo thứ tự: nhãn có thể đổi chữ mà
     ý nghĩa không đổi, nhưng cặp (số, link) là thứ phép kiểm này nói về. */
  const so = Number(chu.match(/(\d+)\s+(?:\d+%|—)\s*$/)?.[1] ?? NaN);
  muc.push({ chu, href, so });
}

check(
  'Mỗi dòng chú giải đọc ra được một con số',
  muc.every((m) => Number.isFinite(m.so)),
  muc.map((m) => `${m.so}`).join(', ')
);

/* `innerText` không dùng được trên `<text>` của SVG — nó không phải HTMLElement.
   `textContent` thì có, và đó cũng là thứ trình đọc màn hình đọc. */
const tongGiua = Number(
  (await donut.locator('svg text').first().evaluate((el) => el.textContent ?? '')).trim()
);
const tongCong = muc.reduce((t, m) => t + m.so, 0);
/*
 * PHÉP CỘNG. Donut là phần-trên-tổng: bốn múi phải là một PHÂN HOẠCH của số ở giữa
 * vành. Lệch ở đây thì mọi phần trăm trên chú giải đều sai, mà không có gì báo — hình
 * vẫn tròn, vẫn kín, vẫn trông đúng.
 */
check(
  'Bốn số cộng lại đúng bằng số ở giữa vành',
  tongCong === tongGiua,
  `${muc.map((m) => m.so).join('+')} = ${tongCong}, ở giữa: ${tongGiua}`
);

const soHinh = await donut.locator('svg path, svg circle').count();
const soKhac0 = muc.filter((m) => m.so > 0).length;
/*
 * Số hình được vẽ phải bằng số trạng thái khác 0 — không hơn (múi 0 độ vẫn vẽ ra một
 * vết mực), không kém (đúng cái bẫy cung 360 độ: một trạng thái chiếm 100% thì cung
 * biến mất hoàn toàn và vành trắng trơn).
 */
check(
  'Số múi vẽ ra bằng số trạng thái khác 0',
  soHinh === soKhac0,
  `vẽ ${soHinh}, khác 0: ${soKhac0}`
);

check(
  'Mỗi múi mang <title> để trỏ chuột và trình đọc màn hình đọc được',
  (await donut.locator('svg path > title, svg circle > title').count()) === soHinh
);

check(
  'Cả hình có nhãn mô tả cho trình đọc màn hình',
  Boolean(await donut.locator('svg[role=img]').getAttribute('aria-label'))
);

/*
 * SỐ TRÊN CHÚ GIẢI PHẢI BẰNG DANH SÁCH NÓ DẪN TỚI.
 *
 * Cùng luật đã chốt cho mười hai ô số của trang này. Không có nó thì một bộ lọc đổi
 * nghĩa (hay một ô đếm sai `where`) vẫn cho ra một trang trông bình thường, và người
 * trực bấm "2 đã gỡ" rồi đọc một danh sách ba dòng mà không biết cái nào đúng.
 */
/**
 * Đếm thẻ game qua HẾT các trang của một bộ lọc, không chỉ trang đầu.
 *
 * Bản trước chỉ đếm trang 1 và nó xanh suốt cho tới ngày DB dev có 21 game
 * PUBLISHED — đúng một game quá `PAGE_SIZE = 20` của `/admin`. Lúc đó phép kiểm đỏ
 * với thông điệp "chú giải (21) dẫn tới đúng 21 game — danh sách: 20", tức tố donut
 * đếm sai trong khi cả donut lẫn danh sách đều đúng, chỉ là danh sách có hai trang.
 * Đó là loại đỏ tốn nhất: nó gửi người đọc đi sửa một chỗ không hỏng.
 *
 * Dừng khi một trang không còn thẻ nào, và chốt trần số vòng để một bộ lọc hỏng kiểu
 * "trang nào cũng trả về cùng một trang" không quay vô tận.
 */
async function demQuaMoiTrang(href) {
  let tong = 0;
  for (let trang = 1; trang <= 50; trang++) {
    const url = `${ADMIN}${href}${href.includes('?') ? '&' : '?'}trang=${trang}`;
    await p.goto(url, { waitUntil: 'networkidle' });
    const soThe = await p.locator('[data-testid=admin-game]').count();
    tong += soThe;
    if (soThe === 0) break;
  }
  return tong;
}

for (const m of muc) {
  const soThe = await demQuaMoiTrang(m.href);
  const nhan = m.chu.replace(/\s+\d+\s+(\d+%|—)\s*$/, '').trim();
  check(
    `Chú giải "${nhan}" (${m.so}) dẫn tới đúng ${m.so} game`,
    soThe === m.so,
    `danh sách: ${soThe}`
  );
}
await p.goto(`${ADMIN}/admin/tong-quan`, { waitUntil: 'networkidle' });

// ---------- Cột theo ngày ----------
const vungNgay = cot.locator('svg rect[fill=transparent]');
check('Biểu đồ cột có đúng 14 khoảng ngày', (await vungNgay.count()) === 14);

/*
 * NGÀY TRỐNG PHẢI CÓ MẶT. Vùng bắt chuột vẽ cho MỌI ngày, kể cả ngày 0 — nên số vùng
 * luôn là 14, và mỗi vùng mang tooltip riêng. Nếu ai đó sửa thành "chỉ vẽ ngày có
 * dữ liệu" thì con số này tụt xuống và phép kiểm đỏ, đúng lúc cần đỏ.
 */
check(
  'Mỗi khoảng ngày mang <title>, kể cả ngày bằng 0',
  (await cot.locator('svg rect[fill=transparent] > title').count()) === 14
);

/* Mở `<details>` trước khi đọc: `innerText` của phần tử đang ẩn trả về chuỗi rỗng,
   nên đọc mà không mở thì mọi ô đều ra 0 và phép kiểm đỏ vì lý do chẳng liên quan.
   Mở nó cũng là kiểm luôn rằng bảng số mở ra được — nó là bản đọc-không-cần-chuột. */
await cot.locator('details summary').click();
await p.waitForTimeout(200);
const dong = cot.locator('details table tbody tr');
check('Bảng số theo ngày mở ra được và có đúng 14 dòng', (await dong.count()) === 14);

/*
 * Bảng số là bản đọc-được-không-cần-chuột của chính biểu đồ, nên nó phải khớp với
 * hình: tổng của bảng bằng tổng số cột. Không so được từng cột (chiều cao là hình
 * học), nhưng tổng thì so được, và nó bắt đúng cách hỏng đáng lo — bảng và hình đọc
 * từ hai nguồn khác nhau.
 */
let tongBang = 0;
for (let i = 0; i < 14; i++) {
  tongBang += Number((await dong.nth(i).locator('td').innerText()).trim());
}
const soCot = await cot.locator('svg rect.fill-bd-cot').count();
check(
  'Bảng số và hình cùng nói về một tập ngày',
  /* Mỗi ngày có số > 0 được vẽ bằng HAI hình chữ nhật (thân bo góc + chân vuông), nên
     số hình phải bằng đúng hai lần số ngày khác 0 trong bảng. */
  soCot === 2 * (await demNgayKhac0(dong)),
  `hình: ${soCot}, ngày khác 0 trong bảng: ${await demNgayKhac0(dong)}, tổng bảng: ${tongBang}`
);

async function demNgayKhac0(rows) {
  let n = 0;
  for (let i = 0; i < 14; i++) {
    if (Number((await rows.nth(i).locator('td').innerText()).trim()) > 0) n++;
  }
  return n;
}

check(
  'Biểu đồ cột cũng có nhãn mô tả cho trình đọc màn hình',
  Boolean(await cot.locator('svg[role=img]').getAttribute('aria-label'))
);

// ---------- Chữ trong SVG phải đọc được ở khổ hẹp ----------
/*
 * `viewBox` scale CẢ CHỮ, nên một biểu đồ vừa mắt ở màn rộng có thể có trục 8px trên
 * điện thoại — đã xảy ra thật, đo bằng ảnh chụp. Bọc `max-w` là cách sửa; phép kiểm
 * này ghim lại kết quả để lần sau ai bỏ `max-w` đi thì thấy đỏ chứ không thấy "vẫn ổn
 * trên máy tôi".
 */
await p.setViewportSize({ width: 390, height: 1400 });
await p.reload({ waitUntil: 'networkidle' });
const hopSvg = await cot.locator('svg').boundingBox();
const coChu = await cot.locator('svg text').first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return r.height;
});
check(
  'Ở 390px chữ trong biểu đồ cột vẫn cao ít nhất 11px',
  coChu >= 11,
  `${coChu.toFixed(1)}px, svg rộng ${Math.round(hopSvg.width)}px`
);
check(
  'Ở 390px biểu đồ không tràn ngang khỏi thẻ',
  hopSvg.width <= 390,
  `${Math.round(hopSvg.width)}px`
);

await browser.close();

const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
