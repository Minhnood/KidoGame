/**
 * Kiểm tra đường gửi mail thật, TRƯỚC khi mở web cho người dùng.
 *
 * VÌ SAO cần một script riêng: từ khi bắt xác minh email, mail hỏng không còn là
 * phiền toái nhỏ nữa — phụ huynh không xác minh được thì không tạo được tài khoản
 * cho con, tức đứa trẻ không có gì để đăng game. Nhưng `docker compose up` vẫn
 * xanh, trang chủ vẫn chạy, và không có gì báo cho ta biết. Lỗi chỉ lộ ra khi một
 * phụ huynh thật bấm nút và không nhận được thư — lúc đó họ đã bỏ đi rồi.
 *
 * Script này biến "chắc là ổn" thành một câu trả lời có/không.
 *
 * Chạy:
 *   node infra/mail-check.mjs                      # chỉ kiểm cấu hình + DNS
 *   node infra/mail-check.mjs --send you@gmail.com # gửi thật một lá tới hòm thư của bạn
 *
 * Tự đọc infra/.env, không cần nạp trước. Biến đã có sẵn trong môi trường thì
 * thắng file.
 */
import { promises as dns } from 'node:dns';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Đọc infra/.env theo cách docker compose đọc, KHÔNG qua shell.
 *
 * VÌ SAO không bảo người ta `set -a && . infra/.env`: file .env không phải shell
 * script. `MAIL_FROM=KidoGame <no-reply@…>` có dấu `<` là chuyển hướng, và
 * `OPERATOR_NAME=KidoGame (thử local)` có dấu ngoặc — shell vỡ ở cả hai, in một
 * dòng parse error rồi đi tiếp, để lại biến RỖNG. Nghĩa là công cụ kiểm mail sẽ
 * báo "chưa đặt MAIL_FROM" trong khi nó đặt rồi, và người ta đi sửa nhầm chỗ.
 * Chính bẫy này đã vấp thật khi lần đầu chạy lệnh viết trong README.
 */
function loadEnvFile() {
  const here = dirname(fileURLToPath(import.meta.url));
  let raw;
  try {
    raw = readFileSync(join(here, '.env'), 'utf8');
  } catch {
    return; // Không có file cũng không sao — có thể env đến từ nơi khác.
  }

  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    // Bỏ nháy bao ngoài nếu có, giống compose.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    // Biến truyền thẳng vào lệnh phải thắng file.
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

loadEnvFile();

const args = process.argv.slice(2);
const sendIdx = args.indexOf('--send');
const sendTo = sendIdx >= 0 ? args[sendIdx + 1] : null;

if (sendIdx >= 0 && !sendTo) {
  console.error('Thiếu địa chỉ sau --send. Ví dụ: --send ban@gmail.com');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const note = (text) => console.log(`   ${text}`);

// ---------------------------------------------------------------------------
// 1. Cấu hình
// ---------------------------------------------------------------------------
console.log('\n── Cấu hình ────────────────────────────────────────────────');

const apiKey = process.env.RESEND_API_KEY;
check('Có RESEND_API_KEY', !!apiKey, apiKey ? `re_…${apiKey.slice(-4)}` : 'CHƯA ĐẶT');
if (!apiKey) {
  note('Thiếu key thì ở production `sendMail` ném lỗi chứ không in ra log —');
  note('cố ý như vậy, vì log production chứa token là rò token.');
  note('Lấy key ở https://resend.com/api-keys');
}

const mailFrom = process.env.MAIL_FROM;
check('Có MAIL_FROM', !!mailFrom, mailFrom ?? 'CHƯA ĐẶT (sẽ rơi về no-reply@kidogame.local)');

/**
 * Tách địa chỉ ra khỏi dạng `Tên Hiển Thị <a@b.c>`.
 *
 * Sai định dạng ở đây là kiểu lỗi tệ nhất: Resend trả 422, `sendMail` ném lỗi, và
 * người dùng chỉ thấy "gửi thư thất bại" mà không ai biết vì sao.
 */
function parseFrom(value) {
  if (!value) return null;
  const angle = value.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : value).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) ? addr : null;
}

const fromAddr = parseFrom(mailFrom);
check('MAIL_FROM đúng định dạng', !!fromAddr, fromAddr ?? 'không tách được địa chỉ');

const fromDomain = fromAddr?.split('@')[1] ?? null;

/*
 * infra/.env chỉ khai APP_DOMAIN; APP_ORIGIN do compose dựng ra
 * (`APP_ORIGIN: https://${APP_DOMAIN}`). Dựng lại y hệt ở đây, không thì công cụ
 * báo thiếu APP_ORIGIN trong khi container chạy hoàn toàn đúng — một báo động giả
 * dẫn người ta đi thêm một biến thừa vào .env.
 */
