import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  validateAndNormalize,
  packageToHtml,
  renderThumbnail,
  readSb3Zip,
  Sb3Error,
  type Sb3Warning,
} from '@kidogame/sb3';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { appOrigin, sendMail } from './mail';
import { rateKey, tooMany } from './rate-limit';
import { objectExists, objectUrl, putObject, storageRoot } from './storage';
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

/**
 * Bản xem thử còn dùng được trong bao lâu.
 *
 * Đủ để bé chơi thử vài lượt, quay sang Scratch sửa một chỗ nhỏ rồi quay lại. Không dài
 * hơn nhiều: `storage:prune` chỉ chừa file mới sửa trong `GIU_FILE_MOI_GIO`, và con số
 * đó phải lớn hơn hạn này, không thì file của một bản còn hạn bị dọn mất.
 */
export const HAN_XEM_THU_MS = 2 * 60 * 60 * 1000;

/** Số lần xem thử mỗi giờ cho một bé. Mỗi lần là một lượt đóng gói tốn CPU. */
export const XEM_THU_MOI_GIO = 30;

/**
 * Mọi thứ về một bản xem thử, ghi ra `storage/xem-thu/<mã>.json`.
 *
 * Nằm trên đĩa chứ không trong DB, và không cần ký: mã là 24 byte ngẫu nhiên, đọc
 * được file thì chắc chắn chính server đã ghi nó. Player chỉ phục vụ đúng bốn dạng
 * đường dẫn `sb3|html|thumb|runtime/<sha>`, nên thư mục này không lộ ra ngoài.
 *
 * Tên, mô tả, tag nằm TRONG bản xem thử: bấm Đăng là đăng đúng cái vừa thử. Muốn đổi
 * tên thì sửa rồi xem thử lại — HTML đã đóng gói mang sẵn tên game.
 */
interface BanXemThu {
  childId: string;
  title: string;
  description: string;
  tagSlugs: string[];
  sb3Sha256: string;
  sb3Size: number;
  htmlSha256: string;
  thumbSha256: string;
  runtimeSha256: string;
  usesMusic: boolean;
  warnings: Sb3Warning[];
  hetHan: number;
}

export interface KetQuaXemThu {
  maXemThu: string;
  title: string;
  htmlUrl: string;
  thumbUrl: string;
  hetHan: number;
  warnings: { code: string; message: string }[];
}

export interface IngestResult {
  gameId: string;
  warnings: { code: string; message: string }[];
}

const MA_XEM_THU = /^[A-Za-z0-9_-]{32}$/;

function thuMucXemThu(): string {
  return path.join(storageRoot(), 'xem-thu');
}

/** Mã sai dạng thì KHÔNG dựng đường dẫn — mã do client gửi lên, dựng thẳng là lỗ duyệt thư mục. */
function fileXemThu(ma: string): string | null {
  return MA_XEM_THU.test(ma) ? path.join(thuMucXemThu(), `${ma}.json`) : null;
}

async function chanDangQuaNhieu(childId: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.game.count({
    where: { childId, createdAt: { gte: since } },
  });
  if (recent >= UPLOADS_PER_CHILD_PER_DAY) {
    throw new Sb3Error(
      'RATE_LIMITED',
      `Hôm nay bé đã đăng ${UPLOADS_PER_CHILD_PER_DAY} game rồi, mai quay lại nhé!`
    );
  }
}

/**
 * Bước 1: kiểm tra -> đóng gói -> thumbnail -> ghi file -> ghi bản xem thử.
 *
 * KHÔNG tạo Game, KHÔNG gửi thư cho bố mẹ: chưa có gì công khai. File game nằm trên
 * đĩa để player chạy được bản thử; bé không đăng thì chúng thành rác và `storage:prune`
 * dọn sau khi quá `GIU_FILE_MOI_GIO`.
 *
 * Thứ tự có chủ đích: mọi bước có thể từ chối đều chạy TRƯỚC khi ghi bất cứ thứ gì.
 */
