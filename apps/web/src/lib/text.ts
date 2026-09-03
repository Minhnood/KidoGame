/**
 * Làm sạch chữ do người dùng nhập.
 *
 * Ở riêng một file chứ không nằm trong `ingest.ts` như trước, vì `ingest.ts` kéo
 * theo cả `@kidogame/sb3` — tức cả `@turbowarp/packager`. Luồng gỡ bản quyền cũng
 * cần làm sạch chữ nhưng không đụng gì tới .sb3, và không có lý do gì để nó lôi
 * cả bộ đóng gói vào chỉ vì một hàm bốn dòng.
 */

/**
 * Bỏ ký tự điều khiển, gộp khoảng trắng, cắt độ dài.
 *
 * Không escape HTML ở đây — React tự escape khi render, và packager tự escape khi
 * nhúng vào <title>. Escape hai lần sẽ hiện ra `&amp;` trên giao diện.
 *
 * GỘP CẢ XUỐNG DÒNG thành một dấu cách. Đúng cho tiêu đề và mô tả game; sai cho
 * những ô mà người ta dán vào một danh sách nhiều dòng.
 */
export function sanitizeText(input: string, maxLength: number): string {
  return (
    input
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength)
  );
}

/**
 * Như trên nhưng GIỮ xuống dòng, chỉ gộp khoảng trắng trong từng dòng.
 *
 * Dành cho ô nhập dài, nơi người ta dán vào một danh sách mỗi thứ một dòng. Gộp
 * hết lại thành khối chữ liền là làm hỏng đúng phần cần đọc kỹ nhất.
 */
export function sanitizeMultiline(input: string, maxLength: number): string {
  return (
    input
      // eslint-disable-next-line no-control-regex
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, ' ')
      .split('\n')
      .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
      .join('\n')
      // Ba dòng trống liên tiếp trở lên gộp còn một dòng trống.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, maxLength)
  );
}
