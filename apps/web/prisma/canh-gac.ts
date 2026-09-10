/**
 * Canh những cách hỏng KHÔNG làm web sập, mỗi đêm một lượt.
 *
 * VÌ SAO CẦN, và vì sao nó KHÔNG thay được uptime monitoring bên ngoài.
 * `infra/GIAM-SAT.md` mục 4 chia việc giám sát thành các tầng, và nói thẳng rằng
 * tầng nhìn-từ-ngoài là thứ hệ thống không tự làm cho mình được: VPS chết hẳn thì
 * chính nó không gửi được lá thư báo là nó đã chết. Đúng như vậy, và file này
 * không cố chữa điều đó.
 *
 * Nó nhắm vào khoảng trống CÒN LẠI, mà một dịch vụ ping từ ngoài cũng không thấy:
 * ping chỉ biết trang có trả lời hay không. Nó không biết đĩa còn 3%, không biết
 * bản sao lưu đã ngừng chạy từ tuần trước, không biết chứng chỉ hết hạn sau chín
 * ngày. Cả ba đều là hỏng ĐANG TỚI, và cả ba lúc xảy ra đều làm trang chết hẳn —
 * lúc đó ping mới kêu, và lúc đó thì đã mất dữ liệu hoặc mất giờ.
 *
 * Hai tầng bù nhau chứ không chồng nhau:
 *   - ping từ ngoài  -> "nó có đang chạy không", vài phút một lần
 *   - file này       -> "nó còn chạy được bao lâu nữa", mỗi đêm một lần
 *
 * VÌ SAO MỖI ĐÊM MỘT LẦN LÀ ĐỦ. Không thứ nào trong danh sách trên đi từ tốt sang
 * hỏng trong vòng một giờ. Đĩa đầy dần theo tuần, chứng chỉ đếm theo ngày, sao lưu
 * chạy mỗi 24 tiếng nên không có gì để hỏi sớm hơn thế. Chạy mỗi 15 phút chỉ đổi
 * lại một thứ duy nhất: 96 lần đọc DB một ngày cho cùng một câu trả lời.
 *
 * VÌ SAO KHÔNG PHẢI SERVICE THỨ SÁU. Đúng lập luận đã ghi trong `infra/prune.sh`:
 * nó cần đúng một image, đúng một đồng hồ, chạy đúng một lần mỗi đêm. Thêm một
 * service cho một lệnh là thêm một chỗ để quên bật, mà việc giám sát quên bật thì
 * tệ hơn không có — nó cho cảm giác đã có người canh.
 *
 * VÌ SAO CHẠY SAU BƯỚC SAO LƯU, và đây là chỗ hai con số phải khớp. `BACKUP_HOUR`
 * mặc định 3, `PRUNE_HOUR` mặc định 4. Phép canh "bản sao lưu mới nhất bao nhiêu
 * tuổi" chỉ có nghĩa khi lượt sao lưu của đêm nay đã xong. Đảo lại thì mỗi đêm nó
 * đo bản của hôm qua và báo động vào đúng cái đêm mọi thứ vẫn ổn.
 *
 * IM LẶNG KHI KHÔNG CÓ GÌ, cùng lý do đã ghi ở `nhac-viec-co-han.ts`: một lá thư
 * "mọi thứ đều ổn" mỗi đêm là lá thư người ta học cách bỏ qua trong hai tuần, rồi
 * bỏ qua luôn cái đêm nó khác. Nhưng im lặng ở đây mang một cái giá phải nói ra:
 * "không có thư" và "cả service prune đã chết" trông giống hệt nhau từ phía hòm
 * thư. Đó chính là loại hỏng mà tầng ping từ ngoài bắt được, nên hai tầng phải có
 * cả hai — xem `infra/GIAM-SAT.md` mục 7.
 *
 * Chạy:
 *   pnpm --filter @kidogame/web db:canh-gac          # chỉ IN, không gửi
 *   pnpm --filter @kidogame/web db:canh-gac --gui    # gửi thư nếu có báo động
 */
import { readdirSync, statfsSync, statSync } from 'node:fs';
import { connect as tlsConnect } from 'node:tls';

import { prisma } from '../src/lib/db';
import { sendMail } from '../src/lib/mail';
import { isOperatorConfigured, operator } from '../src/lib/operator';

