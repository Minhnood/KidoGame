/**
 * Kiểm GlitchTip trên BẢN ĐANG CHẠY THẬT: nhận được lỗi, và không mở ra thứ gì không nên mở.
 *
 * VÌ SAO có bộ riêng: GlitchTip chỉ tồn tại trong stack Docker trên VPS. Phía app (bộ gửi
 * gửi đúng những gì) đã đo ở `infra/e2e-glitchtip.mjs` trên dev, với máy nhận giả. Bộ này
 * đo nửa còn lại, thứ dev không có: đăng ký tự do đã tắt thật, DSN không lọt xuống
 * trình duyệt, container web cầm DSN nội bộ, và một lỗi đi được từ web tới GlitchTip.
 *
 * Hai lớp:
 *   1. TỪ NGOÀI — chỉ cần mạng.
 *   2. QUA SSH `kidovps` — đọc biến trong container và gửi một lỗi thử trong network
 *      nội bộ. Không SSH được thì BỎ QUA và nói rõ. Lỗi thử bị XOÁ ở cuối, không đọng
 *      trong dashboard.
 *
 * Chạy (từ máy Mac):
 *   node infra/glitchtip-check.mjs
 *
 * Đổi đích:  APP=https://app.kidogame.vn LOI=https://loi.kidogame.vn node infra/glitchtip-check.mjs
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const APP = process.env.APP ?? 'https://app.37-60-251-95.sslip.io';
const LOI = process.env.LOI ?? 'https://loi.37-60-251-95.sslip.io';
const SSH = process.env.SSH_HOST ?? 'kidovps';
const DIR = '/root/KidoGame/infra';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const lay = async (url, init = {}) => {
  try {
    const r = await fetch(url, { redirect: 'manual', ...init });
    return { status: r.status, headers: r.headers, text: await r.text() };
  } catch (e) {
    return { status: 0, headers: new Headers(), text: String(e) };
  }
};

console.log('\n── Dashboard: sống, và cửa đăng ký đã đóng ─────────────────');
{
  const h = await lay(`${LOI}/_health/`);
  check('GlitchTip sống', h.status === 200, `${h.status}`);

  const s = await lay(`${LOI}/api/settings/`);
  let st = {};
  try {
    st = JSON.parse(s.text);
  } catch {}
  check('Settings báo tắt đăng ký tự do', st.enableUserRegistration === false, String(st.enableUserRegistration));
  check('… tắt đăng ký qua mạng xã hội', st.enableSocialAppsUserRegistration === false, String(st.enableSocialAppsUserRegistration));
  check('… chỉ superuser tạo được tổ chức', st.enableOrganizationCreation === false, String(st.enableOrganizationCreation));
  check('GlitchTip không tự gửi lỗi của nó ra ngoài (sentryDSN rỗng)', st.sentryDSN === null, String(st.sentryDSN));

  for (const d of ['/admin/', '/api/docs']) {
    const r = await lay(`${LOI}${d}`);
    check(`${d} đóng`, r.status === 404, `${r.status}`);
  }

  /*
   * THỬ ĐĂNG KÝ THẬT, không tin mỗi settings. Phải qua được CSRF trước: request trần
   * luôn ra 403 vì CSRF kể cả khi đăng ký ĐANG MỞ — đã bị lừa đúng như vậy lúc dựng.
   * Nên có ĐỐI CHỨNG: cùng cookie + token, đăng nhập sai mật khẩu phải ra 400. Chỉ
   * khi đối chứng qua được CSRF thì 403 của đăng ký mới có nghĩa là "đóng".
   */
  const cfg = await lay(`${LOI}/_allauth/browser/v1/config`);
  const tok = /csrftoken=([^;]+)/.exec(cfg.headers.get('set-cookie') ?? '')?.[1] ?? '';
  check('Lấy được CSRF token', Boolean(tok));
  const hdr = { 'content-type': 'application/json', 'x-csrftoken': tok, cookie: `csrftoken=${tok}`, origin: LOI, referer: `${LOI}/` };
  const dc = await lay(`${LOI}/_allauth/browser/v1/auth/login`, {
    method: 'POST',
    headers: hdr,
    body: JSON.stringify({ email: `khong-co-${randomBytes(3).toString('hex')}@vidu.test`, password: 'sai-hoan-toan-1' }),
  });
  check('Đối chứng: đăng nhập sai qua được CSRF và ra 400', dc.status === 400, `${dc.status} ${dc.text.slice(0, 60)}`);
  const dk = await lay(`${LOI}/_allauth/browser/v1/auth/signup`, {
    method: 'POST',
    headers: hdr,
    body: JSON.stringify({ email: `do-thu-${randomBytes(3).toString('hex')}@vidu.test`, password: 'Xy12345678!!aa' }),
  });
  check('Đăng ký tài khoản mới bị từ chối (403 của allauth, không phải CSRF)', dk.status === 403 && dk.text.trim().startsWith('{'), `${dk.status} ${dk.text.slice(0, 40)}`);
}

