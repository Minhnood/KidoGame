/**
 * Kiểm đường người dùng tự báo một chỗ hỏng — `/bao-loi`.
 *
 * VÌ SAO CẦN. `app/error.tsx` đã nói với người gặp lỗi "gửi kèm mã này giúp tìm ra
 * nguyên nhân nhanh hơn" từ trước khi có chỗ nào để gửi, và `/admin/loi` viết như thể
 * luồng ấy tồn tại. Bộ này canh rằng nó tồn tại thật, từ đầu tới cuối, và canh bốn
 * cách hỏng mà không cách nào làm đỏ thứ gì khác:
 *
 *  1. GỬI XONG MÀ KHÔNG TỚI. Form báo "đã nhận", người dùng đi, và không có dòng nào
 *     trong DB. Cách duy nhất phát hiện là đi hết đường: gửi ở site, rồi mở khu quản
 *     trị và tìm đúng chữ vừa gõ.
 *  2. MÃ LỖI KHÔNG ĐI THEO. Trang lỗi trỏ sang `/bao-loi?ma=…&tu=…`; rơi mất tham số
 *     thì người dùng phải chép tay một chuỗi hex, tức mã lỗi sẽ không bao giờ tới tay
 *     người sửa — mà mã đó là sợi dây duy nhất nối báo cáo với log server.
 *  3. HỘP NHẬN CHỮ KHÔNG CÓ CHỐT. Đây là form không cần đăng nhập, ghi thẳng vào DB.
 *     Trần theo IP và độ dài tối thiểu là hai thứ duy nhất đứng giữa nó và một script.
 *  4. QUERY STRING BỊ LƯU. Đường dẫn phải bị cắt query — token xác minh email nằm
 *     trong query string, và một bảng giữ token là bảng phải bảo vệ như bảng mật khẩu.
 *
 * Cần: app server đang chạy, `psql`. Không cần `.sb3`, không cần `MAIL_LOG`.
 *
 * Chạy:
 *   node infra/e2e-bao-loi.mjs
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const ADMIN = process.env.ADMIN_ORIGIN ?? 'http://admin.localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'demo@kidogame.local';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'demo1234ab';

const suffix = randomBytes(4).toString('hex');
const EMAIL = `bao-loi-${suffix}@vidu.test`;
const MO_TA = `Bấm Đăng game thì quay tròn mãi không xong, thử ba lần đều vậy. Mã ${suffix}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const WEB = path.join(import.meta.dirname, '..', 'apps', 'web');
const DB = (
  fs.readFileSync(path.join(WEB, '.env'), 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1] ?? ''
).split('?')[0];
const sql = (q) => execFileSync('psql', [DB, '-q', '-t', '-A', '-c', q]).toString().trim();
const dem = (q) => Number(sql(q));

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 1200 } });
const p = await ctx.newPage();

// ---------- Đường vào: chân trang, và trang lỗi ----------
{
  await p.goto(`${APP}/`, { waitUntil: 'networkidle' });
  /* Chân trang là đường vào QUAN TRỌNG NHẤT, quan trọng hơn cả trang lỗi: trang lỗi
     chỉ hiện khi React ném exception, còn phần lớn chỗ hỏng người dùng gặp thì không
     ném gì cả ("bấm gửi mà không có gì xảy ra"). Nếu đường vào chỉ nằm trên trang lỗi
     thì đúng những báo cáo giá trị nhất không có cửa nào. */
  check(
    'Chân trang có link Báo lỗi',
    (await p.locator('footer a[href="/bao-loi"]').count()) >= 1
  );
}

// ---------- Mã lỗi và đường dẫn điền sẵn từ query ----------
{
  await p.goto(`${APP}/bao-loi?ma=abc123&tu=/upload`, { waitUntil: 'networkidle' });
  check('Mã lỗi trong URL được điền sẵn', (await p.inputValue('#maLoi')) === 'abc123');
  check('Đường dẫn trong URL được điền sẵn', (await p.inputValue('#duongDan')) === '/upload');
  check(
    'Trang nói rõ đây KHÔNG phải chỗ báo cáo nội dung xấu',
    /Báo cáo game này/.test(await p.innerText('body'))
  );
}

// ---------- Chốt: mô tả quá ngắn thì từ chối ----------
{
  await p.fill('#moTa', 'hỏng');
  await p.click('[data-testid=bao-loi-form] button[type=submit]');
  await p.waitForTimeout(2000);
  /*
   * Không phải để lọc người dùng mà để lọc cú bấm nhầm: một báo cáo "test" vẫn chiếm
   * một dòng trong hàng đợi mà người trực phải đọc rồi đánh dấu đã xử lý, và không nói
   * cho họ điều gì.
   */
  check(
    'Mô tả quá ngắn thì từ chối và nói rõ cần gì',
    /ít nhất \d+ ký tự/.test(await p.innerText('[data-testid=bao-loi-form]')),
    (await p.locator('[role=alert]').first().innerText().catch(() => '')).slice(0, 60)
  );
  check(
    '… và KHÔNG ghi gì vào DB',
    dem(`select count(*) from "BugReport" where "moTa" = 'hỏng'`) === 0
  );
  /* Chữ vừa gõ phải CÒN NGUYÊN sau khi bị từ chối. React reset form sau mỗi action,
     nên ô không điều khiển bằng state sẽ trắng trơn đúng lúc người dùng vừa bị báo là
     điền sai — và ô này là toàn bộ nội dung báo cáo. */
  check('… và chữ vừa gõ vẫn còn trong ô', (await p.inputValue('#moTa')) === 'hỏng');
}