const guiThat = process.argv.includes('--gui');

/* --------------------------------------------------------------------------
 * Ngưỡng. Đặt được qua .env vì cái đúng phụ thuộc vào máy, nhưng mặc định phải
 * dùng được ngay mà không khai gì.
 * ----------------------------------------------------------------------- */

/**
 * Đĩa dùng quá bao nhiêu phần trăm thì kêu. 85 chứ không phải 95: khi đĩa đầy thì
 * Postgres là thứ chết TRƯỚC (đã ghi trong `infra/docker-compose.yml`), tức mất
 * web chứ không phải mất log. Cảnh báo phải tới sớm hơn khoảnh khắc đó đủ để còn
 * kịp làm gì đó, mà việc làm được ở đây — xoá bản sao lưu cũ, dọn image docker —
 * cần vài chục phút chứ không phải vài phút.
 */
const NGUONG_DIA_PHAN_TRAM = soTuEnv('CANH_DIA_PHAN_TRAM', 85);

/**
 * Bản sao lưu mới nhất cũ hơn bao nhiêu giờ thì kêu. 26 chứ không phải 24: lượt
 * sao lưu chạy mỗi 24 tiếng, nên ngưỡng đúng 24 sẽ kêu vì lệch vài phút giữa hai
 * đồng hồ. Hai tiếng đệm đủ rộng để không có báo động giả, và vẫn hẹp hơn nhiều
 * so với việc bỏ lỡ trọn một ngày.
 */
const NGUONG_SAO_LUU_GIO = soTuEnv('CANH_SAO_LUU_GIO', 26);

/**
 * Chứng chỉ còn dưới bao nhiêu ngày thì kêu. 21 vì Let's Encrypt cấp 90 ngày và
 * Caddy tự gia hạn khi còn 30 — nên ngưỡng phải nằm DƯỚI mốc gia hạn, không thì
 * nó kêu mỗi năm bốn lần trong lúc mọi thứ đang chạy đúng. Còn 21 ngày mà chưa
 * gia hạn nghĩa là Caddy đã thử và trượt ít nhất chín ngày liền.
 */
const NGUONG_CHUNG_CHI_NGAY = soTuEnv('CANH_CHUNG_CHI_NGAY', 21);

/**
 * Bao nhiêu nhóm lỗi MỚI trong 24h thì kêu. Không phải mỗi lỗi đều đáng đánh thức
 * người ta — trang `/admin/loi` vốn là chỗ đọc chúng. Cái đáng gửi thư là một
 * ĐỢT: nhiều nhóm khác nhau xuất hiện cùng một đêm, dấu hiệu quen thuộc của một
 * bản vừa deploy làm hỏng thứ gì đó.
 */
const NGUONG_LOI_MOI = soTuEnv('CANH_LOI_MOI', 5);

function soTuEnv(ten: string, macDinh: number): number {
  const raw = process.env[ten]?.trim();
  if (!raw) return macDinh;
  const n = Number(raw);
  // Chữ hoặc số âm thì DÙNG MẶC ĐỊNH chứ không lấy NaN: một ngưỡng NaN làm mọi
  // phép so sánh trả false, tức tắt lặng lẽ đúng cái phép canh nó cấu hình.
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(`[canh-gac] ${ten}="${raw}" không phải số dương, dùng mặc định ${macDinh}`);
    return macDinh;
  }
  return n;
}

/* --------------------------------------------------------------------------
 * Kết quả một phép canh.
 * ----------------------------------------------------------------------- */

type Muc = 'ổn' | 'lo' | 'hỏng';

interface KetQua {
  ten: string;
  muc: Muc;
  noi: string;
}

const on = (ten: string, noi: string): KetQua => ({ ten, muc: 'ổn', noi });
const lo = (ten: string, noi: string): KetQua => ({ ten, muc: 'lo', noi });
const hong = (ten: string, noi: string): KetQua => ({ ten, muc: 'hỏng', noi });

/* --------------------------------------------------------------------------
 * 1. Ba origin công khai có trả lời không.
 *
 * Đây là phép canh DUY NHẤT ở đây trùng vai với ping từ ngoài, và nó được giữ vì
 * lý do khác: nó đi ra Internet rồi vòng ngược vào qua Caddy (hairpin NAT), nên
 * một lượt gọi kiểm cùng lúc cả DNS, cả chứng chỉ, cả cấu hình reverse proxy. Gọi
 * `http://web:3000` trong mạng nội bộ thì xanh kể cả khi Caddy đã chết — tức là
 * xanh đúng vào lúc không người dùng nào vào được.
 * ----------------------------------------------------------------------- */

