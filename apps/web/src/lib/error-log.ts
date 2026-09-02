import { createHash } from 'node:crypto';
import { prisma } from './db';

/**
 * Tầng 2 của kế hoạch giám sát: lỗi ở máy người dùng thật đi vào DB của chính mình,
 * rồi admin xem trên `/admin/loi`. Không thư viện mới, không host mới, không lỗ CSP
 * (`connect-src 'self'` là đủ vì route nằm trên chính app), và không một byte nào
 * rời khỏi VPS. Xem `infra/GIAM-SAT.md` mục 4.
 *
 * ĐIỀU PHẢI CẨN THẬN, và nó là lý do file này dài hơn vẻ ngoài của việc: một cái
 * hộp nhận dữ liệu do người ngoài gửi, ghi thẳng vào DB, không cần đăng nhập. Bốn
 * chỗ phải chặn, mỗi chỗ đã có một đoạn giải thích riêng bên dưới:
 *
 *   1. dữ liệu cá nhân lọt vào theo đường query string hoặc user agent,
 *   2. một lỗi lặp trong vòng render bắn hàng nghìn báo cáo,
 *   3. ai đó bơm thông điệp ngẫu nhiên để đẻ ra vô hạn NHÓM lỗi,
 *   4. bảng lớn mãi không có ai dọn.
 */

const MAX_MESSAGE_LENGTH = 300;
const MAX_PATH_LENGTH = 200;
/** digest của Next là chuỗi hex ngắn. Trần rộng gấp mấy lần để không cắt oan. */
const MAX_DIGEST_LENGTH = 64;
const MAX_SOURCE_LENGTH = 16;

/**
 * Giữ 90 ngày. Một lỗi lần cuối xuất hiện ba tháng trước thì hoặc đã sửa, hoặc
 * không còn ai gặp — cả hai trường hợp đều không giúp gì cho việc hôm nay, mà vẫn
 * chiếm chỗ trong danh sách admin phải đọc.
 */
export const RETENTION_DAYS = 90;

/**
 * Trần số NHÓM chưa xử lý.
 *
 * Đây là chỗ chặn kiểu tấn công rẻ nhất vào bảng này: gom nhóm theo băm của thông
 * điệp nghĩa là mỗi thông điệp khác nhau là một dòng mới, nên chỉ cần POST thông
 * điệp ngẫu nhiên trong một vòng lặp là bảng phình vô hạn — và giới hạn theo IP
 * không cứu được, vì kẻ làm việc đó thường có nhiều hơn một IP.
 *
 * Chạm trần thì nhóm CŨ vẫn tiếp tục đếm, chỉ nhóm mới bị bỏ. Chọn hướng này chứ
 * không chọn "xoá nhóm cũ nhất để nhường chỗ": nếu xoá thì kẻ tấn công đẩy được
 * mọi lỗi thật ra khỏi bảng, tức biến cơ chế giám sát thành cơ chế xoá dấu vết.
 */
export const MAX_UNRESOLVED_GROUPS = 500;

/** Trần báo cáo nhận từ một người trong một phút. */
const RATE_LIMIT_PER_MINUTE = 30;

/**
 * Bộ đếm chống lụt, để TRONG BỘ NHỚ chứ không trong DB.
 *
 * Có chủ ý: mục đích của nó là tránh một truy vấn DB cho mỗi beacon, nên nếu chính
 * nó cần một truy vấn DB thì nó vô nghĩa. Đánh đổi: đếm theo từng tiến trình Node,
 * nên chạy nhiều tiến trình thì trần thực tế là bội số của con số trên. Chấp nhận
 * được — đây là cái van chống lụt, không phải hạn mức phải chính xác.
 *
 * Mất khi restart, cũng không sao vì cửa sổ chỉ dài một phút.
 */
const buckets = new Map<string, { minute: number; count: number }>();
/** Trần số khoá giữ trong bộ nhớ, để bản thân bộ đếm không thành chỗ rò bộ nhớ. */
const MAX_BUCKETS = 5000;

