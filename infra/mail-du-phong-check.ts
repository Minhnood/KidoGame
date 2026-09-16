/**
 * Kiểm TÀI KHOẢN GỬI DỰ PHÒNG: tài khoản chính bị từ chối đăng nhập thì thư đi bằng dự
 * phòng — và CHỈ trong trường hợp đó.
 *
 * VÌ SAO CÓ BỘ NÀY. Ngày 15/9/2026 Google vô hiệu App Password của tài khoản gửi production;
 * mọi thư trả 535 cho tới khi người vận hành tạo mật khẩu mới. Đường dự phòng sinh ra để
 * lần sau thư vẫn đi. Nó có hai cách hỏng, và cả hai đều im lặng:
 *   - KHÔNG chuyển khi cần (đọc sai mã lỗi, mất `cause` khi bọc lỗi) → y như 15/9;
 *   - CHUYỂN khi không nên (lỗi sau đăng nhập, như người nhận bị từ chối) → thư có thể đã
 *     đi, gửi lại là phụ huynh nhận hai lá xác minh với hai token khác nhau.
 *
 * MÁY CHỦ SMTP GIẢ ngay trong file này, không gửi gì ra ngoài: nó quyết định cặp user/mật
 * khẩu nào được nhận, và ghi lại tài khoản nào đã gửi lá thư nào. Dựng Gmail thật thì không
 * làm cho một tài khoản "bị thu hồi" theo ý muốn được.
 *
 * Chạy:
 *   cd apps/web && pnpm exec tsx ../../infra/mail-du-phong-check.ts
 */
import { createServer, type Socket } from 'node:net';

/* Không để bất kỳ đường gửi thật nào lọt vào: mọi biến mail do bộ này đặt. */
for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE', 'SMTP_DU_PHONG_USER', 'SMTP_DU_PHONG_PASS', 'RESEND_API_KEY']) {
  delete process.env[k];
}
/* Production: bỏ qua hộp thư dev và lớp chặn địa chỉ `.test` — đo đúng nhánh chạy thật. */
(process.env as Record<string, string>).NODE_ENV = 'production';
process.env.MAIL_FROM = 'KidoGame <chinh@vidu.vn>';

const { sendMail, kiemDuongGuiMail } = await import('../apps/web/src/lib/mail.ts');

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/* ---------------------------------------------------------------------------
 * Máy chủ SMTP giả
 * ------------------------------------------------------------------------- */

interface ThuNhan {
  user: string;
  from: string;
  to: string[];
  data: string;
}
const may = {
  /** user -> mật khẩu được nhận. Không có trong đây = 535. */
  taiKhoan: new Map<string, string>(),
  /** true = từ chối mọi người nhận bằng 550, SAU khi đã đăng nhập. */
  tuChoiNguoiNhan: false,
  thu: [] as ThuNhan[],
  dangNhap: [] as Array<{ user: string; ok: boolean }>,
};

function phucVu(s: Socket) {
  let user = '';
  let cho: 'lenh' | 'auth-plain' | 'login-user' | 'login-pass' | 'data' = 'lenh';
  let loginUser = '';
  let dang: ThuNhan = { user: '', from: '', to: [], data: '' };
  let dem = '';
  const gui = (d: string) => s.write(`${d}\r\n`);
  const xacThuc = (u: string, p: string) => {
    const ok = may.taiKhoan.get(u) === p;
    may.dangNhap.push({ user: u, ok });
    if (ok) {
      user = u;
      gui('235 2.7.0 Accepted');
    } else {
      gui('535 5.7.8 Username and Password not accepted');
    }
  };
  gui('220 gia.smtp ESMTP');
  s.on('data', (chunk) => {
    dem += chunk.toString('utf8');
    for (;;) {
      if (cho === 'data') {
        const het = dem.indexOf('\r\n.\r\n');
        if (het < 0) return;
        dang.data = dem.slice(0, het);
        dem = dem.slice(het + 5);
        may.thu.push({ ...dang, user });
        cho = 'lenh';
        gui('250 2.0.0 OK queued');
        continue;
      }
      const i = dem.indexOf('\r\n');
      if (i < 0) return;
      const dong = dem.slice(0, i);
      dem = dem.slice(i + 2);
      if (cho === 'auth-plain') {
        const [, u = '', p = ''] = Buffer.from(dong, 'base64').toString('utf8').split('\0');
        cho = 'lenh';
        xacThuc(u, p);
        continue;
      }
      if (cho === 'login-user') {
        loginUser = Buffer.from(dong, 'base64').toString('utf8');
        cho = 'login-pass';
        gui('334 UGFzc3dvcmQ6');
        continue;
      }
      if (cho === 'login-pass') {
        cho = 'lenh';
        xacThuc(loginUser, Buffer.from(dong, 'base64').toString('utf8'));
        continue;
      }
      const lenh = dong.toUpperCase();
      if (lenh.startsWith('EHLO') || lenh.startsWith('HELO')) {
        gui('250-gia.smtp');
        gui('250-AUTH PLAIN LOGIN');
        gui('250 OK');
      } else if (lenh.startsWith('AUTH PLAIN')) {
        const arg = dong.slice(10).trim();
        if (arg) {
          const [, u = '', p = ''] = Buffer.from(arg, 'base64').toString('utf8').split('\0');
          xacThuc(u, p);
        } else {
          cho = 'auth-plain';
          gui('334 ');
        }
      } else if (lenh.startsWith('AUTH LOGIN')) {
        cho = 'login-user';
        gui('334 VXNlcm5hbWU6');
      } else if (lenh.startsWith('MAIL FROM')) {
        dang = { user, from: dong.slice(10).trim(), to: [], data: '' };
        gui('250 OK');
      } else if (lenh.startsWith('RCPT TO')) {
        if (may.tuChoiNguoiNhan) gui('550 5.1.1 No such user');
        else {
          dang.to.push(dong.slice(8).trim());
          gui('250 OK');
        }
      } else if (lenh === 'DATA') {
        cho = 'data';
        gui('354 go ahead');
      } else if (lenh === 'RSET' || lenh === 'NOOP') {
        gui('250 OK');
      } else if (lenh === 'QUIT') {
        gui('221 bye');
        s.end();
      } else {
        gui('502 not implemented');
      }
    }
  });
  s.on('error', () => {});
}

