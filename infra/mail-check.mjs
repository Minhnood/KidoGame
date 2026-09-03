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

/*
 * Hai đường gửi, phải có MỘT. Giữ đúng thứ tự ưu tiên của src/lib/mail.ts: SMTP
 * thắng Resend khi cả hai được khai. Kiểm sai thứ tự thì script báo về đường mà
 * web KHÔNG dùng, tức là xanh hết trong khi mail vẫn không đi.
 */
const smtpRaw = {
  host: process.env.SMTP_HOST?.trim(),
  port: process.env.SMTP_PORT?.trim(),
  user: process.env.SMTP_USER?.trim(),
  pass: process.env.SMTP_PASS,
  secure: process.env.SMTP_SECURE?.trim().toLowerCase(),
};
const smtpKhaiMotPhan = Boolean(smtpRaw.host || smtpRaw.user || smtpRaw.pass);
const smtpDu = Boolean(smtpRaw.host && smtpRaw.user && smtpRaw.pass);

/*
 * Giữ chỗ kiểu `re_xxx` bị coi như KHÔNG có key, y hệt src/lib/mail.ts — mọi bản
 * .env chép từ .env.example đều có sẵn một giá trị giả, nên kiểm `!!apiKey` thì
 * script báo đạt trong khi Resend trả 401 cho từng lá thư.
 */
const apiKeyRaw = process.env.RESEND_API_KEY;
const apiKey = apiKeyRaw && apiKeyRaw.trim().startsWith('re_') && apiKeyRaw.trim().length >= 20 ? apiKeyRaw : null;

const duong = smtpDu ? 'smtp' : apiKey ? 'resend' : null;

check(
  'Có một đường gửi mail',
  !!duong,
  duong === 'smtp'
    ? `SMTP qua ${smtpRaw.host}`
    : duong === 'resend'
      ? `Resend, key re_…${apiKey.slice(-4)}`
      : 'KHÔNG CÓ ĐƯỜNG NÀO'
);

if (!duong) {
  note('Không đường nào thì ở production `sendMail` ném lỗi chứ không in ra log —');
  note('cố ý như vậy, vì log production chứa token là rò token.');
  note('Chọn một: khai SMTP_HOST + SMTP_USER + SMTP_PASS, hoặc đặt RESEND_API_KEY.');
  note('SMTP là đường không cần domain riêng; với Gmail thì SMTP_PASS là App');
  note('Password ở https://myaccount.google.com/apppasswords, không phải mật khẩu.');
}

if (smtpKhaiMotPhan && !smtpDu) {
  check(
    'SMTP khai đủ cả ba biến bắt buộc',
    false,
    `thiếu ${[!smtpRaw.host && 'SMTP_HOST', !smtpRaw.user && 'SMTP_USER', !smtpRaw.pass && 'SMTP_PASS'].filter(Boolean).join(', ')}`
  );
  note('src/lib/mail.ts coi cấu hình SMTP dở dang là CHƯA cấu hình và rơi sang');
  note('đường sau, nên một biến gõ thiếu ở đây không báo lỗi mà lặng lẽ đổi đường.');
}

