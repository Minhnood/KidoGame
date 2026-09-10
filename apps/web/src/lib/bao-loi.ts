/**
 * Người dùng tự báo một chỗ hỏng — `/bao-loi`.
 *
 * VÌ SAO CẦN. `app/error.tsx` từ trước đã nói với người gặp lỗi: "Nếu báo lỗi cho
 * chúng tôi, gửi kèm mã này giúp tìm ra nguyên nhân nhanh hơn nhiều" — mà KHÔNG nói
 * báo ở đâu, và không có chỗ nào để báo. `/admin/loi` thì viết như thể luồng ấy đã
 * tồn tại: "Phụ huynh báo lỗi kèm mã thì tìm bằng…". Đường duy nhất là email của đơn
 * vị vận hành, hiện còn là một địa chỉ `.local`. Cùng loại lỗ hổng với quyền xoá tài
 * khoản: một câu hứa trên trang mà không có cơ chế đằng sau.
 *
 * Và lỗi tự động KHÔNG thay được đường này. `ErrorLog` chỉ thấy những gì làm React
 * ném exception; nó không bao giờ thấy "game của con tôi mở ra màn hình đen", "bấm
 * gửi mà không có gì xảy ra", hay "thư xác minh không tới" — đúng những chỗ hỏng mà
 * người dùng gặp nhiều nhất và máy không phát hiện được.
 *
 * ĐÂY LÀ MỘT HỘP NHẬN CHỮ DO NGƯỜI NGOÀI GÕ, ghi thẳng vào DB, KHÔNG cần đăng nhập —
 * cùng loại rủi ro với `error-log.ts`, nên cùng bốn lớp chặn, đặt ở bốn chỗ dưới đây:
 *
 *   1. cắt độ dài mọi trường, kể cả những trường người dùng không thấy;
 *   2. trần theo IP, tính theo GIỜ chứ không theo phút — người gõ tay không gửi ba
 *      mươi báo cáo một phút, nên một trần kiểu ấy chỉ mở cửa cho script;
 *   3. trần TỔNG số báo cáo chưa xử lý, vì trần theo IP không cứu được người có
 *      nhiều IP;
 *   4. cắt query string khỏi đường dẫn, không lưu IP thô, không lưu user agent đầy đủ.
 */
import { createHash } from 'node:crypto';
import { prisma } from './db';
import { rateKey, tooMany } from './rate-limit';

const MAX_MO_TA = 2000;
const MAX_MA_LOI = 64;
const MAX_DUONG_DAN = 200;
const MAX_EMAIL = 200;

/**
 * Mô tả phải dài hơn bằng này mới nhận.
 *
 * Không phải để lọc người dùng mà để lọc cú bấm nhầm: một form gửi đi với mô tả "a"
 * hay "test" thì người trực không làm được gì với nó, và nó vẫn chiếm một dòng trong
 * hàng đợi mà họ phải đọc rồi đánh dấu đã xử lý.
 */
const MIN_MO_TA = 10;

/** Trần báo cáo nhận từ một IP trong một giờ. */
export const BAO_LOI_MOI_IP_MOI_GIO = 5;

/**
 * Trần TỔNG số báo cáo chưa xử lý.
 *
 * Cùng lý lẽ với `MAX_UNRESOLVED_GROUPS` của `error-log.ts`: trần theo IP không chặn
 * được người có nhiều IP. Chạm trần thì báo cáo mới bị từ chối và người gửi ĐƯỢC BÁO
 * — khác hướng với lỗi tự động (ở đó bỏ im lặng là đúng, vì không có ai đang đứng
 * chờ). Ở đây có một người thật vừa gõ xong một đoạn văn; để họ tưởng đã gửi được là
 * tệ hơn nói thật rằng hộp thư đang đầy.
 *
 * KHÔNG xoá báo cáo cũ để nhường chỗ: làm vậy thì ai muốn đẩy một báo cáo thật ra
 * khỏi hàng đợi chỉ cần gửi hai trăm cái rỗng.
 */
export const MAX_BAO_LOI_CHUA_XU_LY = 200;

export class BaoLoiError extends Error {}