console.log('\n── App domain: không lộ GlitchTip, không lộ DSN ───────────');
{
  /* GlitchTip KHÔNG có đường nào trên app domain: chỉ server gửi, qua network nội bộ. */
  /* Đi THEO chuyển hướng: Next trả 308 để bỏ dấu `/` cuối, và bản đầu chấp nhận 308 —
     tức xanh mà chưa hề hỏi tới đích. Đích thật phải là 404/405 của Next. */
  for (const d of ['/_health/', '/api/1/envelope/', '/api/settings/']) {
    const r = await lay(`${APP}${d}`, { method: d.includes('envelope') ? 'POST' : 'GET', redirect: 'follow' });
    check(
      `${d} trên app domain không phải GlitchTip`,
      (r.status === 404 || r.status === 405) && !r.text.includes('enableUserRegistration'),
      `${r.status}`
    );
  }

  const dev = await lay(`${APP}/dev/nem-loi`);
  check('Route thử ném lỗi /dev/nem-loi là 404 ở production', dev.status === 404, `${dev.status}`);

  /* DSN chỉ sống phía server. Soi trang chủ và mọi file JS nó tải. */
  const home = await lay(`${APP}/`);
  const js = [...home.text.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
  let lo = [];
  for (const f of [null, ...js]) {
    const t = f ? (await lay(`${APP}${f}`)).text : home.text;
    for (const dau of ['sentry_key', 'glitchtip:8000', 'GLITCHTIP_DSN', new URL(LOI).hostname]) {
      if (t.includes(dau)) lo.push(`${f ?? 'trang chủ'}: ${dau}`);
    }
  }
  check(`Không thấy DSN/GlitchTip trong trang chủ và ${js.length} file JS`, js.length > 0 && lo.length === 0, lo.join('; ') || `${js.length} file`);
  check("CSP của app vẫn connect-src 'self'", /connect-src 'self'(;|$)/.test(home.headers.get('content-security-policy') ?? ''));
}

console.log('\n── Trong máy chủ (qua SSH) ─────────────────────────────────');
/**
 * KHÔNG NÉM. Lệnh hỏng thì trả về stdout+stderr để phép kiểm in ra và báo đỏ — bản đầu
 * để `execFileSync` ném, và khi web chưa có DSN thì cả bộ đổ giữa chừng thay vì đỏ.
 */
const ssh = (lenh) => {
  try {
    return execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', SSH, lenh], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return `LOI: ${`${e.stdout ?? ''}${e.stderr ?? ''}`.split('\n').filter(Boolean).slice(-1)[0] ?? e.message}`;
  }
};

let coSsh = true;
if (ssh('echo ok').trim() !== 'ok') {
  coSsh = false;
  console.log(`⚠️  Không SSH được tới ${SSH} — BỎ QUA lớp này.`);
}

if (coSsh) {
  /* Chỉ in DẠNG của DSN, không in khoá. */
  const dang = ssh(
    `cd ${DIR} && docker compose exec -T web node -e "const d=process.env.GLITCHTIP_DSN||''; try{const u=new URL(d); console.log(u.protocol+'//'+(u.username?'<khoa>':'')+'@'+u.host+u.pathname)}catch{console.log('RONG')}"`
  ).trim();
  check('Container web cầm DSN nội bộ http://…@glitchtip:8000/<id>', /^http:\/\/<khoa>@glitchtip:8000\/\d+$/.test(dang), dang);

  const bien = ssh(
    `cd ${DIR} && docker compose exec -T glitchtip sh -c 'for k in ENABLE_USER_REGISTRATION ENABLE_ADMIN VALKEY_URL GLITCHTIP_RETENTION_DAYS; do printf "%s=%s\\n" "$k" "$(printenv $k)"; done'`
  );
  const env = Object.fromEntries(bien.trim().split('\n').map((d) => d.split(/=(.*)/s).slice(0, 2)));
  check('Giữ lỗi không quá 90 ngày (lời hứa trên /dieu-khoan)', Number(env.GLITCHTIP_RETENTION_DAYS) > 0 && Number(env.GLITCHTIP_RETENTION_DAYS) <= 90, env.GLITCHTIP_RETENTION_DAYS);
  check('Không Valkey (VALKEY_URL rỗng)', env.VALKEY_URL === '', JSON.stringify(env.VALKEY_URL));

  /*
   * Một lỗi đi được từ container web tới GlitchTip, bằng đúng DSN web đang cầm. Không
   * dựng được lỗi thật của app ở production mà không cài sẵn một chỗ hỏng — phần "app
   * gửi gì" đã đo ở e2e-glitchtip trên dev.
   */
  const ma = `glitchtipcheck${randomBytes(4).toString('hex')}`;
  const gui = ssh(
    `cd ${DIR} && docker compose exec -T web node -e '
const u=new URL(process.env.GLITCHTIP_DSN); const id=crypto.randomUUID().replace(/-/g,"");
const ev={event_id:id,timestamp:Date.now()/1000,platform:"node",level:"error",environment:"kiem-tra",exception:{values:[{type:"GlitchtipCheck",value:"${ma}"}]}};
fetch(u.protocol+"//"+u.host+"/api"+u.pathname+"/envelope/",{method:"POST",headers:{"Content-Type":"application/x-sentry-envelope","X-Sentry-Auth":"Sentry sentry_version=7, sentry_key="+u.username+", sentry_client=glitchtip-check/1"},body:JSON.stringify({event_id:id})+"\\n"+JSON.stringify({type:"event"})+"\\n"+JSON.stringify(ev)})
.then(r=>console.log(r.status)).catch(e=>console.log("loi",e.message))'`
  ).trim();
  check('Container web gửi lỗi thử tới GlitchTip → 200', gui === '200', gui);

  /* GlitchTip xử lý bất đồng bộ qua hàng đợi trong Postgres — chờ tối đa ~20 giây. */
  let so = 0;
  for (let i = 0; i < 20 && so === 0; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    so = Number(
      ssh(`cd ${DIR} && docker compose exec -T db psql -U kidogame -d glitchtip -tAc "select count(*) from issue_events_issue where title like '%${ma}%'"`).trim()
    );
  }
  check('Lỗi thử có mặt trong GlitchTip', so === 1, `${so} issue`);

  /* Dọn qua ORM của GlitchTip, không xoá SQL tay: bảng sự kiện chia partition và có khoá ngoại. */
  const xoa = ssh(
    `cd ${DIR} && docker compose exec -T glitchtip ./manage.py shell -c "from apps.issue_events.models import Issue; print(Issue.objects.filter(title__contains='${ma}').delete()[0])" 2>/dev/null | tail -1`
  ).trim();
  const con = Number(
    ssh(`cd ${DIR} && docker compose exec -T db psql -U kidogame -d glitchtip -tAc "select count(*) from issue_events_issue where title like '%${ma}%'"`).trim()
  );
  /* Đòi đã xoá ÍT NHẤT một dòng: không có lỗi thử nào để xoá thì "còn 0" là xanh suông. */
  check('Đã dọn lỗi thử khỏi dashboard', Number(xoa) >= 1 && con === 0, `xoá ${xoa} dòng, còn ${con}`);
}

const dat = results.filter(Boolean).length;
console.log(`\n${dat}/${results.length} kiểm tra đạt`);
process.exit(dat === results.length ? 0 : 1);
