/**
 * Kiểm tra end-to-end tầng 2 của giám sát: `/api/errors` → bảng `ErrorLog` →
 * trang `/admin/loi`. Xem `infra/GIAM-SAT.md` mục 4.
 *
 * Chạy:
 *   node infra/e2e-errorlog.mjs
 *
 * KHÔNG cần .sb3 và KHÔNG cần MAIL_LOG — bài này không tạo tài khoản nào, nó dùng
 * tài khoản demo có sẵn sau `pnpm db:seed`.
 *
 * MỘT ĐƯỜNG KHÔNG KIỂM ĐƯỢC Ở ĐÂY, và phải nói rõ để lần sau không tưởng là đã phủ:
 * chặng "một trang thật ném lỗi → error.tsx chạy → sendBeacon bắn đi". Muốn kiểm tự
 * động thì phải có một route cố tình ném lỗi nằm sẵn trong mã nguồn, tức là đặt một
 * quả bom vào production để phục vụ bài test. Cách kiểm tay, đã làm một lần lúc dựng
 * và mất ba phút: tạo `apps/web/src/app/kg-tmp-throw/page.tsx` chỉ có
 * `throw new Error('...')`, mở trang đó bằng Playwright rồi nghe request tới
 * `/api/errors`, xong thì XOÁ file.
 *
 * Rác để lại: vài nhóm lỗi mang đường dẫn `/e2e-loi-<hex>`, đều đã được đánh dấu là
 * đã xử lý ở bước cuối nên không đọng trong danh sách việc cần làm. Muốn xoá hẳn thì
 * xoá theo THÔNG ĐIỆP, không theo đường dẫn — một phép kiểm cố tình gửi đường dẫn
 * tuyệt đối để xem nó bị quy về `khong-ro`, và dòng đó không khớp mẫu đường dẫn nào:
 *   delete from "ErrorLog" where message like 'Loi kiem thu %';
 */
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
/* Khu quản trị trên origin riêng — xem `infra/e2e-admin-origin.mjs`. */
const ADMIN = process.env.ADMIN_ORIGIN ?? 'http://admin.localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'demo@kidogame.local';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'demo1234ab';
const CHILD_USER = process.env.CHILD_USER ?? 'beminh';
const CHILD_PASS = process.env.CHILD_PASS ?? 'be1234';

const suffix = randomBytes(4).toString('hex');
const PATH = `/e2e-loi-${suffix}`;
const DIGEST = `digest${suffix}`;
const MESSAGE = `Loi kiem thu ${suffix}`;

/** Trần trong `lib/error-log.ts`. Đổi ở đó thì đổi luôn ở đây. */
const RATE_LIMIT_PER_MINUTE = 30;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * Gửi một báo cáo lỗi đúng như `sendBeacon` của trình duyệt gửi.
 *
 * `x-forwarded-for` PHẢI có, dù ở dev không ai đặt nó: trần chống lụt cố ý KHÔNG
 * giới hạn khi không biết IP (gộp mọi người không rõ IP vào một khoá là chặn oan cả
 * nhóm — cùng lý lẽ đã dùng cho khoá chống báo cáo trùng). Thiếu header này thì phép
 * kiểm trần bên dưới đo một cái van đang mở, và nó xanh vì không có gì để đóng.
 * Ở production Caddy luôn ghi đè header này.
 */
const IP_GIA = '203.0.113.7';