export async function taoBanXemThu(input: IngestInput): Promise<KetQuaXemThu> {
  const title = sanitizeText(input.title, MAX_TITLE_LENGTH);
  const description = sanitizeText(input.description, MAX_DESCRIPTION_LENGTH);

  if (title.length < 2) {
    throw new Sb3Error('INVALID_TITLE', 'Hãy đặt tên cho game của bé nhé (ít nhất 2 ký tự).');
  }
  if (containsProfanity(title) || containsProfanity(description)) {
    throw new Sb3Error('PROFANITY', 'Tên hoặc mô tả game có từ ngữ không phù hợp.');
  }

  // Rate limit trước khi tốn CPU cho việc đóng gói. Hết lượt đăng thì báo NGAY, đừng
  // để bé chơi thử xong mới biết không đăng được.
  await chanDangQuaNhieu(input.childId);
  if (tooMany(rateKey('xem-thu', input.childId), XEM_THU_MOI_GIO, 60 * 60 * 1000)) {
    throw new Sb3Error('RATE_LIMITED', 'Bé xem thử nhiều quá rồi, nghỉ một lát rồi thử lại nhé!');
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

  /*
   * 4. Ghi đĩa. Nội dung trùng thì tự dedupe.
   *
   * Runtime PHẢI ghi ở đây cùng lượt, dù nó gần như luôn đã có sẵn: HTML vừa đóng
   * gói đã mang đường dẫn tới nó, nên nếu file runtime chưa nằm trên đĩa thì game mở
   * ra là stage trắng — và chỉ đúng game ĐẦU TIÊN sau mỗi lần nâng packager mới gặp,
   * tức lỗi hiếm nhất và khó dựng lại nhất.
   */
  await Promise.all([
    putObject('sb3', normalized.sha256, normalized.sb3),
    putObject('html', packaged.sha256, packaged.html),
    putObject('thumb', thumbSha, thumb),
    putObject('runtime', packaged.runtime.sha256, packaged.runtime.js),
  ]);

  // 5. Ghi bản xem thử. Tag chỉ nhận slug có thật, đối chiếu ở đây chứ không tin client.
  const wanted = [...new Set(input.tagSlugs ?? [])].slice(0, MAX_TAGS_PER_GAME);
  const tagSlugs =
    wanted.length === 0
      ? []
      : (await prisma.tag.findMany({ where: { slug: { in: wanted } }, select: { slug: true } })).map(
          (t) => t.slug
        );

  const maXemThu = randomBytes(24).toString('base64url');
  const hetHan = Date.now() + HAN_XEM_THU_MS;
  const ban: BanXemThu = {
    childId: input.childId,
    title,
    description,
    tagSlugs,
    sb3Sha256: normalized.sha256,
    sb3Size: normalized.sb3.length,
    htmlSha256: packaged.sha256,
    thumbSha256: thumbSha,
    runtimeSha256: packaged.runtime.sha256,
    usesMusic: packaged.usesMusic,
    warnings: normalized.warnings,
    hetHan,
  };
  await fs.mkdir(thuMucXemThu(), { recursive: true });
  await fs.writeFile(fileXemThu(maXemThu)!, JSON.stringify(ban));

  return {
    maXemThu,
    title,
    htmlUrl: objectUrl('html', packaged.sha256),
    thumbUrl: objectUrl('thumb', thumbSha),
    hetHan,
    warnings: normalized.warnings.map((w) => ({ code: w.code, message: w.message })),
  };
}

/**
 * Bước 2: bé bấm "Đăng game" -> tạo Game từ đúng bản xem thử -> báo bố mẹ.
 *
 * Mọi lý do từ chối đều trả cùng thông điệp "hết hạn hoặc đã đăng" trừ khi nói rõ hơn
 * giúp được bé: mã của bé khác không được xác nhận là mã có tồn tại.
 */
export async function dangBanXemThu(maXemThu: string, childId: string): Promise<IngestResult> {
  const HET = new Sb3Error(
    'PREVIEW_EXPIRED',
    'Bản chơi thử này đã hết hạn hoặc đã được đăng rồi. Bấm "Xem thử game" lại nhé.'
  );
  const file = fileXemThu(maXemThu);
  if (!file) throw HET;

  /*
   * Giành bản xem thử bằng `rename` trước khi làm gì khác. `rename` là nguyên tử: hai
   * lần bấm Đăng gửi cùng lúc thì chỉ một lần đổi tên được, lần kia gặp ENOENT. Đọc
   * rồi mới xoá thì cả hai cùng đọc được và bé có hai game giống hệt nhau.
   */
  const dangGiu = `${file}.dang-${randomBytes(6).toString('hex')}`;
  try {
    await fs.rename(file, dangGiu);
  } catch {
    throw HET;
  }

  let xong = false;
  try {
    const ban = JSON.parse(await fs.readFile(dangGiu, 'utf8')) as BanXemThu;
    if (ban.childId !== childId || ban.hetHan < Date.now()) {
      // Của bé khác thì trả lại nguyên chỗ cũ; hết hạn thì bỏ luôn.
      if (ban.childId === childId) xong = true;
      throw HET;
    }

    await chanDangQuaNhieu(childId);

    // File có thể đã bị dọn (bản thử để quá lâu qua đêm). Tạo Game trỏ vào file không
    // còn thì trang game ra stage trắng — thà bắt bé xem thử lại.
    const conDu = await Promise.all([
      objectExists('sb3', ban.sb3Sha256),
      objectExists('html', ban.htmlSha256),
      objectExists('thumb', ban.thumbSha256),
      objectExists('runtime', ban.runtimeSha256),
    ]);
    if (conDu.includes(false)) {
      xong = true;
      throw HET;
    }

    const game = await prisma.game.create({
      data: {
        childId,
        title: ban.title,
        description: ban.description,
        titleSearch: buildTitleSearch(ban.title, ban.description),
        sb3Sha256: ban.sb3Sha256,
        sb3Size: ban.sb3Size,
        htmlSha256: ban.htmlSha256,
        thumbSha256: ban.thumbSha256,
        runtimeSha256: ban.runtimeSha256,
        usesMusic: ban.usesMusic,
        // Sb3Warning[] -> Prisma Json. Cấu trúc do ta kiểm soát nên cast là an toàn.
        warnings: ban.warnings as unknown as Prisma.InputJsonValue,
      },
    });
    xong = true;

    /*
     * Gắn tag SAU khi tạo game. Gắn trượt cũng không huỷ game — game đã đóng gói xong
     * rồi, mất tag còn hơn mất cả game.
     */
    if (ban.tagSlugs.length > 0) {
      const tags = await prisma.tag.findMany({
        where: { slug: { in: ban.tagSlugs } },
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
     * Báo cho bố mẹ. Gửi trượt KHÔNG được huỷ việc đăng game — game đã vào DB rồi; ném
     * lỗi ở đây chỉ khiến bé thấy "đăng thất bại" trong khi game vẫn nằm công khai trên
     * trang chủ. Trạng thái tệ nhất có thể.
     */
    try {
      await notifyParentOfNewGame(game.id);
    } catch (e) {
      console.error('[ingest] không gửi được mail báo phụ huynh:', e);
    }

    return {
      gameId: game.id,
      warnings: ban.warnings.map((w) => ({ code: w.code, message: w.message })),
    };
  } finally {
    /* Đăng xong, hoặc bản thử chắc chắn không dùng lại được: bỏ file. Còn lại (của bé
       khác, hết lượt đăng hôm nay, DB trục trặc) thì trả về chỗ cũ để còn thử lại. */
    if (xong) await fs.unlink(dangGiu).catch(() => {});
    else await fs.rename(dangGiu, file).catch(() => {});
  }
}

/**
 * Mail báo bố mẹ mỗi khi con đăng một game mới.
 *
 * Đây KHÔNG phải tính năng phụ. Cả sản phẩm chọn "public ngay, không duyệt trước",
 * và bù lại bằng hậu kiểm — mà con mắt đầu tiên của hậu kiểm chính là phụ huynh
 * biết con vừa đăng cái gì. Không có lá thư này thì lớp hậu kiểm chỉ còn lại người
 * lạ bấm nút báo cáo, tức là phải có người lạ nhìn thấy nội dung xấu trước đã.
 *
 * Nằm TRONG `dangBanXemThu` chứ không nằm ở route upload, cố ý: sau này có thêm đường
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