/**
 * `play` origin trả 404 ở `/` là ĐÚNG, không phải hỏng: nó chỉ phát file game
 * theo đường dẫn, không có trang chủ. Đây là chỗ rất dễ viết sai thành "phải 200"
 * rồi có một báo động giả mỗi đêm cho tới khi người ta tắt cả phép canh.
 */
const MA_MONG_DOI: Record<string, number[]> = {
  app: [200],
  play: [404],
  admin: [200],
};

async function canhOrigin(nhan: string, url: string): Promise<KetQua> {
  const ten = `origin ${nhan}`;
  try {
    // `redirect: 'manual'` để một chuyển hướng bất ngờ lộ ra thành mã 30x chứ
    // không bị fetch âm thầm đi theo rồi báo 200 của một trang khác.
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    const mong = MA_MONG_DOI[nhan] ?? [200];
    if (!mong.includes(res.status)) {
      return hong(ten, `${url} trả ${res.status}, mong ${mong.join(' hoặc ')}`);
    }
    return on(ten, `${url} trả ${res.status}`);
  } catch (err) {
    const lyDo = err instanceof Error ? err.message : String(err);
    return hong(ten, `${url} không gọi được: ${lyDo}`);
  }
}

/* --------------------------------------------------------------------------
 * 2. Chứng chỉ TLS còn bao nhiêu ngày.
 *
 * Đọc bằng `node:tls` chứ không gọi `openssl s_client`: image web là
 * node:24-bookworm-slim và KHÔNG có binary openssl CLI (chỉ có thư viện, cài cho
 * Prisma — xem `infra/Dockerfile`). Một phép canh phụ thuộc vào lệnh không tồn
 * tại thì ném lỗi mỗi đêm, và lỗi đó trông y hệt "chứng chỉ có vấn đề".
 * ----------------------------------------------------------------------- */

function ngayConLaiCuaChungChi(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect(
      {
        host,
        port: 443,
        servername: host,
        // KHÔNG tắt xác thực. Chứng chỉ sai/hết hạn phải làm phép canh này ĐỎ —
        // đó đúng là thứ nó sinh ra để bắt. `rejectUnauthorized: false` biến nó
        // thành phép canh chỉ đo "có cái gì đó đang nghe cổng 443".
        rejectUnauthorized: true,
        timeout: 20_000,
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) {
          reject(new Error('máy chủ không trả chứng chỉ nào'));
          return;
        }
        const conLai = (Date.parse(cert.valid_to) - Date.now()) / 86_400_000;
        resolve(Math.floor(conLai));
      }
    );
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('quá hạn chờ khi bắt tay TLS'));
    });
    socket.on('error', reject);
  });
}

async function canhChungChi(host: string): Promise<KetQua> {
  const ten = `chứng chỉ ${host}`;
  try {
    const ngay = await ngayConLaiCuaChungChi(host);
    if (ngay < 0) return hong(ten, `ĐÃ HẾT HẠN ${-ngay} ngày trước`);
    if (ngay < NGUONG_CHUNG_CHI_NGAY) {
      return lo(ten, `còn ${ngay} ngày — Caddy lẽ ra đã gia hạn từ mốc 30 ngày, tức nó đang trượt`);
    }
    return on(ten, `còn ${ngay} ngày`);
  } catch (err) {
    const lyDo = err instanceof Error ? err.message : String(err);
    return hong(ten, `không đọc được chứng chỉ: ${lyDo}`);
  }
}

/* --------------------------------------------------------------------------
 * 3. Đĩa còn bao nhiêu.
 * ----------------------------------------------------------------------- */

