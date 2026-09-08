/**
 * Xoá tài khoản của một gia đình theo yêu cầu của phụ huynh.
 *
 * `/dieu-khoan` hứa công khai rằng gửi thư là xoá được. Đây là công cụ thực hiện lời
 * hứa đó. Lõi nằm ở `src/lib/xoa-gia-dinh.ts` và dùng chung với nút trong khu quản
 * trị — hai đường vào, một transaction, nên không có đường nào xoá sót hơn đường kia.
 *
 * CHẠY KHÔ LÀ MẶC ĐỊNH, giống `prune-removed.ts`. Đây là thao tác phá huỷ nhất hệ
 * thống có: gỡ game còn bảy ngày để đổi ý, còn cái này đi ngay. Mặc định phải là
 * "cho tôi xem trước".
 *
 * Chạy:
 *   pnpm --filter @kidogame/web db:xoa-gia-dinh me@vidu.com                     # chỉ ĐO
 *   pnpm ... db:xoa-gia-dinh me@vidu.com --xoa --admin toi@vidu.com             # xoá thật
 *   ... --ghi-chu "Yêu cầu qua mail 6/9"                                        # kèm ghi chú
 *
 * `--admin` là BẮT BUỘC khi xoá thật, và phải là một tài khoản đang có quyền quản
 * trị. Không phải để chặn ai — ai chạy được script này thì đã cầm `DATABASE_URL` —
 * mà để dòng vết nói đúng tên người chịu trách nhiệm. Điền `system` vào đó thì bảng
 * vết khai rằng máy tự xoá một gia đình, và đó là câu trả lời sai cho đúng câu hỏi
 * mà bảng ấy tồn tại để trả lời.
 *
 * Xoá xong nhớ `storage:prune --xoa` để dọn file mồ côi trên đĩa. Không dọn thì file
 * `.sb3` và bản đóng gói vẫn nằm đó, tức "đã xoá toàn bộ" chỉ đúng ở tầng database.
 */
import { prisma } from '../src/lib/db';
import {
  doLon,
  linkTaiSb3,
  xemTruocXoaGiaDinh,
  xoaGiaDinh,
  type ThongKeGiaDinh,
} from '../src/lib/xoa-gia-dinh';

const args = process.argv.slice(2);
const xoaThat = args.includes('--xoa');
const doiSo = (ten: string) => {
  const i = args.indexOf(ten);
  return i >= 0 ? (args[i + 1] ?? '') : '';
};
const ghiChu = doiSo('--ghi-chu');
const emailAdmin = doiSo('--admin');

/* Email cần xoá là đối số trần DUY NHẤT — phải bỏ qua cả giá trị đi kèm hai cờ trên,
   không thì `--admin toi@x.com me@y.com` lấy nhầm địa chỉ của người bấm nút làm địa
   chỉ bị xoá. Ở một script xoá vĩnh viễn thì nhầm lẫn đó không có lần thứ hai. */
const giaTriCoCo = new Set([ghiChu, emailAdmin].filter(Boolean));
const email = args.find((a) => !a.startsWith('--') && !giaTriCoCo.has(a));

const ngay = (d: Date) => d.toLocaleString('vi-VN');

function inThongKe(tk: ThongKeGiaDinh) {
  console.log(`\nPhụ huynh: ${tk.email}`);
  console.log(`  tạo ${ngay(tk.createdAt)}`);
  console.log(`  email ${tk.emailVerifiedAt ? `đã xác minh ${ngay(tk.emailVerifiedAt)}` : 'CHƯA xác minh'}`);
  if (tk.isAdmin) {
    /* Nói ngay ở phần đầu rằng --xoa sẽ bị từ chối. Chỉ in "có quyền quản trị" thôi
       thì người trực đọc xong vẫn chạy lại với --xoa và mới biết là không được, sau
       khi đã đọc hết một trang danh sách. */
    console.log('  ⚠ tài khoản này CÓ QUYỀN QUẢN TRỊ — `--xoa` sẽ bị từ chối.');
    console.log('    Gỡ quyền admin trước (cột isAdmin), không thì mọi vết kiểm duyệt');
    console.log('    người này từng ghi trên game nhà khác sẽ mất chỗ tra ra tên.');
  }

  console.log(`\n${tk.bes.length} bé:`);
  for (const b of tk.bes) {
    console.log(
      `  · ${b.displayName} (${b.username})${b.isLocked ? ' — ĐANG KHOÁ' : ''}, ${b.soGame} game`
    );
  }
  if (tk.bes.length === 0) console.log('  (chưa tạo tài khoản nào cho bé)');

  console.log(`\n${tk.games.length} game, tổng ${doLon(tk.tongSb3Bytes)} file .sb3:`);
  for (const g of tk.games) {
    console.log(`  · ${g.title} — ${g.status}, ${doLon(g.sb3Size)}`);
  }
  if (tk.games.length === 0) console.log('  (chưa đăng game nào)');

  console.log('\nSẽ Ở LẠI sau khi xoá:');
  console.log(
    `  · ${tk.soHoSoNhamVao} yêu cầu gỡ bản quyền nhắm vào game của nhà này ` +
      '(chụp tên game lại, bỏ liên kết) — hồ sơ pháp lý, /dieu-khoan đã nói'
  );
  if (tk.soHoSoTuGui > 0) {
    console.log(
      `  · ${tk.soHoSoTuGui} yêu cầu gỡ do CHÍNH email này gửi đi — cột claimantEmail\n` +
        '     vẫn mang địa chỉ đó. Nếu yêu cầu xoá bao gồm cả phần này thì phải xử lý riêng.'
    );
  }
  console.log(
    `\nSẽ xoá thêm ${tk.soDauVetDangNhap} hàng LoginAttempt ` +
      '(bảng không có khoá ngoại, cascade không chạm tới — nó giữ email và username thô).'
  );
}

