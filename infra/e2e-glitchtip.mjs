/**
 * Kiểm đường lỗi SERVER → GlitchTip ở dev: `/dev/nem-loi` ném → `instrumentation.ts`
 * → `lib/glitchtip.ts` → một MÁY NHẬN GIẢ do chính bộ kiểm này dựng.
 *
 * Máy nhận giả chứ không phải GlitchTip thật, cố ý: câu cần trả lời ở đây là "app gửi
 * ĐÚNG NHỮNG GÌ", tức phải đọc được từng byte rời khỏi app — cookie, IP, user agent,
 * query string, email, token có lọt không. GlitchTip thật nuốt envelope rồi chỉ bày ra
 * những trường nó hiểu, nên thứ thừa gửi đi sẽ không bao giờ hiện ra để mà thấy.
 * Chặng "GlitchTip thật nhận được" đo ở `infra/glitchtip-check.mjs` trên production.
 *
 * DEV SERVER PHẢI CHẠY VỚI DSN TRỎ VỀ MÁY NHẬN GIẢ (Next đọc biến lúc khởi động):
 *   cd apps/web && GLITCHTIP_DSN=http://0123456789abcdef0123456789abcdef@127.0.0.1:3997/7 pnpm dev
 *   node infra/e2e-glitchtip.mjs
 *
 * Chạy lại trong cùng một phút thì phép kiểm trần có thể đỏ: trần đếm theo tiến trình
 * dev server, và lượt trước đã tiêu nó. Chờ 60 giây.
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const PORT = 3997;
const KHOA = '0123456789abcdef0123456789abcdef';
/** Trần trong `lib/glitchtip.ts`. Đổi ở đó thì đổi luôn ở đây. */
const TRAN_MOI_PHUT = 30;

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mọi envelope máy nhận giả đã nhận: { headers, raw, event }. */
const nhan = [];
/** `true` = nhận request nhưng không bao giờ trả lời, để đo timeout phía app. */
let treo = false;

const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    let event = null;
    try {
      event = JSON.parse(raw.split('\n')[2]);
    } catch {}
    nhan.push({ url: req.url, headers: req.headers, raw, event });
    if (treo) return;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"id":"x"}');
  });
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

/** Chờ tới khi có envelope thoả `dieuKien`, tối đa `ms`. */
async function cho(dieuKien, ms = 8000) {
  const het = Date.now() + ms;
  while (Date.now() < het) {
    const x = nhan.find(dieuKien);
    if (x) return x;
    await ngu(100);
  }
  return null;
}

const ma = randomBytes(4).toString('hex');
/* Những thứ KHÔNG được rời app. Đặt giá trị riêng để tìm được trong envelope thô. */
const COOKIE = `kg_session=cookieBiMat${ma}XyZ`;
const UA = `TrinhDuyetThu/${ma}`;
const IP = '203.0.113.99';

// ---------------------------------------------------------------------------
console.log('\n── Một lỗi server tới được máy nhận ────────────────────────');

const r = await fetch(`${APP}/dev/nem-loi?ma=${ma}&email=phuhuynh@vidu.test&token=truyVanBiMat${ma}`, {
  headers: { cookie: COOKIE, 'user-agent': UA, 'x-forwarded-for': IP },
}).catch((e) => ({ status: `lỗi mạng: ${e.message}` }));
check('Route thử ném lỗi → 500', r.status === 500, String(r.status));

const env = await cho((x) => x.raw.includes(ma));
check(
  'Máy nhận giả nhận được envelope mang mã của lượt này',
  Boolean(env),
  env ? '' : `nhận ${nhan.length} envelope, không cái nào khớp — dev server có chạy với GLITCHTIP_DSN trỏ về 127.0.0.1:${PORT} không?`
);