function canhDia(duong: string): KetQua {
  const ten = 'đĩa';
  try {
    const s = statfsSync(duong);
    // `bavail` (khối user thường dùng được) chứ không `bfree`: ext4 để dành ~5%
    // cho root, nên `bfree` bày ra một khoảng trống mà tiến trình `node` KHÔNG
    // ghi vào được. Đo bằng `bfree` thì con số đẹp hơn thực tế đúng 5% — và 5%
    // chính là quãng cuối cùng, quãng duy nhất mà phép canh này còn có ích.
    const tong = s.blocks * s.bsize;
    const trong = s.bavail * s.bsize;
    const daDung = tong - trong;
    const phanTram = Math.round((daDung / tong) * 100);
    const noi = `${phanTram}% đã dùng (còn ${gb(trong)} trên tổng ${gb(tong)}) tại ${duong}`;
    if (phanTram >= NGUONG_DIA_PHAN_TRAM) return hong(ten, noi);
    if (phanTram >= NGUONG_DIA_PHAN_TRAM - 10) return lo(ten, noi);
    return on(ten, noi);
  } catch (err) {
    const lyDo = err instanceof Error ? err.message : String(err);
    return hong(ten, `không đọc được ${duong}: ${lyDo}`);
  }
}

function gb(byte: number): string {
  return `${(byte / 1024 ** 3).toFixed(1)}G`;
}

/* --------------------------------------------------------------------------
 * 4. Bản sao lưu mới nhất bao nhiêu tuổi.
 *
 * Đây là phép canh có giá trị cao nhất trong cả file, vì nó bắt đúng loại hỏng
 * IM LẶNG NHẤT của hệ thống: service `backup` chết hoặc `pg_dump` trượt mỗi đêm
 * thì không có gì đổi màu ở đâu cả. Trang web vẫn chạy, ping từ ngoài vẫn xanh,
 * và điều duy nhất khác đi là bản sao lưu ngừng mới lại — thứ chỉ lộ ra vào đúng
 * cái ngày cần dùng tới nó.
 *
 * Đo theo TÊN FILE chứ không theo mtime, cùng lý do đã ghi ở `rotate()` trong
 * `infra/backup.sh`: tên mang dấu thời gian, còn mtime thì đổi khi có ai copy hay
 * rsync file. Ở đây sai lệch đó nguy hiểm hơn hẳn — một lượt `rsync` kéo bản cũ
 * về sẽ làm mtime mới tinh, và phép canh báo "sao lưu vừa chạy xong" cho một file
 * của tuần trước.
 * ----------------------------------------------------------------------- */

/** `db-20260910-030000.dump` -> mốc thời gian. Trả null nếu tên không đúng khuôn. */
function mocTuTen(ten: string): Date | null {
  const m = /^db-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump$/.exec(ten);
  if (!m) return null;
  const [, nam, thang, ngay, gio, phut, giay] = m;
  // Giờ trong tên là giờ ĐỊA PHƯƠNG của container sao lưu (nó chạy TZ
  // Asia/Ho_Chi_Minh, xem docker-compose.yml), nên dựng bằng `new Date(...)`
  // nhiều tham số — đúng cách hiểu đó. `Date.parse` với chuỗi ISO thì hiểu là UTC
  // và lệch đúng 7 tiếng, tức bản vừa chạy xong bị đọc thành 7 tiếng tuổi.
  return new Date(+nam, +thang - 1, +ngay, +gio, +phut, +giay);
}

function canhSaoLuu(thuMuc: string): KetQua {
  const ten = 'sao lưu';
  let danhSach: string[];
  try {
    danhSach = readdirSync(thuMuc);
  } catch (err) {
    const lyDo = err instanceof Error ? err.message : String(err);
    return hong(ten, `không đọc được ${thuMuc}: ${lyDo}`);
  }

  const dumps = danhSach
    .map((f) => ({ ten: f, moc: mocTuTen(f) }))
    .filter((d): d is { ten: string; moc: Date } => d.moc !== null)
    .sort((a, b) => b.moc.getTime() - a.moc.getTime());

  if (dumps.length === 0) {
    return hong(ten, `${thuMuc} không có file db-*.dump nào — chưa từng sao lưu thành công`);
  }

  const moiNhat = dumps[0];
  const gioTuoi = (Date.now() - moiNhat.moc.getTime()) / 3_600_000;
  const kichThuoc = kichThuocFile(`${thuMuc}/${moiNhat.ten}`);

  if (gioTuoi > NGUONG_SAO_LUU_GIO) {
    return hong(
      ten,
      `bản mới nhất ${moiNhat.ten} đã ${Math.floor(gioTuoi)} giờ tuổi — lượt sao lưu hằng đêm đang KHÔNG chạy`
    );
  }

  // Một dump 0 byte vẫn là một file có tên đúng khuôn và tuổi đúng. `backup.sh`
  // đã kiểm bằng `pg_restore --list` ngay lúc tạo, nhưng phép canh này nhìn cả
  // những file được đưa vào bằng đường khác, nên vẫn hỏi một câu rẻ tiền.
  if (kichThuoc !== null && kichThuoc < 1024) {
    return hong(ten, `bản mới nhất ${moiNhat.ten} chỉ ${kichThuoc} byte — gần như chắc chắn hỏng`);
  }

  return on(
    ten,
    `bản mới nhất ${moiNhat.ten}, ${Math.floor(gioTuoi)} giờ tuổi, ${dumps.length} bản đang giữ`
  );
}