const appOrigin =
  process.env.APP_ORIGIN ?? (process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : undefined);
check(
  'Có APP_ORIGIN',
  !!appOrigin,
  appOrigin
    ? process.env.APP_ORIGIN
      ? appOrigin
      : `${appOrigin} (dựng từ APP_DOMAIN, đúng như compose làm)`
    : 'CHƯA ĐẶT (link trong mail sẽ trỏ về localhost:3000)'
);
if (appOrigin && !/^https:\/\//.test(appOrigin)) {
  note('APP_ORIGIN không phải https — link xác minh gửi cho phụ huynh sẽ là http.');
}

// ---------------------------------------------------------------------------
// 2. Domain đã xác minh với Resend chưa
// ---------------------------------------------------------------------------
let resendDomain = null;

if (apiKey && fromDomain) {
  console.log('\n── Domain ở Resend ─────────────────────────────────────────');
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    // Resend trả 400 chứ không phải 401 cho key sai — dễ tưởng là lỗi mạng.
    if ([400, 401, 403].includes(res.status)) {
      check('API key dùng được', false, `Resend trả ${res.status} — key sai, giả, hoặc đã bị thu hồi`);
      note('Lấy key thật ở https://resend.com/api-keys rồi đặt vào infra/.env.');
    } else if (!res.ok) {
      check('API key dùng được', false, `Resend trả ${res.status}`);
    } else {
      check('API key dùng được', true);
      const body = await res.json();
      const domains = body.data ?? [];

      // Địa chỉ gửi có thể là subdomain của domain đã đăng ký (mail.kidogame.vn
      // gửi được bằng domain kidogame.vn), nên so cả hai chiều.
      resendDomain =
        domains.find((d) => d.name === fromDomain) ??
        domains.find((d) => fromDomain.endsWith(`.${d.name}`)) ??
        null;

      check(
        `Domain "${fromDomain}" đã đăng ký ở Resend`,
        !!resendDomain,
        resendDomain
          ? `tên "${resendDomain.name}", trạng thái ${resendDomain.status}`
          : domains.length
            ? `chỉ thấy: ${domains.map((d) => d.name).join(', ')}`
            : 'tài khoản chưa có domain nào'
      );

      if (resendDomain) {
        check(
          'Resend báo domain đã verified',
          resendDomain.status === 'verified',
          resendDomain.status
        );
        if (resendDomain.status !== 'verified') {
          note('Chưa verified thì mail gửi đi sẽ bị từ chối hoặc rơi thẳng vào spam.');
          note('Vào https://resend.com/domains, thêm bản ghi DNS rồi bấm Verify.');
        }
      } else {
        note('Chưa đăng ký domain thì Resend chỉ cho gửi tới chính hòm thư của chủ');
        note('tài khoản — đủ để thử, KHÔNG đủ để mở cho người dùng thật.');
      }
    }
  } catch (err) {
    check('Gọi được API Resend', false, String(err.message ?? err));
  }
}

// ---------------------------------------------------------------------------
// 3. DNS
// ---------------------------------------------------------------------------
// Hỏi thẳng DNS công cộng thay vì tin trạng thái Resend cache lại: bản ghi có thể
// đã bị xoá hoặc bị nhà cung cấp DNS ghi đè sau lần verify.
console.log('\n── DNS ─────────────────────────────────────────────────────');