async function post(body, headers = {}) {
  try {
    const res = await fetch(`${APP}/api/errors`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-forwarded-for': IP_GIA, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return res.status;
  } catch {
    /*
     * Trả 0 thay vì ném. Bước kiểm trần bắn hơn 40 request liên tiếp, và tầng dev
     * server của Next thỉnh thoảng ngắt một kết nối giữa loạt đó — đúng cái
     * `ECONNRESET` đã ghi trong TODO là "điều tra rồi cố ý không sửa". Một request
     * đứt không đổi kết luận về trần, nhưng nó từng làm CẢ bài đổ ở dòng
     * `await fetch`, và triệu chứng thì trông như route bị hỏng.
     *
     * Không che được lỗi thật: mọi phép kiểm ở trên so status với 204, nên server
     * chết thật thì chúng đỏ ngay.
     */
    return 0;
  }
}

const browser = await chromium.launch({ channel: 'chrome' });

// ---------- Ai vào được trang ----------
{
  const p = await (await browser.newContext()).newPage();
  await p.goto(`${ADMIN}/admin/loi`, { waitUntil: 'networkidle' });
  check(
    'Khách chưa đăng nhập bị đẩy về cửa đăng nhập quản trị',
    new URL(p.url()).pathname === '/admin/dang-nhap',
    new URL(p.url()).pathname
  );

  const kid = await (await browser.newContext()).newPage();
  await kid.goto(`${APP}/be-dang-nhap`, { waitUntil: 'networkidle' });
  await kid.fill('#username', CHILD_USER);
  await kid.fill('#password', CHILD_PASS);
  await kid.click('button[type=submit]');
  await kid
    .waitForURL((u) => !/be-dang-nhap/.test(u.toString()), { timeout: 20000 })
    .catch(() => {});
  await kid.goto(`${ADMIN}/admin/loi`, { waitUntil: 'networkidle' });
  /*
   * ĐỔI TỪ "nhận 404" SANG "bị đẩy về cửa đăng nhập", và việc che giấu chuyển sang
   * tầng khác chứ không mất đi.
   *
   * Trước khi tách origin, `/admin/loi` nằm trên app origin và trả 404 cho người
   * không có quyền — 404 chứ không 403, để không tự xác nhận trang có tồn tại.
   *
   * Nay trang này chỉ tồn tại trên admin origin, và ở đó nó PHẢI hiện được cửa đăng
   * nhập, không thì người có quyền cũng không vào được. Thứ che giấu khu quản trị
   * giờ là: trên app origin `/admin*` trả 404 với mọi người (phép kiểm trong
   * `e2e-moderation`), và hostname của admin origin không được công bố ở đâu trên
   * site — thanh điều hướng không có link tới nó.
   *
   * Điều phải giữ, và là điều phép kiểm này canh: một phiên SITE hợp lệ — ở đây là
   * phiên của một đứa trẻ — không đọc được nội dung khu quản trị.
   */
  const duongDan = new URL(kid.url()).pathname;
  check(
    'Phiên của bé không vào được /admin/loi, bị đẩy về cửa đăng nhập quản trị',
    duongDan === '/admin/dang-nhap',
    duongDan
  );
  check(
    'Và không đọc được nội dung nào của trang lỗi',
    (await kid.locator('[data-testid=error-total]').count()) === 0
  );
}

// ---------- Nhận báo cáo ----------
/*
 * User agent phải TỰ ĐẶT, không dựa vào cái `fetch` của Node gửi.
 *
 * Bài này gửi bằng `fetch` chứ không bằng trình duyệt, nên nếu để mặc định thì cột
 * `browser` luôn ra "khác" và phép kiểm rút gọn user agent bên dưới không kiểm gì
 * cả — nó xanh vì không có gì để rút. Chuỗi Safari giả ở đây còn kiểm luôn thứ tự
 * so khớp trong `browserTag`: Chrome cũng tự nhận là Safari trong UA của nó, nên
 * sai thứ tự là mọi trình duyệt thành "Safari".
 */
const UA_SAFARI = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
};

check(
  'POST hợp lệ trả 204',
  (await post(
    { source: 'boundary', path: `${PATH}?token=BI-MAT#x`, digest: DIGEST, message: MESSAGE },
    UA_SAFARI
  )) === 204
);
check('Thân request là rác vẫn trả 204', (await post('khong-phai-json')) === 204);
check(
  'Thân request quá to vẫn trả 204',
  (await post({ source: 'boundary', path: `${PATH}-to`, message: 'x'.repeat(5000) })) === 204
);
check(
  'Giả làm lỗi server vẫn trả 204',
  (await post({ source: 'server', path: `${PATH}-gia`, message: MESSAGE })) === 204
);
check(
  'Đường dẫn tuyệt đối vẫn trả 204',
  (await post({ source: 'global', path: 'http://ke-xau.example/x', message: `${MESSAGE} lac` })) ===
    204
);
/* Thông điệp mang email và token: `/dieu-khoan` hứa bản ghi lỗi đã che chúng. Đường
   dẫn KHÔNG mang tiền tố PATH, để không đổi phép đếm "rác không tạo nhóm" bên dưới. */
const PATH_CHE = `/e2e-che-${suffix}`;
const TOKEN_GIA = 'Zx9aQ2mPl7Rt4Kw8Yb3Nc6Vd1Hf5Jg0Ls2Qe7Uo9Ti';
await post({ source: 'boundary', path: PATH_CHE, message: `${MESSAGE} che phuhuynh@vidu.test token=${TOKEN_GIA}` });
// Lần hai y hệt lần đầu: phải gộp vào cùng một nhóm, không đẻ nhóm mới.
await post(
  { source: 'boundary', path: `${PATH}?token=BI-MAT#x`, digest: DIGEST, message: MESSAGE },
  UA_SAFARI
);

