/**
 * Nhắc bên vận hành những việc CÓ HẠN đang chờ, mỗi đêm một lá thư.
 *
 * VÌ SAO CẦN. Hạn trả lời một yêu cầu gỡ bản quyền — `TAKEDOWN_SLA_WORKING_DAYS`
 * ngày làm việc — được hứa CÔNG KHAI ở cả `/dieu-khoan` lẫn `/bao-cao-ban-quyen`. Cơ
 * chế duy nhất để giữ được hạn đó là có người tự mở tab Tổng quan mỗi ngày. Ô đếm
 * "quá hạn" nằm sẵn trên bảng, nhưng không có gì đẩy tin ra ngoài — nên một hạn có
 * nghĩa vụ pháp lý phụ thuộc vào việc ai đó nhớ mở một trang web. Cùng loại lỗ hổng
 * với "quyền xoá tài khoản chỉ thực hiện được bằng psql".
 *
 * Số liệu đọc từ `src/lib/viec-co-han.ts`, ĐÚNG hàm mà tab Tổng quan gọi. Hai chỗ tự
 * tính "cái nào sắp muộn" là hai câu trả lời khác nhau cho cùng một câu hỏi, và lệch
 * ở đây nghĩa là bảng nói không có việc gấp trong khi lá thư nói có ba.
 *
 * BỐN ĐIỀU CỐ Ý:
 *
 * 1. KHÔNG GỬI GÌ KHI KHÔNG CÓ VIỆC. Một lá thư "0 việc quá hạn" mỗi đêm là lá thư
 *    người ta học cách bỏ qua trong hai tuần, rồi bỏ qua luôn cái đêm nó khác. Im
 *    lặng là tín hiệu, không phải thiếu sót.
 * 2. NHẮC TRƯỚC KHI MUỘN, không chỉ khi đã muộn. Một lá thư nói "đã quá hạn" là thư
 *    báo tin đã mất; hạn hứa công khai thì giá trị nằm ở chỗ giữ được nó. Xem
 *    `NHAC_TRUOC_NGAY_LAM_VIEC`.
 * 3. TỪ CHỐI CHẠY KHI CHƯA CẤU HÌNH ĐƠN VỊ VẬN HÀNH. Mặc định của `operator()` là
 *    `chua-cau-hinh@kidogame.local` — gửi vào đó là gửi vào hư không, và nó sẽ trông
 *    như đã gửi xong trong log. Thà đỏ mỗi đêm cho tới khi có người điền.
 * 4. MẶC ĐỊNH CHỈ IN, phải `--gui` mới gửi thật. Cùng khuôn với hai script dọn: xem
 *    trước là mặc định. Service `prune` luôn chạy với `--gui`.
 *
 * Chạy:
 *   pnpm --filter @kidogame/web db:nhac-viec-co-han          # chỉ IN
 *   pnpm --filter @kidogame/web db:nhac-viec-co-han --gui    # gửi thật
 */
import { prisma } from '../src/lib/db';
import { sendMail } from '../src/lib/mail';
import { ngayVi } from '../src/lib/moderation';
import { isOperatorConfigured, operator, TAKEDOWN_SLA_WORKING_DAYS } from '../src/lib/operator';
import {
  docViecCoHan,
  NHAC_TRUOC_NGAY_LAM_VIEC,
  SAP_XOA_NGAY,
  type ViecCoHan,
} from '../src/lib/viec-co-han';

const guiThat = process.argv.includes('--gui');

/**
 * Origin của khu quản trị, để link trong thư bấm được.
 *
 * Rỗng thì in đường dẫn trần (`/admin/tong-quan`) chứ không in một origin đoán bừa:
 * một link sai trong thư nhắc dẫn người trực tới trang 404 đúng lúc họ đang gấp, còn
 * một đường dẫn trần thì họ tự ghép được. `ADMIN_ORIGIN` chỉ có ở production khi
 * `ADMIN_DOMAIN` đã khai — xem `infra/docker-compose.yml`.
 */
function adminUrl(duongDan: string): string {
  const raw = process.env.ADMIN_ORIGIN?.trim();
  if (!raw) return duongDan;
  return `${raw.replace(/\/$/, '')}${duongDan}`;
}

/** Chủ đề phải đọc được mà KHÔNG mở thư — đó là toàn bộ việc của một lá thư nhắc. */
function chuDe(v: ViecCoHan): string {
  const phan: string[] = [];
  if (v.goQuaHan.length > 0) phan.push(`${v.goQuaHan.length} yêu cầu gỡ QUÁ HẠN`);
  if (v.goSapToiHan.length > 0) phan.push(`${v.goSapToiHan.length} sắp tới hạn`);
  if (v.gameSapXoa.length > 0) phan.push(`${v.gameSapXoa.length} game sắp bị xoá hẳn`);
  if (v.gameQuaHanXoa.length > 0) phan.push(`${v.gameQuaHanXoa.length} game bị xoá đêm nay`);
  return `[KidoGame] ${phan.join(', ')}`;
}

