/**
 * Wordlist khởi điểm cho bộ lọc. CỐ TÌNH ngắn và bảo thủ.
 *
 * Bộ lọc này chỉ là lớp chặn thô cho những trường hợp lộ liễu — nó KHÔNG thay
 * được kiểm duyệt của con người. Vì nền tảng cho phép public ngay, lớp bảo vệ
 * thật nằm ở nút report + phụ huynh unpublish + admin takedown.
 *
 * Cách so khớp có kiểm tra ranh giới từ (xem `hasProfanity` trong packages/sb3),
 * nên "ngu" không khớp trong "Nguyên". Thêm từ thì thêm dạng không dấu nữa,
 * vì trẻ hay gõ không dấu.
 */
export const PROFANITY_VI: string[] = [
  'đm',
  'dm',
  'đmm',
  'vcl',
  'vl',
  'cc',
  'cmm',
  'clm',
  'địt',
  'dit me',
  'đụ',
  'lồn',
  'lon me',
  'cặc',
  'cak',
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

export const PROFANITY_EN: string[] = [
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

export const PROFANITY = [...PROFANITY_VI, ...PROFANITY_EN].map((w) => w.toLowerCase());