const server = createServer(phucVu);
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const PORT = (server.address() as { port: number }).port;

/* Mỗi kịch bản một cặp mật khẩu MỚI: transporter được cache theo cả mật khẩu, nên đổi mật
   khẩu là có transporter mới và kịch bản trước không để lại kết nối đã đăng nhập. */
let luot = 0;
function datKichBan(o: { chinhOk: boolean; duPhong: 'ok' | 'hong' | 'khong' | 'trung-chinh'; tuChoiNguoiNhan?: boolean }) {
  luot++;
  may.taiKhoan.clear();
  may.thu.length = 0;
  may.dangNhap.length = 0;
  may.tuChoiNguoiNhan = Boolean(o.tuChoiNguoiNhan);
  const passChinh = `chinhdung${luot}`;
  const passDuPhong = `duphongdung${luot}`;
  if (o.chinhOk) may.taiKhoan.set('chinh@vidu.vn', passChinh);
  if (o.duPhong === 'ok') may.taiKhoan.set('duphong@vidu.vn', passDuPhong);
  Object.assign(process.env, {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(PORT),
    SMTP_SECURE: 'false',
    SMTP_USER: 'chinh@vidu.vn',
    SMTP_PASS: passChinh,
  });
  if (o.duPhong === 'khong') {
    delete process.env.SMTP_DU_PHONG_USER;
    delete process.env.SMTP_DU_PHONG_PASS;
  } else {
    process.env.SMTP_DU_PHONG_USER = o.duPhong === 'trung-chinh' ? 'Chinh@vidu.vn' : 'duphong@vidu.vn';
    process.env.SMTP_DU_PHONG_PASS = passDuPhong;
  }
  return { passChinh, passDuPhong };
}

/** Gọi sendMail, bắt lỗi và mọi dòng console.error nó in ra. */
async function gui(): Promise<{ loi: string | null; log: string[] }> {
  const log: string[] = [];
  const goc = console.error;
  const gocLog = console.log;
  console.error = (...a: unknown[]) => log.push(a.map(String).join(' '));
  console.log = () => {};
  try {
    await sendMail({ to: 'phuhuynh@vidu.vn', subject: `Thu thu ${luot}`, text: 'Noi dung thu' });
    return { loi: null, log };
  } catch (e) {
    return { loi: e instanceof Error ? e.message : String(e), log };
  } finally {
    console.error = goc;
    console.log = gocLog;
  }
}

/* ---------------------------------------------------------------------------
 * sendMail
 * ------------------------------------------------------------------------- */
console.log('\n── Gửi thư ─────────────────────────────────────────────────');

{
  datKichBan({ chinhOk: true, duPhong: 'ok' });
  const r = await gui();
  check('Chính sống: thư đi bằng tài khoản CHÍNH', !r.loi && may.thu.length === 1 && may.thu[0]?.user === 'chinh@vidu.vn', r.loi ?? `${may.thu.map((t) => t.user)}`);
  check('… và không đụng tới dự phòng', !may.dangNhap.some((d) => d.user === 'duphong@vidu.vn'));
}

