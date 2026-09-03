/**
 * Chuẩn hoá chuỗi để tìm kiếm không dấu.
 *
 * VÌ SAO CẦN: trẻ em gõ không dấu nhiều hơn người lớn tưởng. Nếu tìm "meo" mà
 * không ra "Mèo phiêu lưu" thì với một đứa bé, ô tìm kiếm coi như hỏng.
 *
 * VÌ SAO LÀ CỘT CHỨ KHÔNG PHẢI EXTENSION `unaccent` CỦA POSTGRES: `unaccent` phải
 * `CREATE EXTENSION`, tức là cần quyền cao lúc dựng DB và thêm một thứ có thể
 * thiếu trên VPS. Cùng lý do dự án chọn `scrypt` thay vì `argon2` — bớt một điểm
 * vỡ lúc deploy. Đổi lại phải nhớ ghi cột này mỗi khi tên game thay đổi.
 */

/** Dải ký tự dấu tổ hợp mà NFD tách ra. Viết bằng mã unicode cho khỏi mất khi copy. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Bỏ dấu tiếng Việt và chuyển về chữ thường.
 *
 * `normalize('NFD')` tách dấu thành ký tự tổ hợp rồi xoá chúng đi — xử lý được
 * gần hết. Riêng `đ`/`Đ` KHÔNG phải chữ `d` có dấu mà là một chữ cái riêng, NFD
 * không tách được, nên phải thay tay trước.
 */
export function normalizeForSearch(input: string): string {
  return input
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chuỗi tìm kiếm lưu vào `Game.titleSearch`: gộp cả tên và mô tả. */
export function buildTitleSearch(title: string, description: string): string {
  return normalizeForSearch(`${title} ${description}`).slice(0, 1000);
}
