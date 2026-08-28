import {
  validateAndNormalize,
  packageToHtml,
  renderThumbnail,
  readSb3Zip,
  Sb3Error,
} from '@kidogame/sb3';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { appOrigin, sendMail } from './mail';
import { putObject } from './storage';
import { PROFANITY_CONTENT, PROFANITY_TEXT } from './profanity';
import { buildTitleSearch } from './search';
import { sanitizeText } from './text';

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
 * Có xuất hiện `w` như một TỪ RIÊNG trong `hay` không.
 *
 * Phải quét HẾT mọi lần xuất hiện, không chỉ lần đầu.
 *
 * Bản trước dùng đúng một `indexOf`: gặp lần đầu mà lần đó nằm trong một từ khác
 * thì trả về false luôn, và những lần sau không bao giờ được xét. Hệ quả là chỉ
 * cần một từ vô hại chứa chuỗi đó là VÔ HIỆU HOÁ cả từ ấy trong toàn bộ câu —
 * `"Soccer cc game"` và `"Admin oi dm may"` đều lọt, trong khi `"cc"` và `"dm"`
 * đứng một mình thì bị chặn.
 *
 * Đây là lớp lọc nội dung cho trẻ em, nên "gần đúng" không đủ.
 */
function coTuRieng(hay: string, w: string): boolean {
  const laKyTuTu = /[a-z0-9à-ỹ]/;
  for (let i = hay.indexOf(w); i !== -1; i = hay.indexOf(w, i + 1)) {
    const before = i === 0 ? ' ' : hay[i - 1];
    const after = i + w.length >= hay.length ? ' ' : hay[i + w.length];
    if (!laKyTuTu.test(before) && !laKyTuTu.test(after)) return true;
  }
  return false;
}

/** Chỉ dùng cho tiêu đề/mô tả — nội dung .sb3 do `validateAndNormalize` lo, với danh sách khác. */
function containsProfanity(text: string): boolean {
  const hay = text.toLowerCase();
  return PROFANITY_TEXT.some((w) => coTuRieng(hay, w));
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

  /*
   * Báo cho bố mẹ. Gửi trượt KHÔNG được huỷ việc đăng game — game đã đóng gói,
   * đã ghi đĩa, đã vào DB rồi; ném lỗi ở đây chỉ khiến bé thấy "đăng thất bại"
   * trong khi game vẫn nằm công khai trên trang chủ. Trạng thái tệ nhất có thể.
   */
  try {
    await notifyParentOfNewGame(game.id);
  } catch (e) {
    console.error('[ingest] không gửi được mail báo phụ huynh:', e);
  }

  return {
    gameId: game.id,
    warnings: normalized.warnings.map((w) => ({ code: w.code, message: w.message })),
    bytesWritten: writes.filter(Boolean).length,
  };
}

/**
 * Mail báo bố mẹ mỗi khi con đăng một game mới.
 *
 * Đây KHÔNG phải tính năng phụ. Cả sản phẩm chọn "public ngay, không duyệt trước",
 * và bù lại bằng hậu kiểm — mà con mắt đầu tiên của hậu kiểm chính là phụ huynh
 * biết con vừa đăng cái gì. Không có lá thư này thì lớp hậu kiểm chỉ còn lại người
 * lạ bấm nút báo cáo, tức là phải có người lạ nhìn thấy nội dung xấu trước đã.
 *
 * Nằm TRONG `ingestGame` chứ không nằm ở route upload, cố ý: sau này có thêm đường
 * đăng game nào khác (import hàng loạt, API cho lớp học) thì nó vẫn tự chạy theo.
 * Đặt ở tầng route là để quên.
 *
 * Gửi cho MỌI game mới, kể cả khi bé đăng mười cái một ngày. Gộp lại thành một thư
 * cuối ngày thì tiết kiệm hòm thư nhưng làm hỏng đúng thứ cần: biết SỚM.
 */
async function notifyParentOfNewGame(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      title: true,
      description: true,
      child: { select: { displayName: true, parent: { select: { email: true } } } },
    },
  });
  if (!game) return;

  const origin = appOrigin();
  await sendMail({
    to: game.child.parent.email,
    subject: `Bé ${game.child.displayName} vừa đăng game "${game.title}"`,
    text: [
      'Chào bạn,',
      '',
      `Bé ${game.child.displayName} vừa đăng một game mới lên KidoGame:`,
      '',
      `  ${game.title}`,
      ...(game.description ? [`  ${game.description}`] : []),
      `  ${origin}/game/${game.id}`,
      '',
      'Game đã hiện công khai ngay. KidoGame không duyệt trước, nên lá thư này là',
      'cách để bạn biết và xem lại.',
      '',
      'Nếu có gì chưa ổn, bạn ẩn game của con bất cứ lúc nào ở trang quản lý —',
      'không cần chờ ai duyệt:',
      '',
      `  ${origin}/phu-huynh`,
      '',
      `Điều khoản và cách chúng tôi xử lý nội dung: ${origin}/dieu-khoan`,
    ].join('\n'),
  });
}

async function sha256(buf: Buffer): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(buf).digest('hex');
}
