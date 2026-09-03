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

export function isOperatorConfigured(): boolean {
  return Boolean(process.env.OPERATOR_NAME?.trim() && process.env.OPERATOR_EMAIL?.trim());
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