// ---------- Admin xem ----------
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
const p = await ctx.newPage();
/*
 * Đăng nhập ở CỬA QUẢN TRỊ trên admin origin. Phiên site không mở được khu này —
 * xem `infra/e2e-admin-origin.mjs`.
 */
await p.goto(`${ADMIN}/admin/dang-nhap`, { waitUntil: 'networkidle' });
await p.fill('#email', ADMIN_EMAIL);
await p.fill('#password', ADMIN_PASS);
await p.click('button[type=submit]');
await p.waitForURL((u) => u.pathname === '/admin', { timeout: 20000 }).catch(() => {});

/** Số nhóm mà bộ lọc đang chọn hiện ra, đọc từ dòng tổng. */
async function tongNhom(loc = 'chua-xu-ly') {
  await p.goto(`${ADMIN}/admin/loi?loc=${loc}`, { waitUntil: 'networkidle' });
  const text = await p.locator('[data-testid=error-total]').innerText();
  return Number(/^(\d+)/.exec(text)?.[1] ?? '0');
}

/** Thẻ của một nhóm, tìm theo đường dẫn hiện trên thẻ. */
const the = (path) =>
  p.locator('[data-testid=error-group]').filter({ has: p.locator(`text="${path}"`) });

await p.goto(`${ADMIN}/admin/loi`, { waitUntil: 'networkidle' });
const duong = await p.locator('[data-testid=error-path]').allInnerTexts();

check('Nhóm lỗi mới hiện trên /admin/loi', duong.includes(PATH), duong.slice(0, 5).join(', '));
check(
  'Query string đã bị cắt khỏi đường dẫn (token không lọt vào bảng lỗi)',
  !(await p.locator('body').innerText()).includes('BI-MAT')
);
check('Đường dẫn tuyệt đối bị quy về khong-ro', duong.includes('khong-ro'));
check('Thân request quá to KHÔNG tạo nhóm nào', !duong.includes(`${PATH}-to`));
check(
  'Thân request rác KHÔNG tạo nhóm nào',
  duong.filter((d) => d.startsWith(PATH)).length === 2,
  `${duong.filter((d) => d.startsWith(PATH)).length} nhóm mang tiền tố ${PATH}`
);

{
  const n = await the(PATH_CHE).count();
  const text = n ? await the(PATH_CHE).innerText() : '';
  check('Nhóm mang email/token có mặt', n === 1, `${n} thẻ`);
  check(
    'Email và token trong thông điệp đã bị che trước khi ghi',
    text.includes(`${MESSAGE} che [email] token=[token]`) && !text.includes('phuhuynh@vidu.test') && !text.includes(TOKEN_GIA),
    text.split('\n').find((d) => d.includes(MESSAGE)) ?? '(không thấy thông điệp)'
  );
}

{
  const text = await the(PATH).innerText();
  check('Thẻ hiện đúng thông điệp lỗi', text.includes(MESSAGE));
  check('Thẻ hiện đúng mã lỗi để dò log server', text.includes(DIGEST));
  check('Gửi hai lần cùng một lỗi thì đếm thành 2, không đẻ nhóm mới', /\b2 lần\b/.test(text));
  check(
    'Thẻ ghi tên trình duyệt rút gọn, không phải cả user agent',
    text.includes('Safari 17') && !text.includes('AppleWebKit'),
    text.includes('Safari 17') ? 'Safari 17' : 'không thấy "Safari 17"'
  );

  const giaMao = await the(`${PATH}-gia`).innerText();
  check(
    'Người ngoài KHÔNG giả được nguồn "server"',
    giaMao.includes('(trang lỗi)') && !giaMao.includes('(server)')
  );

  const lac = await the('khong-ro').first().innerText();
  check(
    'Nhóm không có mã lỗi nói rõ vì sao trống, không để trống',
    lac.includes('Không có mã lỗi')
  );
}

// ---------- Số đếm trên thanh của khu quản trị ----------
/*
 * Số nhóm lỗi chưa xử lý phải thấy được từ MỌI trang trong khu quản trị, không chỉ
 * trang lỗi: một trang giám sát mà phải chủ động mở mới biết có gì thì chỉ được mở
 * lúc người ta đã nghi có chuyện — tức đúng lúc nó không còn cảnh báo được nữa.
 *
 * Trước đây đây là một dòng chữ riêng trên `/admin`; giờ là số trên tab "Lỗi", nên
 * nó đi theo admin sang mọi trang.
 */
{
  const chuaXuLy = await tongNhom('chua-xu-ly');
  await p.goto(`${ADMIN}/admin`, { waitUntil: 'networkidle' });
  const dem = await p.locator('[data-testid=admin-tab-loi-dem]').innerText();
  check(
    'Tab Lỗi trên thanh quản trị hiện đúng số nhóm chưa xử lý',
    dem.trim() === String(chuaXuLy),
    `tab nói ${dem.trim()}, trang lỗi nói ${chuaXuLy}`
  );
}