// ---------- Chốt: email gõ sai, ở HAI tầng ----------
{
  await p.fill('#moTa', MO_TA);
  await p.fill('#emailLienHe', 'khong-phai-email');
  await p.click('[data-testid=bao-loi-form] button[type=submit]');
  await p.waitForTimeout(1500);
  /*
   * Tầng 1: `type="email"` nên chính TRÌNH DUYỆT chặn, action không chạy. Đây là hành
   * vi đúng và nó tốt hơn một vòng đi về server — nhưng nó KHÔNG phải cái chốt, vì một
   * request nặn tay không đi qua trình duyệt nào cả.
   */
  check(
    'Email gõ sai: trình duyệt chặn ngay, form không gửi đi',
    (await p.locator('#emailLienHe').evaluate((el) => el.matches(':invalid'))) &&
      (await p.locator('[data-testid=bao-loi-done]').count()) === 0
  );

  /*
   * Tầng 2 — cái chốt thật. Tắt `noValidate` để bỏ qua tầng trình duyệt, đúng như một
   * request nặn tay: server phải tự từ chối, và phải nói rằng để trống cũng được (bắt
   * gõ lại một trường TUỲ CHỌN cho đúng là cách mất một báo cáo có thật).
   */
  await p.locator('[data-testid=bao-loi-form]').evaluate((f) => {
    f.noValidate = true;
  });
  await p.click('[data-testid=bao-loi-form] button[type=submit]');
  await p.waitForTimeout(2000);
  check(
    'Bỏ qua chặn của trình duyệt thì SERVER từ chối, và nói để trống cũng được',
    /để trống cũng được/.test(await p.innerText('[data-testid=bao-loi-form]'))
  );
  check(
    '… và không ghi dòng nào với email sai',
    dem(`select count(*) from "BugReport" where "emailLienHe" = 'khong-phai-email'`) === 0
  );
}

// ---------- Gửi thật ----------
{
  await p.fill('#emailLienHe', EMAIL);
  await p.click('[data-testid=bao-loi-form] button[type=submit]');
  await p.waitForSelector('[data-testid=bao-loi-done]', { timeout: 20000 }).catch(() => {});
  check('Gửi được, và trang nói đã nhận', (await p.locator('[data-testid=bao-loi-done]').count()) === 1);

  const hang = sql(
    `select "moTa" || '|' || "maLoi" || '|' || "duongDan" || '|' || "emailLienHe" || '|' || browser from "BugReport" where "emailLienHe" = '${EMAIL}'`
  );
  const [moTa, maLoi, duongDan, email, browser_] = hang.split('|');
  check('Dòng trong DB mang đúng chữ người dùng gõ', moTa === MO_TA, moTa.slice(0, 40));
  check('… mang mã lỗi đã điền sẵn', maLoi === 'abc123');
  check('… mang đường dẫn', duongDan === '/upload');
  check('… mang email liên hệ', email === EMAIL);
  /* Tên trình duyệt rút Ở PHÍA SERVER từ user agent, không nhận từ form: một trường
     do người gửi tự điền thì nó chỉ là một ô chữ nữa, không phải dữ kiện. */
  check('… và tên trình duyệt rút gọn ở phía server', /^\w+ \d+$/.test(browser_), browser_);
  check(
    'KHÔNG lưu IP thô — chỉ băm',
    /^[0-9a-f]{64}$|^$/.test(sql(`select "ipHash" from "BugReport" where "emailLienHe" = '${EMAIL}'`))
  );
}

// ---------- Query string phải bị CẮT khỏi đường dẫn ----------
{
  /*
   * Token xác minh email đi qua query string. Một bảng giữ token là bảng phải bảo vệ
   * như bảng mật khẩu, nên `ErrorLog.path` cắt query từ trước và đường này phải cắt
   * y như vậy. Gửi thẳng một đường dẫn có token để xem nó có bị cắt thật.
   */
  await p.goto(`${APP}/bao-loi`, { waitUntil: 'networkidle' });
  await p.fill('#moTa', `Trang xác minh báo lỗi lạ, mã riêng ${suffix}-token`);
  await p.fill('#duongDan', '/xac-minh-email?token=BIMAT123&x=1#phan');
  await p.click('[data-testid=bao-loi-form] button[type=submit]');
  await p.waitForSelector('[data-testid=bao-loi-done]', { timeout: 20000 }).catch(() => {});
  const dd = sql(
    `select "duongDan" from "BugReport" where "moTa" like '%${suffix}-token%'`
  );
  check('Query string và hash bị cắt khỏi đường dẫn', dd === '/xac-minh-email', dd);
  check(
    '… nên token không nằm trong DB',
    dem(`select count(*) from "BugReport" where "duongDan" like '%BIMAT123%'`) === 0
  );
}