if (smtpDu && apiKeyRaw && apiKey) {
  note('Khai cả SMTP và Resend: web sẽ dùng SMTP. Xoá bớt một đường cho khỏi lẫn.');
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

/*
 * Nhà cung cấp hòm thư dùng chung: SPF, DKIM và DMARC của những domain này do họ
 * quản, không phải việc của mình, và kiểm chúng thì luôn xanh mà chẳng nói gì.
 */
const HOM_THU_DUNG_CHUNG = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com', 'proton.me', 'zoho.com'];

// ---------------------------------------------------------------------------
// 2a. SMTP nối được và xác thực được chưa
// ---------------------------------------------------------------------------
if (duong === 'smtp') {
  console.log('\n── SMTP ────────────────────────────────────────────────────');

  const port = Number(smtpRaw.port ?? 587);
  const portOk = Number.isInteger(port) && port >= 1 && port <= 65535;
  check('SMTP_PORT hợp lệ', portOk, portOk ? String(port) : `"${smtpRaw.port}" không phải số cổng`);

  const secure = smtpRaw.secure ? smtpRaw.secure === 'true' || smtpRaw.secure === '1' : port === 465;
  note(`Chế độ: ${secure ? 'TLS ngay từ đầu' : 'kết nối thường rồi STARTTLS'}${smtpRaw.secure ? ' (do SMTP_SECURE)' : ' (suy từ cổng)'}`);

  /*
   * MAIL_FROM lệch SMTP_USER là cách hỏng khó thấy nhất của đường SMTP: Gmail
   * KHÔNG báo lỗi, nó âm thầm viết lại người gửi thành địa chỉ đã xác thực. Nên
   * log thì ghi một đằng, thư người ta nhận lại ghi một nẻo, và phần trả lời của
   * phụ huynh bay về một hòm thư không ai đọc.
   */
  if (fromAddr && smtpRaw.user && fromAddr.toLowerCase() !== smtpRaw.user.toLowerCase()) {
    check('MAIL_FROM trùng SMTP_USER', false, `MAIL_FROM là ${fromAddr}, SMTP_USER là ${smtpRaw.user}`);
    note('Nhiều máy chủ, Gmail trong đó, viết lại người gửi thành địa chỉ đã xác');
    note('thực mà KHÔNG báo lỗi. Đặt MAIL_FROM trùng SMTP_USER cho khỏi lệch.');
  }

  if (portOk) {
    try {
      /*
       * nodemailer nằm trong node_modules của apps/web, không phải của root —
       * pnpm không hoist. createRequire neo việc phân giải vào đúng package đó,
       * giống cách packages/sb3 nạp @turbowarp/packager.
       */
      const { createRequire } = await import('node:module');
      const here2 = dirname(fileURLToPath(import.meta.url));
      const requireFromWeb = createRequire(join(here2, '..', 'apps', 'web', 'package.json'));
      const nodemailer = requireFromWeb('nodemailer');

      const transporter = nodemailer.createTransport({
        host: smtpRaw.host,
        port,
        secure,
        auth: { user: smtpRaw.user, pass: smtpRaw.pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
      });

      // verify() nối, bắt tay TLS và AUTH thật — trả lời đúng câu "dùng được
      // không", mà không gửi thư cho bất kỳ ai.
      await transporter.verify();
      check('SMTP nối và xác thực được', true);
      transporter.close();
    } catch (err) {
      const msg = String(err?.message ?? err);
      check('SMTP nối và xác thực được', false, msg.slice(0, 200));
      if (/invalid login|535|534|authentication/i.test(msg)) {
        note('Sai đăng nhập. Với Gmail, nguyên nhân gần như luôn là dùng mật khẩu');
        note('đăng nhập thay cho App Password. Bật xác minh hai bước rồi tạo ở');
        note('https://myaccount.google.com/apppasswords và dán 16 ký tự đó vào SMTP_PASS.');
      } else if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|timeout/i.test(msg)) {
        note('Không nối được tới máy chủ. Kiểm SMTP_HOST, SMTP_PORT, và xem mạng có');
        note('chặn cổng đó không — nhiều nhà mạng và VPS chặn cổng 25, hãy dùng 587.');
      }
    }
  }
}

if (duong === 'resend' && fromDomain) {
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
} else if (duong === 'smtp' && HOM_THU_DUNG_CHUNG.includes(fromDomain)) {
  console.log(`   Bỏ qua: ${fromDomain} là hòm thư dùng chung, SPF/DKIM/DMARC do nhà`);
  console.log('   cung cấp quản, không phải việc của mình.');
  note('Đổi lại, thư gửi từ địa chỉ này dễ vào spam hơn thư từ domain riêng đã ký');
  note('DKIM, và Gmail chặn ở khoảng 500 thư một ngày. Đủ cho lớp học và bản thử.');
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

    // Chỉ hỏi bản ghi DKIM của Resend khi Resend là đường đang dùng. Đường SMTP
    // với domain riêng có selector khác, do máy chủ SMTP đặt ra.
    if (duong === 'resend') {
      const dkim = await txtOf(`resend._domainkey.${fromDomain}`);
      check('Có DKIM của Resend', dkim.length > 0, dkim.length ? 'có' : 'không thấy resend._domainkey');
    }
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

  const noiDungThu = [
    'Đây là thư kiểm tra do infra/mail-check.mjs gửi.',
    '',
    `Nhận được thư này nghĩa là đường gửi ${duong === 'smtp' ? 'SMTP' : 'Resend'}, MAIL_FROM và DNS đã đúng.`,
    '',
    'CHƯA XONG ĐÂU. Việc bắt buộc còn lại là mở web thật, đăng ký một tài',
    'khoản phụ huynh bằng hòm thư này, rồi BẤM link xác minh trong thư nhận',
    'được. Đó mới là thứ chặn đường một đứa trẻ đăng game, chứ không phải',
    'việc gửi được thư.',
    '',
    `APP_ORIGIN đang là: ${appOrigin ?? '(chưa đặt — link trong mail sẽ sai)'}`,
  ].join('\n');

  if (!duong) {
    check('Gửi được thư thật', false, 'chưa có đường gửi nào nên không gửi');
  } else if (duong === 'smtp') {
    try {
      const { createRequire } = await import('node:module');
      const here3 = dirname(fileURLToPath(import.meta.url));
      const nodemailer = createRequire(join(here3, '..', 'apps', 'web', 'package.json'))('nodemailer');

      const port = Number(smtpRaw.port ?? 587);
      const secure = smtpRaw.secure ? smtpRaw.secure === 'true' || smtpRaw.secure === '1' : port === 465;
      const transporter = nodemailer.createTransport({
        host: smtpRaw.host,
        port,
        secure,
        auth: { user: smtpRaw.user, pass: smtpRaw.pass },
        connectionTimeout: 10_000,
      });

      const info = await transporter.sendMail({
        from: mailFrom ?? smtpRaw.user,
        to: sendTo,
        subject: 'KidoGame — thư kiểm tra đường gửi',
        text: noiDungThu,
      });
      transporter.close();

      check('Máy chủ SMTP nhận thư', true, info.messageId ? `id ${info.messageId}` : '');
      note(`Giờ mở hòm thư ${sendTo} kiểm xem có nhận được không —`);
      note('máy chủ SMTP nhận thư KHÔNG có nghĩa là hòm thư kia nhận được.');
      note('Nhớ nhìn cả thư mục Spam. Vào Spam cũng tính là hỏng.');
      if (info.rejected?.length) {
        check('Không có địa chỉ nào bị từ chối', false, info.rejected.join(', '));
      }
    } catch (err) {
      check('Máy chủ SMTP nhận thư', false, String(err?.message ?? err).slice(0, 200));
    }
  } else {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: mailFrom ?? 'KidoGame <no-reply@kidogame.local>',
          to: [sendTo],
          subject: 'KidoGame — thư kiểm tra đường gửi',
          text: noiDungThu,
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