function kichThuocFile(duong: string): number | null {
  try {
    return statSync(duong).size;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------------
 * 5. Đợt lỗi mới trong 24h.
 * ----------------------------------------------------------------------- */

async function canhLoi(): Promise<KetQua> {
  const ten = 'lỗi mới';
  const tu = new Date(Date.now() - 86_400_000);
  // Đếm theo `firstSeenAt` chứ không `lastSeenAt`: câu hỏi là "có lỗi nào MỚI
  // xuất hiện không". Một nhóm cũ vẫn đang lặp lại thì `lastSeenAt` mới tinh mỗi
  // ngày, và đếm theo cột đó sẽ gửi cùng một báo động mãi mãi cho một lỗi đã
  // biết — đúng cách làm người ta ngừng đọc thư.
  const moi = await prisma.errorLog.count({ where: { firstSeenAt: { gte: tu } } });
  const chuaXuLy = await prisma.errorLog.count({ where: { resolvedAt: null } });

  if (moi >= NGUONG_LOI_MOI) {
    return lo(ten, `${moi} nhóm lỗi MỚI trong 24h (tổng ${chuaXuLy} nhóm chưa xử lý)`);
  }
  return on(ten, `${moi} nhóm mới trong 24h, ${chuaXuLy} nhóm chưa xử lý`);
}

/* --------------------------------------------------------------------------
 * Chạy hết rồi báo.
 * ----------------------------------------------------------------------- */

/** `https://app.abc.xyz` -> `app.abc.xyz`. Trả null nếu biến rỗng hoặc sai khuôn. */
function hostTuOrigin(raw: string | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  try {
    return new URL(s).hostname;
  } catch {
    return null;
  }
}

async function chay(): Promise<KetQua[]> {
  const ketQua: KetQua[] = [];

  const origins: Array<[string, string | undefined]> = [
    ['app', process.env.APP_ORIGIN],
    ['play', process.env.PLAYER_ORIGIN],
    // ADMIN_ORIGIN rỗng là trạng thái HỢP LỆ — nghĩa là chưa tách khu quản trị ra
    // origin riêng, và `/admin` nằm trên app domain. Bỏ qua chứ không báo thiếu.
    ['admin', process.env.ADMIN_ORIGIN],
  ];

  for (const [nhan, origin] of origins) {
    if (!origin?.trim()) {
      // GHI RA chứ không `continue` lặng lẽ. Một phép canh biến mất vì thiếu biến
      // môi trường trông y hệt một phép canh đã chạy và thấy mọi thứ ổn — và đó
      // đúng là cách một hệ thống giám sát tự tắt mình mà không ai biết. Ở
      // production hai biến app/play còn được chặn thêm bằng `:?` trong
      // docker-compose.yml; dòng này là lớp đỡ cho mọi chỗ chạy khác.
      ketQua.push(on(`origin ${nhan}`, 'BỎ QUA — biến môi trường chưa khai'));
      continue;
    }
    const url = nhan === 'admin' ? `${origin.replace(/\/$/, '')}/admin/dang-nhap` : origin;
    ketQua.push(await canhOrigin(nhan, url));
  }

  // Chỉ hỏi chứng chỉ của app domain. Ba domain do cùng một Caddy cấp và gia hạn
  // trong cùng một vòng, nên hỏi cả ba là ba lần bắt tay TLS cho một câu trả lời.
  const appHost = hostTuOrigin(process.env.APP_ORIGIN);
  if (appHost) {
    // `.localhost` được Caddy tự cấp chứng chỉ nội bộ (issuer local), không đi qua
    // Let's Encrypt và không có hạn nào đáng canh. Hỏi nó chỉ ra một dòng đỏ vô
    // nghĩa trên máy dev.
    if (appHost.endsWith('.localhost') || appHost === 'localhost') {
      ketQua.push(on(`chứng chỉ ${appHost}`, 'chứng chỉ nội bộ của Caddy, không có hạn để canh'));
    } else {
      ketQua.push(await canhChungChi(appHost));
    }
  }

  ketQua.push(canhDia(process.env.STORAGE_DIR ?? '/srv/storage'));
  ketQua.push(canhSaoLuu(process.env.BACKUP_DIR ?? '/backups'));
  ketQua.push(await canhLoi());

  return ketQua;
}

function chuDe(xau: KetQua[]): string {
  const hongCount = xau.filter((k) => k.muc === 'hỏng').length;
  const loCount = xau.filter((k) => k.muc === 'lo').length;
  const phan: string[] = [];
  if (hongCount > 0) phan.push(`${hongCount} HỎNG`);
  if (loCount > 0) phan.push(`${loCount} cần để ý`);
  // Tên phép canh vào thẳng chủ đề: người đọc phải biết chuyện gì mà KHÔNG mở
  // thư, đúng nguyên tắc đã đặt cho thư nhắc việc.
  return `[KidoGame] máy chủ: ${phan.join(', ')} — ${xau.map((k) => k.ten).join(', ')}`;
}

function thanThu(tatCa: KetQua[], xau: KetQua[]): string {
  const d: string[] = [
    'Lượt canh máy chủ hằng đêm phát hiện vấn đề.',
    '',
    'CẦN XỬ LÝ',
    '',
  ];
  for (const k of xau) {
    d.push(`  [${k.muc.toUpperCase()}] ${k.ten}: ${k.noi}`);
  }
  d.push('', 'TOÀN BỘ PHÉP CANH', '');
  for (const k of tatCa) {
    d.push(`  [${k.muc}] ${k.ten}: ${k.noi}`);
  }
  d.push(
    '',
    'Thư này chỉ được gửi khi có vấn đề. Không có thư nghĩa là lượt canh đã chạy',
    'và mọi phép đều ổn — HOẶC lượt canh không chạy được lần nào. Hai trường hợp đó',
    'nhìn giống nhau từ hòm thư, nên tầng theo dõi từ bên ngoài vẫn cần thiết.',
    'Xem infra/GIAM-SAT.md.'
  );
  return d.join('\n');
}

async function main() {
  const ketQua = await chay();

  for (const k of ketQua) {
    const dong = `[canh-gac] [${k.muc}] ${k.ten}: ${k.noi}`;
    if (k.muc === 'hỏng') console.error(dong);
    else console.log(dong);
  }

  const xau = ketQua.filter((k) => k.muc !== 'ổn');
  if (xau.length === 0) {
    console.log('[canh-gac] tất cả đều ổn, không gửi thư');
    return;
  }

  if (!guiThat) {
    console.log(`[canh-gac] ${xau.length} vấn đề — thêm --gui để gửi thư`);
    return;
  }

  // Cùng chốt với `nhac-viec-co-han.ts`: "liên hệ được", không phải "có gõ gì đó
  // vào biến". Gửi vào một địa chỉ chết thì log in ra "đã gửi" và không ai nhận —
  // đúng cách một cơ chế báo động tự tắt mình mà vẫn trông như đang chạy.
  if (!isOperatorConfigured()) {
    console.error(
      '[canh-gac] LỖI: chưa cấu hình OPERATOR_EMAIL (hoặc đang là địa chỉ không nhận được thư).' +
        ' Có vấn đề cần báo nhưng KHÔNG gửi được cho ai.'
    );
    process.exitCode = 1;
    return;
  }

  const nguoiNhan = operator();
  await sendMail({
    to: nguoiNhan.email,
    subject: chuDe(xau),
    text: thanThu(ketQua, xau),
  });
  console.log(`[canh-gac] đã gửi thư báo ${xau.length} vấn đề tới ${nguoiNhan.email}`);
}

main()
  .catch((err) => {
    console.error('[canh-gac] LỖI:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