{
  datKichBan({ chinhOk: false, duPhong: 'ok' });
  const r = await gui();
  check('Chính bị 535, có dự phòng: gửi THÀNH CÔNG', r.loi === null, r.loi ?? '');
  check('… đúng một lá, đi bằng tài khoản DỰ PHÒNG', may.thu.length === 1 && may.thu[0]?.user === 'duphong@vidu.vn', may.thu.map((t) => t.user).join(', '));
  const from = /^From: (.*)$/m.exec(may.thu[0]?.data ?? '')?.[1] ?? '';
  check('… From giữ tên KidoGame, địa chỉ là tài khoản dự phòng', /KidoGame/.test(from) && from.includes('duphong@vidu.vn') && !from.includes('chinh@'), from);
  check('… MAIL FROM của phiên SMTP là tài khoản dự phòng', (may.thu[0]?.from ?? '').includes('duphong@vidu.vn'), may.thu[0]?.from);
  check('… log một dòng nói đang đi đường dự phòng', r.log.some((l) => l.includes('dự phòng') && l.includes('chinh@vidu.vn')), r.log.join(' | '));
}

{
  datKichBan({ chinhOk: false, duPhong: 'khong' });
  const r = await gui();
  check('Chính bị 535, KHÔNG khai dự phòng: vẫn NÉM như trước', r.loi !== null && /535/.test(r.loi), r.loi ?? 'không ném');
  check('… không lá nào đi', may.thu.length === 0);
}

{
  datKichBan({ chinhOk: false, duPhong: 'hong' });
  const r = await gui();
  check('Cả hai bị 535: NÉM', r.loi !== null && /535/.test(r.loi), r.loi ?? 'không ném');
  check('… đã thử đúng hai tài khoản, mỗi cái một lần', may.dangNhap.filter((d) => d.user === 'chinh@vidu.vn').length >= 1 && may.dangNhap.filter((d) => d.user === 'duphong@vidu.vn').length === 1, JSON.stringify(may.dangNhap));
}

{
  datKichBan({ chinhOk: true, duPhong: 'ok', tuChoiNguoiNhan: true });
  const r = await gui();
  check('Lỗi SAU đăng nhập (550 người nhận): NÉM, không thử lại', r.loi !== null && /550/.test(r.loi), r.loi ?? 'không ném');
  check('… KHÔNG đăng nhập dự phòng (tránh gửi hai lá)', !may.dangNhap.some((d) => d.user === 'duphong@vidu.vn'), JSON.stringify(may.dangNhap));
  check('… không log "dự phòng"', !r.log.some((l) => l.includes('dự phòng')), r.log.join(' | '));
}

{
  datKichBan({ chinhOk: false, duPhong: 'trung-chinh' });
  const r = await gui();
  /* Đo bằng log chứ không bằng "không lá nào đi": thử dự phòng trùng chính cũng không gửi
     được lá nào, nên chỉ đếm thư thì phép này xanh cả khi đường dự phòng đã chạy. */
  check(
    'Dự phòng TRÙNG tài khoản chính (khác hoa/thường) bị coi như không có',
    r.loi !== null && may.thu.length === 0 && !r.log.some((l) => l.includes('dự phòng')),
    r.loi ?? 'không ném'
  );
}

{
  datKichBan({ chinhOk: true, duPhong: 'ok' });
  process.env.SMTP_PORT = '1';
  const r = await gui();
  check('Không nối được máy chủ (ECONNREFUSED): NÉM, không log dự phòng', r.loi !== null && !r.log.some((l) => l.includes('dự phòng')), r.loi ?? 'không ném');
}

/* ---------------------------------------------------------------------------
 * kiemDuongGuiMail
 * ------------------------------------------------------------------------- */
console.log('\n── Kiểm đường gửi ──────────────────────────────────────────');

const kiemMuc = async (o: Parameters<typeof datKichBan>[0], mong: string, ten: string) => {
  const { passChinh, passDuPhong } = datKichBan(o);
  const k = await kiemDuongGuiMail(true);
  check(`${ten} → ${mong}`, k.muc === mong, `${k.muc}: ${k.noi}`);
  return { k, passChinh, passDuPhong };
};

await kiemMuc({ chinhOk: true, duPhong: 'ok' }, 'song', 'Cả hai sống');
await kiemMuc({ chinhOk: true, duPhong: 'khong' }, 'song', 'Chính sống, không khai dự phòng');
await kiemMuc({ chinhOk: false, duPhong: 'ok' }, 'du-phong', 'Chính chết, dự phòng sống');
await kiemMuc({ chinhOk: true, duPhong: 'hong' }, 'du-phong-hong', 'Chính sống, dự phòng chết');
await kiemMuc({ chinhOk: false, duPhong: 'hong' }, 'hong', 'Cả hai chết');
const cuoi = await kiemMuc({ chinhOk: false, duPhong: 'khong' }, 'hong', 'Chính chết, không khai dự phòng');
check(
  'Thông điệp kiểm KHÔNG chứa mật khẩu',
  !cuoi.k.noi.includes(cuoi.passChinh) && !cuoi.k.noi.includes(cuoi.passDuPhong),
  cuoi.k.noi
);

server.close();
const dat = results.filter(Boolean).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt`);
process.exit(dat === results.length ? 0 : 1);
