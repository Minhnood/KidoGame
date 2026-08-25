/**
 * Mọi giới hạn của pipeline nằm ở một chỗ để dễ audit và chỉnh.
 * Đây là tuyến phòng thủ chính chống zip bomb / payload ẩn — đừng nới lỏng
 * mà không đọc lại `validate.ts`.
 */
export const LIMITS = {
  /** Kích thước file .sb3 upload (nén). */
  MAX_SB3_BYTES: 50 * 1024 * 1024,

  /** Tổng dung lượng sau khi giải nén. Chặn zip bomb. */
  MAX_UNCOMPRESSED_BYTES: 150 * 1024 * 1024,

  /** Số entry trong zip. Scratch project thực tế hiếm khi vượt vài trăm. */
  MAX_ENTRIES: 500,

  /** Tỉ lệ nén tối đa cho một entry. Zip bomb thường > 1000:1. */
  MAX_COMPRESSION_RATIO: 100,

  /** project.json riêng lẻ. */
  MAX_PROJECT_JSON_BYTES: 10 * 1024 * 1024,

  /** Một asset đơn lẻ. */
  MAX_ASSET_BYTES: 25 * 1024 * 1024,
} as const;

/**
 * Extension được phép. Cố tình rất hẹp ở MVP.
 *
 * Loại trừ có chủ đích:
 *  - `text2speech`, `translate` — gọi API bên thứ ba từ máy người chơi.
 *  - `videoSensing` — xin quyền camera, không phù hợp nền tảng trẻ em.
 *  - Mọi custom extension URL — TurboWarp cho phép "unsandboxed extension"
 *    load JS từ URL bất kỳ, tức arbitrary code execution.
 */
export const ALLOWED_EXTENSIONS = new Set(['pen', 'music']);

/** Đuôi file asset hợp lệ trong .sb3. */
export const ALLOWED_ASSET_EXTENSIONS = new Set([
  'png',
  'svg',
  'jpg',
  'jpeg',
  'bmp',
  'gif',
  'wav',
  'mp3',
  'ogg',
]);

/** ZIP local file header. Không tin phần đuôi tên file. */
export const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