if (!fromDomain) {
  console.log('   Bỏ qua: chưa biết domain gửi.');
} else {
  const txtOf = async (name) => {
    try {
      return (await dns.resolveTxt(name)).map((chunks) => chunks.join(''));
    } catch {
      return [];
    }
  };

  // Resend trả về đúng danh sách bản ghi mà domain này cần. Kiểm theo danh sách
  // đó thay vì chép cứng, vì Resend đổi region là đổi hostname.
  if (resendDomain?.records?.length) {
    for (const rec of resendDomain.records) {
      const fqdn = rec.name.endsWith(resendDomain.name)
        ? rec.name
        : `${rec.name}.${resendDomain.name}`.replace(/^\.+/, '');

      if (rec.type === 'TXT') {
        const found = await txtOf(fqdn);
        const want = String(rec.value).trim();
        const ok = found.some((v) => v.trim() === want || v.includes(want.slice(0, 40)));
        check(`TXT ${fqdn}`, ok, ok ? 'khớp' : found.length ? 'có bản ghi nhưng KHÁC giá trị' : 'không tìm thấy');
      } else if (rec.type === 'MX') {
        let ok = false;
        let detail = 'không tìm thấy';
        try {
          const mx = await dns.resolveMx(fqdn);
          ok = mx.some((m) => m.exchange === rec.value);
          detail = ok ? 'khớp' : mx.map((m) => m.exchange).join(', ');
        } catch {
          /* giữ nguyên detail */
        }
        check(`MX ${fqdn}`, ok, detail);
      }
    }
  } else {
    // Không có danh sách từ Resend (chưa có key, hoặc chưa đăng ký domain) thì
    // vẫn kiểm được ba thứ chung của mọi nhà cung cấp.
    const spf = (await txtOf(fromDomain)).filter((v) => v.startsWith('v=spf1'));
    check('Có bản ghi SPF', spf.length > 0, spf[0] ?? 'không tìm thấy v=spf1');
    if (spf.length > 1) note('CÓ HAI SPF — sai chuẩn, hòm thư nhận sẽ coi như không có cái nào.');

    const dkim = await txtOf(`resend._domainkey.${fromDomain}`);
    check('Có DKIM của Resend', dkim.length > 0, dkim.length ? 'có' : 'không thấy resend._domainkey');
  }

  const dmarc = (await txtOf(`_dmarc.${fromDomain}`)).filter((v) => v.startsWith('v=DMARC1'));
  check('Có bản ghi DMARC', dmarc.length > 0, dmarc[0] ?? 'không tìm thấy _dmarc');
  if (!dmarc.length) {
    note('Thiếu DMARC không chặn gửi, nhưng Gmail và Yahoo hạ điểm nặng — thư dễ vào spam.');
    note('Bắt đầu an toàn bằng: v=DMARC1; p=none; rua=mailto:<email của bạn>');
  }
}

// ---------------------------------------------------------------------------
// 4. Gửi thật
// ---------------------------------------------------------------------------
if (sendTo) {
  console.log('\n── Gửi thử ─────────────────────────────────────────────────');

  if (!apiKey) {
    check('Gửi được thư thật', false, 'không có RESEND_API_KEY nên không gửi');
  } else {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: mailFrom ?? 'KidoGame <no-reply@kidogame.local>',
          to: [sendTo],
          subject: 'KidoGame — thư kiểm tra đường gửi',
          text: [
            'Đây là thư kiểm tra do infra/mail-check.mjs gửi.',
            '',
            'Nhận được thư này nghĩa là RESEND_API_KEY, MAIL_FROM và DNS đã đúng.',
            '',
            'CHƯA XONG ĐÂU. Việc bắt buộc còn lại là mở web thật, đăng ký một tài',
            'khoản phụ huynh bằng hòm thư này, rồi BẤM link xác minh trong thư nhận',
            'được. Đó mới là thứ chặn đường một đứa trẻ đăng game, chứ không phải',
            'việc gửi được thư.',
            '',
            `APP_ORIGIN đang là: ${appOrigin ?? '(chưa đặt — link trong mail sẽ sai)'}`,
          ].join('\n'),
        }),
      });

      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        check('Resend nhận thư', true, body.id ? `id ${body.id}` : '');
        note(`Giờ mở hòm thư ${sendTo} kiểm xem có nhận được không —`);
        note('Resend nhận thư KHÔNG có nghĩa là hòm thư kia nhận được.');
        note('Nhớ nhìn cả thư mục Spam. Vào Spam cũng tính là hỏng.');
      } else {
        const detail = await res.text().catch(() => '');
        check('Resend nhận thư', false, `HTTP ${res.status}: ${detail.slice(0, 200)}`);
      }
    } catch (err) {
      check('Resend nhận thư', false, String(err.message ?? err));
    }
  }
} else {
  console.log('\n   (Thêm `--send <email>` để gửi thật một lá thư kiểm tra.)');
}

// ---------------------------------------------------------------------------
console.log('\n── Kết ─────────────────────────────────────────────────────');
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} mục đạt`);

if (failed.length) {
  console.log('\nChưa đạt:');
  for (const f of failed) console.log(`  · ${f.name}`);
}

console.log(
  [
    '',
    'Điều kiện thật sự để mở cho người dùng KHÔNG phải là script này xanh hết.',
    'Nó là: đăng ký một tài khoản phụ huynh bằng hòm thư có thật, nhận được thư,',
    'và BẤM ĐƯỢC link xác minh. Script chỉ loại trước những cách hỏng dễ đoán.',
    '',
  ].join('\n')
);

process.exit(failed.length === 0 ? 0 : 1);
