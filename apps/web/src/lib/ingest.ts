import {
  validateAndNormalize,
  packageToHtml,
  renderThumbnail,
  readSb3Zip,
  Sb3Error,
} from '@kidogame/sb3';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { putObject } from './storage';
import { PROFANITY_CONTENT, PROFANITY_TEXT } from './profanity';
import { buildTitleSearch } from './search';

/** Số game một bé được đăng trong 24h. Chặn spam làm ngập trang chủ. */
export const UPLOADS_PER_CHILD_PER_DAY = 10;

/**
 * Số tag tối đa cho mỗi game.
 *
 * Ít có chủ đích: cho chọn thoải mái thì bé nào cũng tick hết mọi tag để game
 * xuất hiện ở mọi nơi, và bộ lọc mất sạch ý nghĩa.
 */
export const MAX_TAGS_PER_GAME = 2;

export const MAX_TITLE_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Làm sạch text do trẻ nhập: bỏ ký tự điều khiển, gộp khoảng trắng, cắt độ dài.
 * Không escape HTML ở đây — React tự escape khi render, và packager tự escape
 * khi nhúng vào <title>. Escape hai lần sẽ hiện ra `&amp;` trên giao diện.
 */
export function sanitizeText(input: string, maxLength: number): string {
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Chỉ dùng cho tiêu đề/mô tả — nội dung .sb3 do `validateAndNormalize` lo, với danh sách khác. */
function containsProfanity(text: string): boolean {
  const hay = text.toLowerCase();
  return PROFANITY_TEXT.some((w) => {
    const i = hay.indexOf(w);
    if (i === -1) return false;
    const before = i === 0 ? ' ' : hay[i - 1];
    const after = i + w.length >= hay.length ? ' ' : hay[i + w.length];
    return !/[a-z0-9à-ỹ]/.test(before) && !/[a-z0-9à-ỹ]/.test(after);
  });
}

export interface IngestInput {
  sb3: Buffer;
  title: string;
  description: string;
  childId: string;
  /** Slug tag do bé chọn. Slug lạ bị bỏ qua im lặng, không làm hỏng việc đăng. */
  tagSlugs?: string[];
}

export interface IngestResult {
  gameId: string;
  warnings: { code: string; message: string }[];
  /** Bao nhiêu file thật sự được ghi mới (0-3) — phần còn lại là dedupe. */
  bytesWritten: number;
}

/**
 * Luồng upload đầy đủ: validate -> đóng gói -> thumbnail -> lưu -> ghi DB.
 *
 * Thứ tự có chủ đích: mọi bước có thể từ chối đều chạy TRƯỚC khi ghi bất cứ thứ
 * gì xuống đĩa hay database, nên một lần upload bị từ chối không để lại rác.
 */
export async function ingestGame(input: IngestInput): Promise<IngestResult> {
  const title = sanitizeText(input.title, MAX_TITLE_LENGTH);
  const description = sanitizeText(input.description, MAX_DESCRIPTION_LENGTH);

  if (title.length < 2) {
    throw new Sb3Error('INVALID_TITLE', 'Hãy đặt tên cho game của bé nhé (ít nhất 2 ký tự).');
  }
  if (containsProfanity(title) || containsProfanity(description)) {
    throw new Sb3Error('PROFANITY', 'Tên hoặc mô tả game có từ ngữ không phù hợp.');
  }

  // Rate limit trước khi tốn CPU cho việc đóng gói.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.game.count({
    where: { childId: input.childId, createdAt: { gte: since } },
  });
  if (recent >= UPLOADS_PER_CHILD_PER_DAY) {
    throw new Sb3Error(
      'RATE_LIMITED',
      `Hôm nay bé đã đăng ${UPLOADS_PER_CHILD_PER_DAY} game rồi, mai quay lại nhé!`
    );
  }

  // 1. Kiểm tra + chuẩn hoá. Ném lỗi nếu có gì đáng ngờ.
  // Nội dung game dùng danh sách HẸP HƠN tiêu đề: xem lý do trong profanity.ts.
  const normalized = await validateAndNormalize(input.sb3, { profanity: PROFANITY_CONTENT });

  // 2. Đóng gói thành HTML standalone. Truyền project.json vào để dò phím mà
  //    game dùng, từ đó sinh đúng bộ nút cảm ứng cho điện thoại.
  const packaged = await packageToHtml(normalized.sb3, {
    title,
    projectJson: normalized.projectJson,
  });

  // 3. Thumbnail (không bao giờ ném lỗi).
  const entries = await readSb3Zip(normalized.sb3);
  const thumb = await renderThumbnail(entries, normalized.projectJson);
  const thumbSha = await sha256(thumb);

  // 4. Ghi đĩa. Nội dung trùng thì tự dedupe.
  const writes = await Promise.all([
    putObject('sb3', normalized.sha256, normalized.sb3),
    putObject('html', packaged.sha256, packaged.html),
    putObject('thumb', thumbSha, thumb),
  ]);

  // 5. Ghi DB.
  const game = await prisma.game.create({
    data: {
      childId: input.childId,
      title,
      description,
      titleSearch: buildTitleSearch(title, description),
      sb3Sha256: normalized.sha256,
      sb3Size: normalized.sb3.length,
      htmlSha256: packaged.sha256,
      thumbSha256: thumbSha,
      usesMusic: packaged.usesMusic,
      // Sb3Warning[] -> Prisma Json. Cấu trúc do ta kiểm soát nên cast là an toàn.
      warnings: normalized.warnings as unknown as Prisma.InputJsonValue,
    },
  });

  /*
   * Gắn tag SAU khi tạo game, và chỉ gắn những slug thật sự có trong bảng Tag.
   * Đối chiếu lại ở đây chứ không tin danh sách gửi lên, vì client sửa được.
   * Gắn trượt cũng không huỷ game — game đã đóng gói xong rồi, mất tag còn hơn
   * mất cả game.
   */
  const wanted = [...new Set(input.tagSlugs ?? [])].slice(0, MAX_TAGS_PER_GAME);
  if (wanted.length > 0) {
    const tags = await prisma.tag.findMany({
      where: { slug: { in: wanted } },
      select: { id: true },
    });
    if (tags.length > 0) {
      await prisma.gameTag.createMany({
        data: tags.map((tag) => ({ gameId: game.id, tagId: tag.id })),
        skipDuplicates: true,
      });
    }
  }

  return {
    gameId: game.id,
    warnings: normalized.warnings.map((w) => ({ code: w.code, message: w.message })),
    bytesWritten: writes.filter(Boolean).length,
  };
}

async function sha256(buf: Buffer): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(buf).digest('hex');
}
