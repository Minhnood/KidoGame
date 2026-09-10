/**
 * Ai đứng sau KidoGame, và trong bao lâu thì một khiếu nại được trả lời.
 *
 * Đọc từ biến môi trường chứ không viết cứng, cùng lý do với `APP_DOMAIN` /
 * `PLAYER_DOMAIN`: khai đúng MỘT chỗ (`infra/.env`) rồi mọi nơi cùng đọc. Ở đây
 * còn thêm một lý do nữa — đây là tên và email thật của một con người, và repo
 * này công khai. Viết vào code là để nó nằm vĩnh viễn trong lịch sử git.
 *
 * Vì giá trị chỉ có lúc CHẠY (compose truyền vào), mọi trang hiển thị nó PHẢI là
 * `force-dynamic`. Image Docker build một lần rồi chạy ở nhiều nơi; render sẵn
 * lúc build là đóng băng giá trị mặc định của máy build vào trang.
 */

/** Bao nhiêu ngày làm việc thì một yêu cầu gỡ bản quyền phải được trả lời. */
export const TAKEDOWN_SLA_WORKING_DAYS = 3;

export interface Operator {
  name: string;
  email: string;
}

/**
 * Giá trị mặc định CỐ Ý nhìn là biết chưa cấu hình.
 *
 * Không ném lỗi khi thiếu, khác `RESEND_API_KEY` trong `mail.ts`. Thiếu key mail
 * là rò token nên phải chặn; còn thiếu tên đơn vị vận hành chỉ làm trang điều
 * khoản kém đầy đủ, mà đánh sập cả trang web vì một dòng chữ thì tệ hơn nhiều.
 * Chỗ nào cần biết đã cấu hình hay chưa thì hỏi `isOperatorConfigured()`.
 */
const FALLBACK: Operator = {
  name: 'KidoGame (chưa cấu hình OPERATOR_NAME)',
  email: 'chua-cau-hinh@kidogame.local',
};

export function operator(): Operator {
  return {
    name: process.env.OPERATOR_NAME?.trim() || FALLBACK.name,
    email: process.env.OPERATOR_EMAIL?.trim().toLowerCase() || FALLBACK.email,
  };
}

/**
 * Tên miền cấp cao KHÔNG BAO GIỜ nhận được thư từ Internet.
 *
 * `.test`, `.example`, `.invalid`, `.localhost` do RFC 6761 giữ lại và cấm uỷ
 * quyền cho ai; `.local` thì RFC 6762 dành cho mDNS trong mạng nội bộ. Thư gửi
 * tới bất kỳ địa chỉ nào dưới các đuôi này đều bị trả về — không có ngoại lệ nào
 * mà một bản cài đặt KidoGame có thể tạo ra.
 *
 * CHỈ chặn theo TLD, không chặn `example.com` và họ hàng: đó là tên cấp HAI, và
 * một khi bắt đầu liệt kê tên cấp hai thì danh sách phải nuôi mãi. Luật ở đây gói
 * gọn trong một câu kiểm được: đuôi này thì bưu điện Internet không giao.
 */
const TLD_KHONG_NHAN_THU = ['.local', '.localhost', '.test', '.example', '.invalid'];

/** Địa chỉ có nằm dưới một TLD không bao giờ nhận được thư không. */
export function laDiaChiChet(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return true; // không có @ thì không phải địa chỉ thư
  const mien = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
  if (!mien) return true;
  return TLD_KHONG_NHAN_THU.some((tld) => mien === tld.slice(1) || mien.endsWith(tld));
}

/**
 * Đã có một đơn vị vận hành LIÊN HỆ ĐƯỢC hay chưa.
 *
 * "Liên hệ được" chứ không phải "có gõ gì đó vào biến môi trường", và khác biệt
 * đó không phải chuyện chữ nghĩa — bốn chỗ trong dự án hỏi hàm này, và mỗi chỗ
 * hỏng một kiểu khi địa chỉ có mặt nhưng chết:
 *
 *   - `mail.ts` đặt `Reply-To` trỏ vào hư không, trong khi sáu lá thư bảo người
 *     nhận hãy trả lời, và một trong số đó là đường DUY NHẤT để phụ huynh lấy lại
 *     `.sb3` của con trước ngày xoá vĩnh viễn;
 *   - `prisma/nhac-viec-co-han.ts` gửi thư nhắc mỗi đêm rồi in `✓ Đã gửi tới …`
 *     — một dòng báo thành công cho việc không xảy ra;
 *   - `takedown.ts` gửi thông báo khiếu nại bản quyền cho đội vận hành, và nó nằm
 *     trong `Promise.allSettled` nên gửi trượt không để lại dấu vết nào;
 *   - `/dieu-khoan` in địa chỉ ấy ra CÔNG KHAI làm nơi nhận khiếu nại, và không
 *     hiện cảnh báo, vì theo phép kiểm cũ thì đã cấu hình rồi.
 *
 * Bốn chỗ đó đều đã làm đúng cho trường hợp CHƯA KHAI. Coi địa chỉ chết là chưa
 * khai thì cả bốn tự đúng, thay vì vá bốn lần ở bốn nơi và bỏ sót chỗ thứ năm khi
 * có người thêm.
 *
 * Không tự đoán xa hơn: một tên miền thật mà gõ sai chính tả thì hàm này vẫn nói
 * đã cấu hình. Kiểm địa chỉ có người đọc hay không là việc của `mail-check.mjs
 * --send`, và không có luật cú pháp nào thay được một lá thư gửi thật.
 */
export function isOperatorConfigured(): boolean {
  const email = process.env.OPERATOR_EMAIL?.trim();
  return Boolean(process.env.OPERATOR_NAME?.trim() && email && !laDiaChiChet(email));
}

/**
 * Hạn trả lời một yêu cầu, tính từ lúc nhận.
 *
 * Đếm NGÀY LÀM VIỆC, bỏ thứ bảy và chủ nhật, vì lời hứa trên trang điều khoản viết
 * đúng như vậy. Đếm ngày thường thì một yêu cầu đến chiều thứ sáu sẽ có hạn rơi vào
 * đúng thứ hai, và trang admin sẽ báo trễ hạn cho một việc chưa hề trễ.
 *
 * KHÔNG trừ ngày lễ. Lịch nghỉ lễ Việt Nam đổi theo từng năm và phải cập nhật tay,
 * mà một bảng lịch lỡ quên cập nhật còn tệ hơn là không có: nó sai một cách âm thầm.
 * Hệ quả là quanh Tết con số này hơi chặt hơn thực tế — chấp nhận được, vì nó chỉ
 * là nhắc nhở cho admin chứ không tự động làm gì cả.
 */
export function slaDueAt(from: Date, workingDays = TAKEDOWN_SLA_WORKING_DAYS): Date {
  const due = new Date(from.getTime());
  let left = workingDays;
  while (left > 0) {
    due.setDate(due.getDate() + 1);
    const day = due.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return due;
}