// ---------- Đánh dấu đã xử lý ----------
{
  const truoc = await tongNhom('chua-xu-ly');
  await the(PATH).locator('[data-testid=error-resolve]').click();
  await p.waitForTimeout(1200);

  check('Bấm "Đã xử lý" thì nhóm rời khỏi mục chưa xử lý', (await tongNhom('chua-xu-ly')) === truoc - 1);

  await p.goto(`${ADMIN}/admin/loi?loc=da-xu-ly`, { waitUntil: 'networkidle' });
  check(
    'Nhóm đã xử lý hiện ở mục "Đã xử lý" kèm mốc thời gian',
    (await the(PATH).locator('[data-testid=error-resolved-at]').count()) === 1
  );

  // Lỗi quay lại SAU khi đánh dấu — thứ quan trọng nhất trang này phải nói ra.
  await post({ source: 'boundary', path: PATH, digest: DIGEST, message: MESSAGE });
  await p.goto(`${ADMIN}/admin/loi?loc=da-xu-ly`, { waitUntil: 'networkidle' });
  check(
    'Lỗi xảy ra lại sau khi đánh dấu thì thẻ cảnh báo rõ (bản vá không ăn)',
    (await the(PATH).locator('[data-testid=error-resolved-at]').innerText()).includes('xảy ra lại')
  );

  await the(PATH).locator('[data-testid=error-reopen]').click();
  await p.waitForTimeout(1200);
  check('Bấm "Mở lại" thì nhóm quay về mục chưa xử lý', (await tongNhom('chua-xu-ly')) === truoc);
}

// ---------- Trần chống lụt ----------
/*
 * ĐỂ CUỐI CÙNG, cố ý: trần tính theo phút cho mỗi người gửi, nên mọi phép kiểm chạy
 * sau bước này trong cùng một phút sẽ bị chặn và trông như hỏng.
 */
{
  const truoc = await tongNhom('tat-ca');
  const gui = RATE_LIMIT_PER_MINUTE + 15;
  for (let i = 0; i < gui; i += 1) {
    await post({ source: 'boundary', path: `${PATH}-tran`, message: `${MESSAGE} so ${i}` });
  }
  const them = (await tongNhom('tat-ca')) - truoc;
  check(
    'Trần chống lụt chặn bớt: gửi nhiều hơn trần thì không phải cái nào cũng được ghi',
    them > 0 && them <= RATE_LIMIT_PER_MINUTE,
    `gửi ${gui}, ghi thêm ${them}`
  );
}

