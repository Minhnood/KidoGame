/**
 * Lý do báo cáo — danh sách CỐ ĐỊNH, không cho nhập tự do.
 *
 * Người báo cáo có thể là khách vãng lai không đăng nhập, nên ô nhập tự do là một
 * kênh để người lạ gửi chữ tuỳ ý vào màn hình của admin. Danh sách cố định vừa
 * tránh chuyện đó, vừa cho phép thống kê theo lý do sau này.
 *
 * File này CỐ Ý không import gì từ tầng server: client component render nó, mà
 * `moderation.ts` cũng dùng nó để kiểm tra đầu vào. Nếu để chung với code có
 * `prisma`, cả Prisma sẽ bị kéo vào bundle của trình duyệt.
 */
export const REPORT_REASONS = [
  { value: 'KHONG_PHU_HOP', label: 'Nội dung không phù hợp với trẻ em' },
  { value: 'DANG_SO', label: 'Hình ảnh hoặc âm thanh đáng sợ' },
  { value: 'NOI_XAU', label: 'Có lời lẽ thô tục hoặc nói xấu người khác' },
  { value: 'CHEP_BAI', label: 'Game này chép của người khác' },
  { value: 'KHAC', label: 'Lý do khác' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

const VALUES = new Set<string>(REPORT_REASONS.map((r) => r.value));

export function isReportReason(value: string): value is ReportReason {
  return VALUES.has(value);
}

/** Nhãn tiếng Việt để hiện ở trang admin. Lý do lạ thì hiện nguyên mã, không vỡ trang. */
export function reasonLabel(value: string): string {
  return REPORT_REASONS.find((r) => r.value === value)?.label ?? value;
}
