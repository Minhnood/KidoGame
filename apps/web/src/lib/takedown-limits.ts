/**
 * Giới hạn độ dài của biểu mẫu gỡ bản quyền.
 *
 * Ở riêng khỏi `takedown.ts` vì cùng một lý do đã tách `report-reasons.ts`:
 * biểu mẫu là client component, mà `takedown.ts` import `prisma`. Client component
 * import thẳng vào đó là kéo cả Prisma xuống trình duyệt.
 *
 * File này KHÔNG được import bất cứ thứ gì thuộc tầng server.
 */

export const MAX_CLAIMANT_NAME_LENGTH = 120;
export const MAX_CLAIMANT_EMAIL_LENGTH = 200;
export const MAX_EVIDENCE_LENGTH = 2000;

/** Đủ dài để bắt buộc phải nói một điều gì đó, không phải gõ "abc" cho xong. */
export const MIN_EVIDENCE_LENGTH = 30;
