/**
 * Gửi một báo cáo lỗi từ trình duyệt về `/api/errors`.
 *
 * File này KHÔNG import bất cứ thứ gì — cố ý, và đây là điều kiện để
 * `global-error.tsx` được phép dùng nó.
 *
 * `global-error.tsx` có một bất biến: không import component nào của site, không
 * Tailwind, không token màu, vì nó là trang cho lúc mọi thứ khác đã đổ. Một module
 * thuần không phụ thuộc gì thì không phá bất biến đó — thứ duy nhất có thể làm nó
 * hỏng là chính vài dòng dưới đây. Thêm một import vào file này là lặng lẽ nối
 * global-error vào cái cây vừa sập.
 *
 * VÌ SAO `sendBeacon` CHỨ KHÔNG `fetch`: đã trả giá cho bài học này ở
 * `game-frame.tsx`. `fetch` bắn-rồi-quên mà không ai đọc response thì trình duyệt
 * kể lại thành `net::ERR_ABORTED` trong console — nghĩa là cơ chế bắt lỗi lại tự
 * đẻ ra một dòng đỏ mỗi lần nó chạy. `keepalive: true` KHÔNG chữa được (đã đo).
 * `sendBeacon` không có response nên không có gì để hỏng, và nó còn gửi được cả
 * khi trang đang bị đóng — đúng lúc lỗi nghiêm trọng hay xảy ra.
 */

/** Nguồn phát hiện lỗi. Trùng với cột `ErrorLog.source`. */
export type ErrorSource = 'boundary' | 'global';

/**
 * Trần độ dài gửi lên. Server vẫn cắt lại lần nữa — đây chỉ để không bao giờ đẩy
 * cả một stack trace vài chục KB qua beacon, vốn có hạn mức riêng của trình duyệt
 * (64KB) và vượt là nó lặng lẽ trả false.
 */
const MAX_MESSAGE = 300;

export function reportError(source: ErrorSource, error: unknown): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;

    const e = (error ?? {}) as { message?: unknown; digest?: unknown };

    /*
     * Chỉ gửi PATHNAME, không gửi `location.href`.
     *
     * Query string ở trang này mang những thứ như token trong link xác minh email.
     * Gửi cả href là đưa token vào một bảng mà cả trang admin đọc được.
     */
    const path = typeof location === 'undefined' ? '/' : location.pathname;

    const body = JSON.stringify({
      source,
      path,
      digest: typeof e.digest === 'string' ? e.digest : '',
      message: typeof e.message === 'string' ? e.message.slice(0, MAX_MESSAGE) : '',
    });

    /*
     * `type: 'text/plain'` chứ không `application/json`: beacon với content-type
     * json là một request "không đơn giản" theo CORS nên trình duyệt đòi preflight
     * — mà beacon không làm được preflight, nó chỉ trả về false. Route bên server
     * đọc bằng `request.text()` rồi tự `JSON.parse`.
     */
    navigator.sendBeacon('/api/errors', new Blob([body], { type: 'text/plain' }));
  } catch {
    /*
     * Nuốt hết. Đây là code chạy TRONG error boundary: nếu nó ném thì React không
     * còn boundary nào ở trên để bắt, và người dùng nhận trang trắng thay vì trang
     * lỗi tử tế mà ta vừa dựng.
     */
  }
}
