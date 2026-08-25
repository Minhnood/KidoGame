/**
 * Wordlist cho bộ lọc. CỐ TÌNH ngắn và bảo thủ.
 *
 * Bộ lọc này chỉ là lớp chặn thô cho những trường hợp lộ liễu — nó KHÔNG thay
 * được kiểm duyệt của con người. Vì nền tảng cho phép public ngay, lớp bảo vệ
 * thật nằm ở nút report + phụ huynh ẩn game + admin takedown.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO CHIA HAI TẦNG
 *
 * Trước đây chỉ có một danh sách duy nhất, dùng chung cho cả tiêu đề lẫn TOÀN BỘ
 * nội dung bên trong file .sb3. Hậu quả gặp thật: một game Scratch tiếng Anh bị
 * chặn vì trong nội dung có chuỗi `vl` đứng tách biệt ở đâu đó.
 *
 * `vl` là viết tắt tiếng Việt. Đem một token hai ký tự của tiếng Việt đi quét
 * hàng nghìn chuỗi tiếng Anh thì nó không còn là từ nữa — nó chỉ là hai chữ cái,
 * và va trúng là chuyện sớm muộn. Bề mặt quét càng lớn thì token càng ngắn càng
 * vô dụng.
 *
 * Nên tách theo BỀ MẶT quét, chứ không phải theo mức độ nặng nhẹ của từ:
 *
 *  - Tiêu đề và mô tả: bé TỰ GÕ, dài vài chục ký tự. Quét cả từ viết tắt được,
 *    vì đây đúng là chỗ trẻ hay chửi tắt, và khớp nhầm thì bé sửa lại tên là xong.
 *  - Nội dung .sb3: hàng nghìn chuỗi, thường không phải tiếng Việt, và khớp nhầm
 *    là bé MẤT HẲN khả năng đăng game mà không biết vì sao. Chỉ quét từ đầy đủ,
 *    không bao giờ quét viết tắt.
 * ---------------------------------------------------------------------------
 */

/**
 * Từ đầy đủ, đủ rõ nghĩa để quét ở bất cứ đâu kể cả nội dung game.
 *
 * Thêm từ thì thêm cả dạng KHÔNG DẤU, vì trẻ hay gõ không dấu.
 */
const PROFANITY_FULL_VI: string[] = [
  'địt',
  'dit me',
  'đụ',
  'lồn',
  'lon me',
  'cặc',
  'buồi',
  'đéo',
  'deo me',
  'chó chết',
  'ngu như',
  'óc chó',
  'oc cho',
  'mẹ mày',
  'me may',
  'thằng chó',
];

const PROFANITY_FULL_EN: string[] = [
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'cunt',
  'asshole',
  'dick',
  'pussy',
  'bastard',
  'whore',
  'slut',
  'nigger',
  'faggot',
  'rape',
  'porn',
  'sex',
];

/**
 * Viết tắt kiểu chat tiếng Việt. CHỈ dùng cho tiêu đề/mô tả.
 *
 * Mỗi từ ở đây đều ngắn tới mức ra khỏi ngữ cảnh tiếng Việt là mất hết nghĩa.
 * Đừng bao giờ đem danh sách này đi quét nội dung .sb3 — đó chính là lỗi cũ.
 */
const PROFANITY_ABBREV_VI: string[] = ['đm', 'dm', 'đmm', 'vcl', 'vl', 'cc', 'cmm', 'clm', 'cak'];

const lower = (list: string[]) => list.map((w) => w.toLowerCase());

/** Dùng cho tiêu đề và mô tả — bé tự gõ, bề mặt nhỏ. */
export const PROFANITY_TEXT = lower([
  ...PROFANITY_FULL_VI,
  ...PROFANITY_FULL_EN,
  ...PROFANITY_ABBREV_VI,
]);

/**
 * Dùng cho nội dung bên trong .sb3 — bề mặt lớn, thường không phải tiếng Việt.
 *
 * `sex` và `dick` là hai từ dễ khớp nhầm nhất còn sót lại (bài học sinh học, tên
 * riêng Dick). Vẫn giữ vì chúng là từ đầy đủ, nhưng nếu về sau có báo cáo khớp
 * nhầm thật thì đây là hai ứng viên đầu tiên để bỏ khỏi danh sách quét nội dung.
 */
export const PROFANITY_CONTENT = lower([...PROFANITY_FULL_VI, ...PROFANITY_FULL_EN]);
