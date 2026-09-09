/**
 * Kiểm rằng KHÔNG cấu hình hợp lệ nào của `infra/.env` làm Caddy từ chối cả file.
 *
 * VÌ SAO cần bộ riêng: `Caddyfile` lấy tên site từ `{$VAR:mặc-định}`, và mặc định
 * sau dấu `:` chỉ áp dụng khi biến CHƯA ĐƯỢC ĐẶT. Compose thì truyền
 * `${VAR:-}` — tức ĐẶT THÀNH RỖNG. Đặt-mà-rỗng ra một khối site KHÔNG CÓ TÊN, và
 * Caddy từ chối NGUYÊN FILE: app chết, player chết, vì một biến mà chính
 * `.env.example` mời để trống.
 *
 * Cách hỏng này không phép kiểm nào khác trong repo nhìn thấy, vì:
 *   - `docker compose config` vẫn xanh — cú pháp YAML không sai gì;
 *   - bốn service kia vẫn `healthy`, chỉ mình `caddy` crash loop;
 *   - lỗi in ra là `server block without any key is global configuration` và KHÔNG
 *     hề nhắc tới tên biến nào, còn dòng ACME đi kèm nhìn y như DNS chưa trỏ;
 *   - `e2e-prod-*` cần stack đang chạy, mà ở đây stack không lên nổi để mà kiểm.
 *
 * Hai lớp:
 *   1. TĨNH — đọc `Caddyfile` + `docker-compose.yml`, đòi mọi biến được dùng làm
 *      tên site phải được compose chặn không cho ra chuỗi rỗng. Lớp này tự bắt cả
 *      khối site THỨ TƯ mà ai đó thêm sau này. Không cần Docker.
 *   2. THẬT — gọi `caddy validate` thật cho từng kịch bản `.env`, cộng một phép
 *      ĐỐI CHỨNG khẳng định rằng rỗng vẫn còn là lỗi (nếu không thì lớp 1 đang
 *      canh một cái bẫy đã biến mất). Cần Docker; không có thì BỎ QUA và nói rõ.
 *
 * Chạy:
 *   node infra/caddy-config-check.mjs
 *   DOCKER_HOST=ssh://kidovps node infra/caddy-config-check.mjs   # mượn Docker VPS
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const caddyfile = readFileSync(join(here, 'Caddyfile'), 'utf8');
const compose = readFileSync(join(here, 'docker-compose.yml'), 'utf8');
const envExample = readFileSync(join(here, '.env.example'), 'utf8');

let bad = 0;
let tong = 0;
const check = (name, ok, detail = '') => {
  tong++;
  if (!ok) bad++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---------------------------------------------------------------------------
// Đọc cấu trúc ra trước
// ---------------------------------------------------------------------------

/**
 * Mọi biến được dùng làm TÊN SITE, kèm mặc định của Caddy.
 *
 * Cố ý quét bằng regex thay vì liệt kê ba tên đã biết: giá trị của bộ kiểm này nằm
 * ở khối site thứ tư mà người sau thêm vào: người đó sẽ chép dòng `{$X:...} {` từ
 * một khối cũ, và không có lý do gì để họ biết chuyện đặt-mà-rỗng.
 */
const siteKeys = [...caddyfile.matchAll(/^\{\$([A-Z_][A-Z0-9_]*)(?::([^}]*))?\}\s*\{/gm)].map(
  (m) => ({ bien: m[1], macDinh: m[2] ?? null })
);

/** Lấy khối `environment:` của một service trong compose. */
function envCuaService(ten) {
  const batDau = compose.search(new RegExp(`^  ${ten}:$`, 'm'));
  if (batDau < 0) return null;
  const conLai = compose.slice(batDau + 1);
  const ketThuc = conLai.search(/^  \S/m);
  const than = ketThuc < 0 ? conLai : conLai.slice(0, ketThuc);
  const dong = [...than.matchAll(/^\s{6}([A-Z_][A-Z0-9_]*):\s*(.*)$/gm)];
  return Object.fromEntries(dong.map((m) => [m[1], m[2].trim()]));
}