/**
 * `true` nghĩa là người này đã vượt trần trong phút hiện tại.
 *
 * `key` nên là băm của IP, KHÔNG phải IP thô — hàm này không tự băm để chỗ gọi
 * quyết định được băm theo cái gì.
 */
export function overRateLimit(key: string): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  const hit = buckets.get(key);

  if (!hit || hit.minute !== minute) {
    /*
     * Dọn cả bảng khi quá đông, chứ không dọn từng khoá hết hạn: mọi bản ghi ở đây
     * hết giá trị sau một phút, nên xoá sạch chỉ làm mất trần của đúng một phút
     * đang chạy. Rẻ hơn hẳn việc quét cả Map để tìm khoá cũ.
     */
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    buckets.set(key, { minute, count: 1 });
    return false;
  }

  hit.count += 1;
  return hit.count > RATE_LIMIT_PER_MINUTE;
}

/** Băm một chuỗi để làm khoá đếm. Không lưu đâu cả, chỉ sống trong bộ nhớ. */
export function rateKeyOf(ip: string | null): string {
  return createHash('sha256').update(`loi:${ip ?? 'khong-ro'}`).digest('hex');
}

/**
 * Rút user agent thành tên trình duyệt + số hiệu chính, ví dụ `Chrome 130`.
 *
 * Giữ nguyên cả chuỗi UA thì lưu được thứ dùng để lần ra một người (UA đầy đủ là
 * một phần của dấu vân tay trình duyệt). Bỏ hẳn thì mất một thông tin chẩn đoán
 * thật sự hữu ích: "lỗi này chỉ xảy ra trên Safari" là câu trả lời cho phần lớn
 * lỗi giao diện. Rút xuống hai chữ là chỗ ở giữa — số giá trị khác nhau ít nên nó
 * không định danh được ai.
 *
 * Thứ tự so khớp là bắt buộc: Edge và Opera đều tự nhận là Chrome trong UA của
 * mình, và Chrome cũng tự nhận là Safari. Đảo thứ tự thì mọi thứ thành "Safari".
 */
export function browserTag(userAgent: string | null): string {
  if (!userAgent) return '';

  const rules: [RegExp, string][] = [
    [/Edg\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+).*Safari/, 'Safari'],
  ];

  for (const [re, name] of rules) {
    const m = re.exec(userAgent);
    if (m) return `${name} ${m[1]}`;
  }
  return 'khác';
}

/**
 * Cắt query string và hash khỏi đường dẫn.
 *
 * Không phải cho gọn: link xác minh email và link đặt lại mật khẩu đều mang token
 * trong query string. Một bảng lỗi giữ token là một bảng phải bảo vệ như bảng mật
 * khẩu, mà cả trang admin đọc được nó.
 */