if (env) {
  const ev = env.event ?? {};
  const loi = ev.exception?.values?.[0] ?? {};

  check('Đúng endpoint envelope của project 7', env.url === '/api/7/envelope/', env.url);
  check('Gửi kèm khoá DSN', (env.headers['x-sentry-auth'] ?? '').includes(`sentry_key=${KHOA}`));
  check('Content-Type envelope', env.headers['content-type'] === 'application/x-sentry-envelope', env.headers['content-type']);
  check('Loại lỗi là Error', loi.type === 'Error', loi.type);
  check('Có stack frame', (loi.stacktrace?.frames?.length ?? 0) > 0, `${loi.stacktrace?.frames?.length ?? 0} frame`);
  check('Tag route = /dev/nem-loi', ev.tags?.route === '/dev/nem-loi', ev.tags?.route);
  check('Tag route_type = route', ev.tags?.route_type === 'route', ev.tags?.route_type);
  check('request.url không mang query string', ev.request?.url === '/dev/nem-loi', ev.request?.url);

  console.log('\n── Không gì riêng tư rời khỏi app ──────────────────────────');

  // Soi trên chuỗi THÔ, không trên trường đã parse: thứ lọt vào một trường lạ vẫn phải bị bắt.
  const khongCo = [
    ['cookie phiên', `cookieBiMat${ma}`],
    ['user agent', UA],
    ['IP', IP],
    /* Cả dạng mã hoá: trong URL thật `@` thành `%40`. Chỉ tìm dạng `@` thì email lọt
       qua `request.url` mà phép này vẫn xanh — đã thấy đúng như vậy khi thử cho đỏ. */
    ['email trong query string', 'phuhuynh@vidu.test'],
    ['email trong query string (mã hoá)', 'phuhuynh%40vidu.test'],
    ['token trong query string', `truyVanBiMat${ma}`],
    ['email trong thông điệp lỗi', 'be@vidu.test'],
    ['token trong thông điệp lỗi', 'Zx9aQ2mPl7Rt4Kw8Yb3Nc6Vd1Hf5Jg0Ls2Qe7Uo9Ti'],
    ['query string của URL trong thông điệp', 'bimat123'],
  ];
  for (const [ten, chuoi] of khongCo) {
    check(`Không gửi ${ten}`, !env.raw.includes(chuoi), env.raw.includes(chuoi) ? `LỌT: ${chuoi}` : '');
  }
  check('Thông điệp vẫn giữ phần chẩn đoán được', loi.value?.includes(`Loi thu glitchtip ${ma}`), loi.value);
  check('Chỗ bị che có đánh dấu', /\[email\]/.test(loi.value) && /\[token\]/.test(loi.value), loi.value);

  const truongLa = Object.keys(ev).filter((k) => ['user', 'contexts', 'server_name', 'extra', 'breadcrumbs', 'modules'].includes(k));
  check('Không có trường user/contexts/server_name/extra/breadcrumbs/modules', truongLa.length === 0, truongLa.join(', '));
  check('request chỉ có method và url', Object.keys(ev.request ?? {}).every((k) => ['method', 'url'].includes(k)), Object.keys(ev.request ?? {}).join(', '));
}

// ---------------------------------------------------------------------------
console.log('\n── Máy nhận treo thì app không treo theo ───────────────────');

treo = true;
const t0 = Date.now();
const rTreo = await fetch(`${APP}/dev/nem-loi?ma=treo${ma}`, { signal: AbortSignal.timeout(20_000) }).catch((e) => ({ status: e.name }));
const msTreo = Date.now() - t0;
/* Next CHỜ `onRequestError` xong mới trả trang lỗi. Bản đầu `await` việc gửi và đo
   được 3037ms = đúng timeout 3 giây của `lib/glitchtip.ts`. Ngưỡng 1,5 giây nằm dưới
   timeout đó, nên `await` quay lại là phép này đỏ. */
check('Vẫn trả 500, dưới 1,5 giây', rTreo.status === 500 && msTreo < 1500, `${rTreo.status} sau ${msTreo}ms`);
/* Việc gửi vẫn phải xảy ra, chỉ là sau response. */
check('Envelope của lượt treo vẫn được gửi đi', Boolean(await cho((x) => x.raw.includes(`treo${ma}`), 5000)));
treo = false;

// ---------------------------------------------------------------------------
console.log('\n── Trần lỗi mỗi phút ───────────────────────────────────────');

const truoc = nhan.length;
await Promise.all(
  Array.from({ length: TRAN_MOI_PHUT + 15 }, (_, i) => fetch(`${APP}/dev/nem-loi?ma=lu${i}${ma}`).catch(() => null))
);
await ngu(3000);
const guiTrongDot = nhan.length - truoc;
/* Hai lượt đầu (lỗi thật + lỗi treo) đã tiêu 2 suất trong cùng cửa sổ một phút. */
check(
  `Gửi ${TRAN_MOI_PHUT + 15} lỗi liền → máy nhận thấy không quá ${TRAN_MOI_PHUT - 2}`,
  guiTrongDot > 0 && guiTrongDot <= TRAN_MOI_PHUT - 2,
  `nhận ${guiTrongDot}`
);

server.close();
const dat = results.filter(Boolean).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt`);
process.exit(dat === results.length ? 0 : 1);