function bam(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Rút tên trình duyệt từ user agent, giống `error-log.ts`.
 *
 * Giữ đúng "Chrome 130", bỏ phần còn lại: đủ để thấy một chỗ hỏng chỉ xảy ra trên một
 * trình duyệt, mà không giữ chuỗi dài vốn gần như là dấu vân tay của một máy.
 */
function tenTrinhDuyet(ua: string | null): string {
  if (!ua) return '';
  const m =
    /(Edg|OPR|Chrome|Firefox|Safari)\/(\d+)/.exec(ua) ?? /(Version)\/(\d+)/.exec(ua) ?? null;
  if (!m) return '';
  const ten = { Edg: 'Edge', OPR: 'Opera', Version: 'Safari' }[m[1]] ?? m[1];
  return `${ten} ${m[2]}`;
}

/** Cắt query string và hash. Cùng lý do với `ErrorLog.path`. */
function duongDanSach(raw: string): string {
  const chi = raw.split('?')[0].split('#')[0].trim();
  if (!chi.startsWith('/')) return '';
  return chi.slice(0, MAX_DUONG_DAN);
}

export interface BaoLoiInput {
  moTa: string;
  maLoi?: string;
  duongDan?: string;
  emailLienHe?: string;
  ip: string | null;
  userAgent: string | null;
}

export async function guiBaoLoi(input: BaoLoiInput): Promise<void> {
  const moTa = input.moTa.trim().slice(0, MAX_MO_TA);
  if (moTa.length < MIN_MO_TA) {
    throw new BaoLoiError(
      `Kể thêm một chút giúp chúng tôi nhé — ít nhất ${MIN_MO_TA} ký tự. Bạn đang ở trang nào, bấm gì thì hỏng?`
    );
  }

  /* Trần theo IP tính theo GIỜ. Người gõ tay không gửi năm báo cáo trong một giờ, nên
     trần này gần như không bao giờ chạm phải với người thật — còn với script thì nó
     là cái chặn duy nhất đứng trước một bảng nhận chữ tự do. */
  if (input.ip && tooMany(rateKey('bao-loi', input.ip), BAO_LOI_MOI_IP_MOI_GIO, 60 * 60 * 1000)) {
    throw new BaoLoiError(
      'Bạn đã gửi khá nhiều báo lỗi trong một giờ qua. Nếu còn chỗ hỏng khác, gửi giúp chúng tôi sau ít phút nhé.'
    );
  }

  const chuaXuLy = await prisma.bugReport.count({ where: { resolvedAt: null } });
  if (chuaXuLy >= MAX_BAO_LOI_CHUA_XU_LY) {
    throw new BaoLoiError(
      'Hộp báo lỗi của chúng tôi đang đầy và chưa xử lý kịp. Bạn thử lại sau, hoặc email trực tiếp cho chúng tôi.'
    );
  }

  const email = input.emailLienHe?.trim().slice(0, MAX_EMAIL) ?? '';
  /* Kiểm email rất lỏng, cố ý: ô này TUỲ CHỌN và nó chỉ dùng để trả lời. Từ chối một
     báo cáo vì địa chỉ gõ thiếu dấu chấm là đánh mất nội dung báo cáo để giữ một
     trường mà chính người gửi cũng có thể bỏ trống. Gõ sai thì thư trả lời không tới,
     và đó là hậu quả cân xứng. */
  if (email && !email.includes('@')) {
    throw new BaoLoiError('Email liên hệ trông chưa đúng. Sửa lại, hoặc để trống cũng được.');
  }

  await prisma.bugReport.create({
    data: {
      moTa,
      maLoi: (input.maLoi ?? '').trim().slice(0, MAX_MA_LOI),
      duongDan: duongDanSach(input.duongDan ?? ''),
      emailLienHe: email,
      browser: tenTrinhDuyet(input.userAgent),
      ipHash: input.ip ? bam(input.ip) : '',
    },
  });
}

/** Đánh dấu một báo cáo đã xử lý, hoặc mở lại. Không xoá dòng. */
export async function datBaoLoiDaXuLy(id: string, daXuLy: boolean): Promise<void> {
  const co = await prisma.bugReport.findUnique({ where: { id }, select: { id: true } });
  if (!co) throw new BaoLoiError('Không tìm thấy báo lỗi này.');
  await prisma.bugReport.update({
    where: { id },
    data: { resolvedAt: daXuLy ? new Date() : null },
  });
}