function thanThu(v: ViecCoHan): string {
  const d: string[] = ['Chào bạn,', ''];

  if (v.goQuaHan.length > 0) {
    d.push(
      `${v.goQuaHan.length} YÊU CẦU GỠ BẢN QUYỀN ĐÃ QUÁ HẠN TRẢ LỜI.`,
      `Hạn là ${TAKEDOWN_SLA_WORKING_DAYS} ngày làm việc, và nó được hứa công khai trên trang điều khoản.`,
      ''
    );
    for (const r of v.goQuaHan) {
      d.push(`  · "${r.gameTitle}" — nhận ${ngayVi(r.createdAt)}, hạn ${ngayVi(r.han)}`);
      d.push(`    người khiếu nại: ${r.claimantEmail}`);
    }
    d.push('');
  }

  if (v.goSapToiHan.length > 0) {
    d.push(`${v.goSapToiHan.length} yêu cầu sắp tới hạn (trong ${NHAC_TRUOC_NGAY_LAM_VIEC} ngày làm việc):`, '');
    for (const r of v.goSapToiHan) {
      d.push(`  · "${r.gameTitle}" — nhận ${ngayVi(r.createdAt)}, hạn ${ngayVi(r.han)}`);
    }
    d.push('');
  }

  if (v.gameSapXoa.length > 0) {
    d.push(
      `${v.gameSapXoa.length} GAME ĐÃ GỠ SẮP BỊ XOÁ HẲN (còn ${SAP_XOA_NGAY} ngày hoặc ít hơn).`,
      'Sau hạn đó nút "Cho hiện lại" không còn gì để hiện lại, và file .sb3 gốc của bé',
      'cũng đi theo. Đây là việc duy nhất trong khu quản trị mà bỏ lỡ là mất vĩnh viễn.',
      ''
    );
    for (const g of v.gameSapXoa) {
      d.push(`  · "${g.title}" của bé ${g.tenBe} — gỡ ${ngayVi(g.removedAt)}, xoá hẳn ${ngayVi(g.han)}`);
    }
    d.push('');
  }

  if (v.gameQuaHanXoa.length > 0) {
    /* Nhóm này KHÔNG còn cứu được — thư gửi lúc 4:00 và lượt dọn chạy ngay sau đó.
       Vẫn nói ra, vì nếu nó lớn dần qua nhiều đêm thì đó là dấu hiệu bước dọn đang
       lỗi, và không có chỗ nào khác nói điều đó ra. */
    d.push(
      `${v.gameQuaHanXoa.length} game đã quá hạn giữ và sẽ bị xoá hẳn trong lượt dọn ngay sau thư này.`,
      'Nếu con số này lớn dần qua nhiều đêm thì bước dọn đang lỗi — xem log service prune.',
      ''
    );
  }

  d.push(
    `Mở bảng tổng quan: ${adminUrl('/admin/tong-quan')}`,
    `Hàng đợi bản quyền: ${adminUrl('/admin?loc=tat-ca')}`,
    '',
    'Thư này chỉ gửi khi có việc có hạn đang chờ. Đêm nào im lặng là đêm không có gì.',
    '',
    'KidoGame',
  );
  return d.join('\n');
}

async function main() {
  const v = await docViecCoHan();
  const tong =
    v.goQuaHan.length + v.goSapToiHan.length + v.gameSapXoa.length + v.gameQuaHanXoa.length;

  console.log(guiThat ? 'Chế độ: GỬI THẬT' : 'Chế độ: chỉ in (thêm --gui để gửi thật)');
  console.log(
    `Hàng đợi bản quyền đang mở: ${v.goQuaHan.length + v.goSapToiHan.length + v.goConHan.length}` +
      ` (quá hạn ${v.goQuaHan.length}, sắp tới hạn ${v.goSapToiHan.length}, còn hạn ${v.goConHan.length})`
  );
  console.log(
    `Game đã gỡ: sắp xoá ${v.gameSapXoa.length}, đã quá hạn giữ ${v.gameQuaHanXoa.length}`
  );

  if (tong === 0) {
    console.log('\nKhông có việc có hạn nào. KHÔNG gửi thư — im lặng là tín hiệu.');
    return;
  }

  console.log(`\n${chuDe(v)}\n`);
  console.log(thanThu(v));

  if (!guiThat) {
    console.log('\nChỉ in: chưa gửi gì. Thêm --gui để gửi thật.');
    return;
  }

  /*
   * Chốt này đứng SAU phần in, cố ý: chưa cấu hình đơn vị vận hành thì vẫn phải đọc
   * được danh sách việc đang chờ trong log. Chặn cái không làm được (gửi) chứ không
   * chặn luôn cái làm được (nói ra).
   */
  if (!isOperatorConfigured()) {
    console.error(
      '\nDỪNG: chưa khai OPERATOR_NAME và OPERATOR_EMAIL, nên không có địa chỉ nào để gửi.'
    );
    console.error(`Mặc định là ${operator().email} — gửi vào đó là gửi vào hư không.`);
    process.exitCode = 2;
    return;
  }

  await sendMail({ to: operator().email, subject: chuDe(v), text: thanThu(v) });
  console.log(`\n✓ Đã gửi tới ${operator().email}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