const envCaddy = envCuaService('caddy');
const envWeb = envCuaService('web');
const envPrune = envCuaService('prune');

// ---------------------------------------------------------------------------
console.log('\n── Tên site không bao giờ được rỗng ────────────────────────');

check('Tìm thấy khối environment của service caddy', envCaddy !== null);
check('Caddyfile có ít nhất 3 khối site lấy tên từ biến', siteKeys.length >= 3, `thấy ${siteKeys.length}`);

for (const { bien, macDinh } of siteKeys) {
  const bieuThuc = envCaddy?.[bien] ?? null;

  check(`caddy nhận ${bien}`, bieuThuc !== null, bieuThuc ?? 'KHÔNG được truyền xuống');

  /**
   * Hai dạng hợp lệ, và chỉ hai:
   *   ${VAR:?...}         — compose TỪ CHỐI khởi động khi rỗng, không tới Caddy
   *   ${VAR:-mặc-định}    — rỗng bị thay bằng một tên thật
   *
   * `${VAR-mặc-định}` (thiếu dấu hai chấm) KHÔNG hợp lệ ở đây: nó chỉ đỡ trường hợp
   * chưa-đặt, mà `.env.example` thì ĐẶT dòng `ADMIN_DOMAIN=` rỗng sẵn, nên bản
   * `-` đi thẳng vào đúng cái bẫy này.
   */
  const batBuoc = bieuThuc && new RegExp(`^\\$\\{${bien}:\\?`).test(bieuThuc);
  const macDinhCompose = bieuThuc?.match(new RegExp(`^\\$\\{${bien}:-(.*)\\}$`))?.[1] ?? null;
  check(
    `${bien} không thể xuống Caddy dưới dạng rỗng`,
    Boolean(batBuoc || (macDinhCompose && macDinhCompose.length > 0)),
    bieuThuc ?? '—'
  );

  // Mặc định trong Caddyfile là để chạy `caddy` tay, không qua compose.
  check(`${bien} có mặc định trong Caddyfile`, Boolean(macDinh && macDinh.length > 0), macDinh ?? 'không có');
}

// ---------------------------------------------------------------------------
console.log('\n── Mặc định của ADMIN_DOMAIN phải vô hại ───────────────────');

const macDinhAdmin = envCaddy?.ADMIN_DOMAIN?.match(/^\$\{ADMIN_DOMAIN:-(.*)\}$/)?.[1] ?? '';

/**
 * `.localhost` chứ không phải một tên thật: Caddy coi đuôi đó là nội bộ nên tự cấp
 * chứng chỉ bằng CA riêng (`issuer:"local"`, ~200ms). Một tên thật ở đây nghĩa là
 * ACME thất bại lặp đi lặp lại trên mọi bản deploy không dùng khu quản trị tách
 * riêng — đốt hạn mức Let's Encrypt và rải log đỏ cho một tính năng đang TẮT.
 */
check(
  'Mặc định ADMIN_DOMAIN kết thúc bằng .localhost',
  macDinhAdmin.endsWith('.localhost'),
  macDinhAdmin || '(rỗng)'
);

/**
 * Mặc định đó phải nằm Ở COMPOSE, không phải ở `.env.example`.
 *
 * Cùng một biến nuôi hai thứ khác nhau: tên site của Caddy, và `ADMIN_ORIGIN` của
 * app. Điền `admin.localhost` vào `.env.example` cho "gọn" là bật tách origin sau
 * lưng người deploy — middleware trả 404 cho `/admin` trên app domain, còn host
 * thay thế thì không ai vào được. Tức là chữa một cái sập bằng một cái sập im lặng
 * hơn. Ba phép dưới đây khoá đúng chỗ tách đó.
 */
check(
  '.env.example vẫn để ADMIN_DOMAIN rỗng',
  /^ADMIN_DOMAIN=\s*$/m.test(envExample),
  envExample.match(/^ADMIN_DOMAIN=.*$/m)?.[0] ?? 'không có dòng nào'
);