export function sanitizePath(raw: unknown): string {
  if (typeof raw !== 'string') return 'khong-ro';
  const cut = raw.split(/[?#]/)[0];
  // eslint-disable-next-line no-control-regex
  const clean = cut.replace(/[\x00-\x1f\x7f\s]/g, '').slice(0, MAX_PATH_LENGTH);
  return clean.startsWith('/') ? clean : 'khong-ro';
}

/** Bỏ ký tự điều khiển, gộp khoảng trắng, cắt độ dài. */
function oneLine(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') return '';
  return (
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength)
  );
}

export interface RecordErrorInput {
  /** `boundary`, `global`, hoặc `server`. */
  source: unknown;
  path: unknown;
  digest?: unknown;
  message?: unknown;
  /** User agent thô. Được rút gọn ngay trong hàm này, KHÔNG lưu nguyên. */
  userAgent?: string | null;
}

export type RecordErrorResult = 'moi' | 'lap-lai' | 'day-bang';

/**
 * Ghi một lỗi. Trùng nhóm thì tăng `count`, không đẻ dòng mới.
 *
 * KHÔNG BAO GIỜ NÉM. Chỗ gọi hàm này là một error boundary hoặc một route nhận
 * beacon: ném ở đây là biến một lỗi thành hai, và cái thứ hai không có ai bắt.
 */
export async function recordError(input: RecordErrorInput): Promise<RecordErrorResult> {
  const source = oneLine(input.source, MAX_SOURCE_LENGTH) || 'khong-ro';
  const path = sanitizePath(input.path);
  const digest = oneLine(input.digest, MAX_DIGEST_LENGTH);
  const message = oneLine(input.message, MAX_MESSAGE_LENGTH);
  const browser = browserTag(input.userAgent ?? null);

  /*
   * `browser` KHÔNG nằm trong băm gom nhóm, cố ý.
   *
   * Nếu có thì cùng một lỗi sẽ tách thành một dòng cho mỗi phiên bản trình duyệt,
   * và mỗi lần Chrome tự cập nhật là một nhóm mới — danh sách admin đầy bản sao
   * của cùng một việc. Đánh đổi: cột `browser` giữ trình duyệt của người GẶP ĐẦU
   * TIÊN, không phải của người gần nhất.
   */
  const fingerprint = createHash('sha256')
    .update([source, path, digest, message].join(' '))
    .digest('hex')
    .slice(0, 32);

  try {
    /*
     * `updateMany` chứ không `update`: `update` NÉM khi where không khớp, và Prisma
     * in lỗi ra stderr TRƯỚC khi `.catch` của mình nuốt được — đúng cái bẫy đã làm
     * mọi lần đăng nhập thành công in ra một khối `prisma:error`. Ở đây không khớp
     * là đường đi bình thường: lần đầu thấy lỗi này.
     *
     * Cũng KHÔNG dùng `upsert`: upsert luôn thử create khi thiếu, tức là nó bỏ qua
     * được trần MAX_UNRESOLVED_GROUPS bên dưới.
     */
    const bumped = await prisma.errorLog.updateMany({
      where: { fingerprint },
      data: { count: { increment: 1 }, lastSeenAt: new Date() },
    });
    if (bumped.count > 0) return 'lap-lai';

    const unresolved = await prisma.errorLog.count({ where: { resolvedAt: null } });
    if (unresolved >= MAX_UNRESOLVED_GROUPS) return 'day-bang';

    /*
     * Dọn bản ghi quá hạn Ở ĐÂY, trên đường tạo nhóm mới — không phải mỗi lần ghi.
     *
     * Đường đi phổ biến nhất là "lỗi cũ lặp lại", và đường đó chỉ nên tốn đúng một
     * truy vấn. Tạo nhóm mới là chuyện hiếm, nên gắn việc dọn vào đó thì bảng vẫn
     * được dọn thường xuyên mà không cần cron, cũng không đánh thuế lên đường nóng.
     */
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await prisma.errorLog.deleteMany({ where: { lastSeenAt: { lt: cutoff } } });

    await prisma.errorLog.create({
      data: { fingerprint, source, path, digest, message, browser },
    });
    return 'moi';
  } catch {
    /*
     * Hai request cùng lúc mang cùng một lỗi mới thì một cái đụng ràng buộc unique.
     * Không đáng để lại dấu vết gì: nhóm đã tồn tại, chỉ mất đúng một lượt đếm.
     */
    return 'lap-lai';
  }
}

/**
 * Đánh dấu một nhóm đã xử lý, hoặc mở lại.
 *
 * `updateMany` vì cùng một lý do như trên: id không còn (đã bị dọn theo hạn giữ, hoặc
 * admin khác vừa bấm) là chuyện bình thường, không phải chuyện đáng ném.
 */
export async function setErrorResolved(id: string, resolved: boolean): Promise<void> {
  await prisma.errorLog.updateMany({
    where: { id },
    data: { resolvedAt: resolved ? new Date() : null },
  });
}

/**
 * Đánh dấu đã xử lý MỌI nhóm đang mở.
 *
 * Có nút này vì cách dùng thật của trang: sau khi sửa xong một đợt, cái admin muốn
 * là "dọn sạch bảng rồi xem từ đây có gì mới" — làm việc đó bằng cách bấm từng dòng
 * trong năm chục dòng thì không ai bấm, và một danh sách không bao giờ được dọn thì
 * lỗi mới lẫn vào lỗi cũ, tức mất luôn giá trị của cả trang.
 */
export async function resolveAllErrors(): Promise<number> {
  const { count } = await prisma.errorLog.updateMany({
    where: { resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
  return count;
}