async function main() {
  if (!email) {
    console.error('Thiếu email. Ví dụ:');
    console.error('  pnpm --filter @kidogame/web db:xoa-gia-dinh me@vidu.com');
    process.exitCode = 2;
    return;
  }

  console.log(xoaThat ? 'Chế độ: XOÁ THẬT' : 'Chế độ: chạy khô (thêm --xoa để xoá thật)');

  let tk: ThongKeGiaDinh;
  try {
    tk = await xemTruocXoaGiaDinh(email);
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : e}`);
    process.exitCode = 2;
    return;
  }

  inThongKe(tk);

  if (!xoaThat) {
    /*
     * Link tải file gốc CHỈ in ở lần chạy khô, và đó là điểm chính của lần chạy khô
     * này chứ không phải phần trang trí. Sau khi xoá, file thành mồ côi và lần
     * `storage:prune --xoa` kế tiếp dọn mất — nên đây là cửa sổ duy nhất còn gửi được
     * cho phụ huynh bản gốc công của con họ. Xoá tài khoản là quyền của họ; mất luôn
     * file mà không ai kịp nói thì không phải thứ họ yêu cầu.
     */
    const links = linkTaiSb3(tk);
    if (links.length > 0) {
      console.log('\nGửi mấy link này cho phụ huynh TRƯỚC khi xoá — sau đó file sẽ bị dọn:');
      for (let i = 0; i < links.length; i++) {
        console.log(`  ${tk.games[i].title}\n    ${links[i]}`);
      }
      /*
       * Nói kèm, vì người chạy lệnh này là người sẽ soạn thư cho phụ huynh.
       *
       * `validateAndNormalize` re-zip file lúc nhận, chỉ giữ project.json và asset được
       * tham chiếu, nên đây KHÔNG phải byte bé đã gửi lên. Hứa "bản gốc" trong thư rồi
       * phụ huynh mở ra thấy thiếu sprite con họ để dành là hỏng niềm tin đúng lúc tài
       * khoản đã xoá và không còn gì kiểm lại.
       */
      console.log(
        '\nNói rõ trong thư: file này là bản hệ thống đã đóng gói lại, gồm project và\n' +
          'mọi asset game đang dùng. Asset bé để dành mà chưa dùng thì không có trong đó.'
      );
    }
    console.log('\nChạy khô: chưa xoá gì. Thêm --xoa để xoá thật.');
    return;
  }

  if (!emailAdmin) {
    console.error('\nDỪNG: xoá thật thì phải có `--admin <email>` để ghi vết ai đã làm.');
    process.exitCode = 2;
    return;
  }
  const admin = await prisma.parent.findUnique({
    where: { email: emailAdmin.trim().toLowerCase() },
    select: { id: true, isAdmin: true },
  });
  if (!admin?.isAdmin) {
    console.error(`\nDỪNG: ${emailAdmin} không phải tài khoản quản trị.`);
    process.exitCode = 2;
    return;
  }

  try {
    await xoaGiaDinh(admin.id, email, ghiChu);
  } catch (e) {
    console.error(`\nDỪNG: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 2;
    return;
  }

  console.log(`\n✓ Đã xoá ${tk.email}: ${tk.bes.length} bé, ${tk.games.length} game.`);
  console.log('Đã gửi thư xác nhận tới địa chỉ đó (lần cuối gửi được).');
  console.log('Chạy tiếp `storage:prune --xoa` để dọn file mồ côi trên đĩa.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