for (const [ten, env] of [
  ['web', envWeb],
  ['prune', envPrune],
]) {
  check(
    `${ten}.ADMIN_ORIGIN giữ rỗng khi ADMIN_DOMAIN rỗng`,
    env?.ADMIN_ORIGIN?.startsWith('${ADMIN_DOMAIN:+') === true,
    env?.ADMIN_ORIGIN ?? 'không có'
  );
}

// ---------------------------------------------------------------------------
console.log('\n── caddy validate thật ─────────────────────────────────────');

const coDocker = (() => {
  try {
    execFileSync('docker', ['image', 'inspect', 'caddy:2'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

if (!coDocker) {
  console.log('⚠️  KHÔNG có Docker (hoặc thiếu image caddy:2) — BỎ QUA 4 phép kiểm thật.');
  console.log('    Chạy lại khi có Docker, hoặc mượn máy khác: DOCKER_HOST=ssh://kidovps');
} else {
  /**
   * Chạy `caddy validate` với đúng bộ biến compose sẽ truyền xuống.
   *
   * Đẩy Caddyfile qua STDIN chứ không bind mount: bind mount giải đường dẫn trên
   * máy chạy DAEMON, nên `DOCKER_HOST=ssh://kidovps` sẽ đi tìm `/Users/...` trên
   * VPS và mount một thư mục rỗng. Mượn Docker máy khác là đường chạy được lớp
   * này khi Docker Desktop trên máy dev đang tắt, nên nó phải hoạt động.
   */
  function validate(bien) {
    const args = ['run', '--rm', '-i', '--entrypoint', 'sh'];
    for (const [k, v] of Object.entries(bien)) args.push('-e', `${k}=${v}`);
    args.push('caddy:2', '-c', 'cat > /tmp/Caddyfile && exec caddy validate --config /tmp/Caddyfile --adapter caddyfile');
    try {
      execFileSync('docker', args, { input: caddyfile, stdio: 'pipe', encoding: 'utf8' });
      return { ok: true, loi: '' };
    } catch (e) {
      const ra = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      return { ok: false, loi: ra.split('\n').filter((d) => d.startsWith('Error:'))[0] ?? 'lỗi không rõ' };
    }
  }

  // Tên thật dùng `.localhost` để validate không kéo theo chuyện DNS.
  const nen = { APP_DOMAIN: 'app.kg.localhost', PLAYER_DOMAIN: 'play.kg.localhost', ADMIN_EMAIL: 'a@b.local' };

  // Kịch bản 1: `.env` chép từ `.env.example` và chưa đụng ADMIN_DOMAIN — đúng cái
  // đã giết Caddy trên VPS.
  const r1 = validate({ ...nen, ADMIN_DOMAIN: macDinhAdmin });
  check('ADMIN_DOMAIN để trống trong .env → config hợp lệ', r1.ok, r1.loi);

  // Kịch bản 2: đã tách origin thật.
  const r2 = validate({ ...nen, ADMIN_DOMAIN: 'admin.kg.localhost' });
  check('ADMIN_DOMAIN có giá trị → config hợp lệ', r2.ok, r2.loi);

  // Kịch bản 3: chạy `caddy` tay, không biến nào — mặc định trong Caddyfile đỡ.
  const r3 = validate({});
  check('Không biến nào → mặc định trong Caddyfile đỡ được', r3.ok, r3.loi);

  /**
   * ĐỐI CHỨNG. Ba phép trên xanh vì compose đã chặn rỗng, chứ KHÔNG phải vì Caddy
   * đã thôi coi tên rỗng là lỗi. Không có phép này thì ngày Caddy đổi hành vi, ba
   * phép trên vẫn xanh và bộ kiểm lặng lẽ thành vô nghĩa.
   */
  const r0 = validate({ ...nen, ADMIN_DOMAIN: '' });
  check(
    'Đối chứng: tên site rỗng VẪN là lỗi Caddy',
    !r0.ok && /server block without any key/.test(r0.loi),
    r0.ok ? 'Caddy đã CHẤP NHẬN tên rỗng — đọc lại cả bộ kiểm này' : r0.loi
  );
}

console.log(`\n${tong - bad}/${tong} phép kiểm đạt`);
process.exit(bad ? 1 : 0);
