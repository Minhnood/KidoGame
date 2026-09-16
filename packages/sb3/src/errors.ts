/**
 * Mã lỗi ổn định để tầng API map sang thông báo thân thiện cho trẻ em.
 * Không bao giờ đưa message kỹ thuật thô ra UI.
 */
export type Sb3ErrorCode =
  | 'NOT_A_ZIP'
  | 'TOO_LARGE'
  | 'TOO_MANY_ENTRIES'
  | 'UNCOMPRESSED_TOO_LARGE'
  | 'COMPRESSION_BOMB'
  | 'UNSAFE_ENTRY_NAME'
  | 'MISSING_PROJECT_JSON'
  | 'PROJECT_JSON_TOO_LARGE'
  | 'PROJECT_JSON_INVALID'
  | 'MISSING_ASSET'
  | 'DISALLOWED_ASSET_TYPE'
  | 'DISALLOWED_EXTENSION'
  | 'CUSTOM_EXTENSION_URL'
  | 'PROFANITY'
  | 'PACKAGE_FAILED'
  // Ba mã dưới do tầng ứng dụng dùng, không phát sinh từ nội dung .sb3.
  | 'INVALID_TITLE'
  | 'RATE_LIMITED'
  | 'PREVIEW_EXPIRED';

export class Sb3Error extends Error {
  readonly code: Sb3ErrorCode;
  /** Chi tiết chỉ dùng cho log phía server, không trả ra client. */
  readonly detail?: string;

  constructor(code: Sb3ErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'Sb3Error';
    this.code = code;
    this.detail = detail;
  }
}