// ---------- Trần theo IP ----------
{
  /* Trần là 5 báo cáo mỗi IP mỗi giờ. Đã gửi 2, gửi thêm cho tới khi bị chặn — nếu
     không bao giờ bị chặn thì cái chốt duy nhất đứng trước một hộp nhận chữ tự do
     không tồn tại, và điều đó không làm đỏ bất cứ thứ gì khác. */
  let chan = false;
  for (let i = 0; i < 6 && !chan; i++) {
    await p.goto(`${APP}/bao-loi`, { waitUntil: 'networkidle' });
    await p.fill('#moTa', `Báo lỗi lặp lần ${i} để kiểm trần, mã ${suffix}-tran`);
    await p.click('[data-testid=bao-loi-form] button[type=submit]');
    await p.waitForTimeout(1800);
    const chu = await p.innerText('[data-testid=bao-loi-form]').catch(() => '');
    if (/khá nhiều báo lỗi/.test(chu)) chan = true;
  }
  check('Gửi quá nhiều trong một giờ thì bị chặn, và được báo lý do', chan);
}

// ---------- Khu quản trị: thấy, và đánh dấu đã trả lời ----------
{
  const a = await (await browser.newContext({ viewport: { width: 1300, height: 1400 } })).newPage();
  await a.goto(`${ADMIN}/admin/dang-nhap`, { waitUntil: 'networkidle' });
  await a.fill('#email', ADMIN_EMAIL);
  await a.fill('#password', ADMIN_PASS);
  await a.click('[data-testid=auth-form] button[type=submit]');
  await a.waitForURL((u) => u.pathname === '/admin', { timeout: 20000 }).catch(() => {});
  await a.goto(`${ADMIN}/admin/loi`, { waitUntil: 'networkidle' });

  const khu = a.locator('[data-testid=bug-reports]');
  check('Tab Lỗi có phần "Người dùng báo"', (await khu.count()) === 1);
  const chu = await khu.innerText();
  check('… và nó chứa đúng chữ người dùng vừa gõ', chu.includes(MO_TA), MO_TA.slice(0, 40));
  check('… kèm mã lỗi để tra log server', chu.includes('abc123'));
  check('… kèm email hiện thành link trả lời được', (await khu.locator(`a[href="mailto:${EMAIL}"]`).count()) === 1);

  /* Phần này KHÔNG được chịu bộ lọc của trang: ba bộ lọc bên dưới nói về `ErrorLog`.
     Cho chúng lọc cả hai danh sách thì "Đã xử lý" hiện một hàng đợi trống rỗng cạnh
     một danh sách lỗi cũ, hai thứ chẳng liên quan gì nhau. */
  await a.goto(`${ADMIN}/admin/loi?loc=da-xu-ly`, { waitUntil: 'networkidle' });
  check(
    'Bộ lọc của lỗi tự động KHÔNG lọc phần người dùng báo',
    (await a.locator('[data-testid=bug-report]').count()) > 0
  );

  await a.goto(`${ADMIN}/admin/loi`, { waitUntil: 'networkidle' });
  const the = a.locator('[data-testid=bug-report]', { hasText: MO_TA }).first();
  await the.locator('[data-testid=bug-resolve]').click();
  await a.waitForTimeout(2500);
  check(
    'Bấm "Đã trả lời" thì dòng rời hàng đợi',
    sql(`select "resolvedAt" is not null from "BugReport" where "emailLienHe" = '${EMAIL}'`) === 't'
  );
  check(
    '… và KHÔNG xoá dòng — người trực còn đọc lại được mình đã trả lời gì',
    dem(`select count(*) from "BugReport" where "emailLienHe" = '${EMAIL}'`) === 1
  );

  /* Tab Tổng quan phải nói ra số báo lỗi đang chờ: hàng đợi này không có hạn nào nên
     nó không lên ô số, nhưng người trực mở Tổng quan đầu tiên mỗi ngày. */
  await a.goto(`${ADMIN}/admin/tong-quan`, { waitUntil: 'networkidle' });
  const conCho = dem(`select count(*) from "BugReport" where "resolvedAt" is null`);
  const chuTQ = await a.locator('[data-testid=tq-cot-loi]').innerText();
  check(
    'Tab Tổng quan nói đúng số báo lỗi đang chờ',
    conCho === 0
      ? !/báo lỗi của người dùng đang chờ/.test(chuTQ)
      : new RegExp(`${conCho} báo lỗi của người dùng đang chờ`).test(chuTQ),
    `${conCho} đang chờ`
  );
}

// ---------- Dọn ----------
sql(`delete from "BugReport" where "emailLienHe" = '${EMAIL}' or "moTa" like '%${suffix}%'`);
check(
  'Dọn sạch: không còn báo lỗi nào của bài này',
  dem(`select count(*) from "BugReport" where "moTa" like '%${suffix}%'`) === 0
);

await browser.close();

const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