// ---------- Phân trang ----------
{
  /*
   * PHÂN TRANG CHƯA TỪNG CÓ PHÉP KIỂM NÀO, ở cả ba danh sách của khu quản trị. Đặt ở
   * bộ này vì đây là chỗ DUY NHẤT tự sinh ra đủ dữ liệu để có trang thứ hai: bước
   * kiểm trần ở trên bắn hơn 40 lỗi, mà trang lỗi để 30 nhóm một trang.
   *
   * Hướng hỏng đáng lo không phải "thanh phân trang không hiện" — cái đó thấy ngay.
   * Nó là SANG TRANG THÌ RƠI MẤT BỘ LỌC: danh sách đổi, và không có gì trên màn hình
   * nói vì sao, vì bộ lọc chỉ sống trong URL. Người trực đang lọc "chưa xử lý", bấm
   * sang trang 2, rồi đọc một danh sách gồm cả nhóm đã xử lý mà tưởng là chưa.
   */
  const tong = await tongNhom('tat-ca');
  check('Bước kiểm trần đã tạo đủ nhóm để có trang thứ hai', tong > 30, `${tong} nhóm`);

  await p.goto(`${ADMIN}/admin/loi?loc=tat-ca`, { waitUntil: 'networkidle' });
  check(
    'Có hơn một trang thì thanh phân trang hiện ra',
    (await p.locator('[data-testid=error-pager]').count()) === 1
  );
  check(
    'Trang đang mở được đánh dấu aria-current, không chỉ đổi màu',
    (await p.locator('[data-testid=error-pager-so-1]').getAttribute('aria-current')) === 'page'
  );

  const dauTrang1 = await p.locator('[data-testid=error-group]').first().innerText();

  await p.locator('[data-testid=error-pager-so-2]').click();
  await p.waitForURL(/trang=2/, { timeout: 20000 }).catch(() => {});
  check('Bấm số 2 thì sang đúng trang 2', /trang=2/.test(p.url()), p.url());
  check(
    'Sang trang thì bộ lọc đi theo, không lặng lẽ về mặc định',
    /loc=tat-ca/.test(p.url()) &&
      (await p.locator('[data-testid=error-filter-tat-ca]').getAttribute('aria-current')) ===
        'page',
    p.url()
  );

  /* Trang 2 phải là NỘI DUNG KHÁC. Một lỗi `skip` sai — ví dụ quên nhân với PAGE_SIZE
     — vẫn cho ra thanh phân trang đúng, URL đúng, và một trang 2 lặp lại y hệt trang
     1; nhìn từ ngoài không có gì sai cả. */
  const dauTrang2 = await p.locator('[data-testid=error-group]').first().innerText();
  check('Trang 2 hiện nhóm khác trang 1, không lặp lại', dauTrang1 !== dauTrang2);

  /*
   * Ô "tới trang" chỉ bày ra khi danh sách có từ 8 trang (`HIEN_O_NHAY_TU` trong
   * `pager.tsx`) — lúc dãy số đã phải lược bớt. Một ngưỡng viết nhầm thành `>= 1` thì ô
   * nhập xuất hiện trên mọi danh sách hai trang, ngay cạnh hai con số bấm thẳng được.
   *
   * ĐO THEO SỐ TRANG THẬT, không giả định số trang. Bản cũ viết cứng "mới hai trang
   * thì KHÔNG có ô": đúng trên DB sạch, nhưng mỗi lượt bộ này để lại ~40 nhóm lỗi, và
   * tới ngày 14/9 DB dev có 216 nhóm, 8 trang — ô hiện ra đúng thiết kế và phép kiểm đỏ.
   * Giờ nó kiểm cả hai chiều của cùng một luật, chiều nào tuỳ dữ liệu hôm đó.
   */
  const soTrang = Math.max(
    ...(await p
      .locator('[data-testid^=error-pager-so-]')
      .evaluateAll((els) => els.map((e) => Number(e.dataset.testid.split('-').pop()) || 0)))
  );
  const coONhay = (await p.locator('[data-testid=error-pager-nhay]').count()) === 1;
  check(
    'Ô nhảy trang hiện KHI VÀ CHỈ KHI danh sách có từ 8 trang',
    coONhay === soTrang >= 8,
    `${soTrang} trang, ô nhảy ${coONhay ? 'có' : 'không'}`
  );

  /*
   * Trang vượt quá cuối danh sách. Trước đây `skip` chạy qua cuối bảng và màn hình
   * hiện đúng cái mà "không nhóm lỗi nào khớp" hiện — người đọc đi kiểm bộ lọc chứ
   * không nghĩ tới số trang. Không có gì trong repo bắt được kiểu rỗng đó.
   */
  await p.goto(`${ADMIN}/admin/loi?loc=tat-ca&trang=999`, { waitUntil: 'networkidle' });
  check(
    'Trang vượt quá cuối thì NÓI RA, không hiện một danh sách rỗng',
    (await p.locator('[data-testid=error-pager-khong-co]').count()) === 1
  );
  const loiTrang = await p.locator('[data-testid=error-pager-khong-co]').innerText();
  check('Câu đó nói rõ danh sách có mấy trang', /chỉ có \d+ trang/.test(loiTrang), loiTrang.replace(/\n/g, ' '));

  await p.locator('[data-testid=error-pager-khong-co] a').click();
  await p.waitForURL((u) => !/trang=999/.test(u.toString()), { timeout: 20000 }).catch(() => {});
  check('Và có đường về trang cuối, giữ nguyên bộ lọc', /loc=tat-ca/.test(p.url()), p.url());
  check(
    'Về tới nơi thì lại thấy danh sách thật',
    (await p.locator('[data-testid=error-group]').count()) > 0
  );
}

// ---------- Dọn: đưa mọi nhóm về đã xử lý ----------
{
  await p.goto(`${ADMIN}/admin/loi`, { waitUntil: 'networkidle' });
  const nut = p.locator('[data-testid=error-resolve-all]');
  if ((await nut.count()) > 0) {
    await nut.click();
    await p.waitForTimeout(1500);
  }
  check('Nút "Đánh dấu cả" dọn sạch mục chưa xử lý', (await tongNhom('chua-xu-ly')) === 0);
  check(
    'Mục chưa xử lý rỗng thì nói rõ đó là tin tốt, không để trang trắng',
    (await p.locator('body').innerText()).includes('tin tốt')
  );
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
