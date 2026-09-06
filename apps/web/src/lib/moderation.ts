import { createHash, randomUUID } from 'node:crypto';
import { AuthError } from './auth';
import { prisma } from './db';
import { appOrigin, sendMail } from './mail';
import { objectUrl } from './storage';
import { isReportReason } from './report-reasons';
import { revokeAllSessions } from './session';

/**
 * Đủ bằng này báo cáo ĐÁNG TIN thì game bị ẩn mềm, không chờ người lớn.
 *
 * Game ở KidoGame public NGAY khi đăng, không có hàng đợi duyệt trước — nên đây là
 * lớp hậu kiểm chạy tự động duy nhất.
 *
 * "Đáng tin" = của phụ huynh đã xác minh email. Xem `Game.trustedReportCount` trong
 * schema để biết vì sao không đếm mọi báo cáo.
 */
export const REPORT_AUTO_HIDE_THRESHOLD = 3;

/**
 * Đủ bằng này thì ẩn HẲN, không còn chơi được bằng link trực tiếp.
 *
 * Gấp đôi ngưỡng trên, cố ý không phải một số rời: câu hỏi cần trả lời là "bao nhiêu
 * thì không còn là chuyện ba người bàn nhau nữa", và bội số nói lên điều đó rõ hơn
 * một hằng số tự chọn. Kẻ tấn công muốn xoá hẳn một game phải trả gấp đôi giá, mà
 * đổi lại chỉ đạt được ẩn mềm ở mức nửa đường.
 */
export const REPORT_HARD_HIDE_THRESHOLD = REPORT_AUTO_HIDE_THRESHOLD * 2;

/**
 * Game đã gỡ hẳn còn được giữ bao nhiêu NGÀY trước khi xoá khỏi DB và khỏi đĩa.
 *
 * Bảy ngày là quyết định sản phẩm, không phải một hằng số kỹ thuật: đây là cửa sổ
 * để sửa một quyết định sai. Sau nó thì hàng trong DB, file `.sb3` của bé, HTML đã
 * đóng gói và ảnh bìa đều đi hẳn — nút "Cho hiện lại" trong khu quản trị không còn
 * gì để hiện lại.
 *
 * BA HỆ QUẢ đã cân, đừng đổi con số này mà không đọc lại cả ba:
 *
 * 1. File `.sb3` GỐC của đứa trẻ cũng bị xoá. Đó là công nó tự làm, nên `adminRemoveGame`
 *    gửi phụ huynh một lá thư kèm link tải về NGAY LÚC GỠ — con số này là số ngày họ
 *    có để lấy file. Rút nó xuống là rút ngắn đúng cửa sổ đó, và lá thư sẽ tự nói ra
 *    con số mới mà không ai phải sửa chữ.
 * 2. Bảng `TakedownRequest` PHẢI sống sót, vì nó là hồ sơ pháp lý — nên khoá ngoại
 *    của nó là `SetNull` kèm cột `gameTitle` chụp sẵn. Xem schema.
 * 3. `BACKUP_KEEP` mặc định là 7 BẢN, và hai con số này gặp nhau: game gỡ ngày 0 bị
 *    xoá ngày 7, bản sao lưu cuối cùng còn chứa nó là bản ngày 7 (sao lưu chạy giờ
 *    `BACKUP_HOUR`=3, dọn chạy `PRUNE_HOUR`=4, nên bản sao lưu hôm đó vẫn còn game),
 *    và bản ấy bị xoay vòng khoảng ngày 14. Tức cửa sổ cứu thật là ~14 ngày, nhưng
 *    nửa sau đòi phải phục hồi từ sao lưu chứ không bấm một cái nút.
 */
/*
 * `||` chứ KHÔNG phải `??`, và đây là chỗ đã sai một lần.
 *
 * `docker-compose.yml` khai `REMOVED_KEEP_DAYS: ${REMOVED_KEEP_DAYS:-}`, tức khi
 * không đặt gì thì container nhận CHUỖI RỖNG, không phải undefined. `??` chỉ đỡ
 * undefined, nên `Number('')` ra 0 — và 0 là giá trị mà script dọn TỪ CHỐI chạy.
 * Hệ quả: service dọn khởi động bình thường rồi mỗi ngày in một dòng "hạn giữ không
 * hợp lệ (0)" và không xoá gì, tức cả cơ chế đứng im ở đúng cấu hình MẶC ĐỊNH.
 *
 * `||` không làm hỏng chốt an toàn: chuỗi `'0'` vẫn là truthy nên nó đi qua và thành
 * số 0, và script vẫn từ chối như thiết kế. Chỉ chuỗi rỗng mới rơi về mặc định.
 */
export const NGAY_GIU_GAME_DA_GO = Number(process.env.REMOVED_KEEP_DAYS || 7);

/**
 * Hạn xoá hẳn của một game đã gỡ, hoặc null nếu game chưa bị gỡ.
 *
 * Hai chữ ký chứ không phải một: chỗ đọc `game.removedAt` từ DB thì phải xử lý null
 * (cột này null với mọi game chưa gỡ, và với cả game đã gỡ TRƯỚC khi có cột), còn
 * chỗ vừa tự tạo mốc gỡ thì cầm chắc một Date. Không tách thì hai lá thư báo gỡ phải
 * viết `han ? ... : ''` cho một nhánh không bao giờ chạy — và một nhánh không bao
 * giờ chạy trong thư gửi người thật là chỗ để lọt một lá thư trống ngày.
 */
/**
 * Nhãn tiếng Việt cho `ModerationLog.action`.
 *
 * Ở LIB chứ không ở trang, vì đã có HAI trang cùng đọc bảng vết này (`/admin` và
 * `/admin/tong-quan`). Hai bản sao của cùng một từ điển thì sớm muộn lệch nhau, và
 * lệch ở đây nghĩa là cùng một dòng lịch sử đọc ra hai chuyện khác nhau tuỳ người
 * trực đang mở tab nào — điều tệ nhất có thể xảy ra với một sổ ghi việc đã làm.
 *
 * Mã lạ trả về nguyên mã: một action thêm sau mà quên khai ở đây vẫn hiện ra được,
 * thô nhưng đọc được, chứ không thành một ô trống.
 */
export const ACTION_LABEL: Record<string, string> = {
  AUTO_LIMIT: 'Hệ thống tự ẩn khỏi danh sách (đủ ngưỡng báo cáo)',
  AUTO_HIDE: 'Hệ thống tự ẩn (đủ ngưỡng báo cáo)',
  PARENT_HIDE: 'Phụ huynh ẩn game',
  PARENT_UNHIDE: 'Phụ huynh cho hiện lại',
  ADMIN_REMOVE: 'Admin gỡ hẳn',
  ADMIN_RESTORE: 'Admin cho hiện lại',
  ADMIN_DISMISS_REPORTS: 'Admin bỏ qua báo cáo',
  ADMIN_LOCK_CHILD: 'Admin khoá tài khoản của bé',
  ADMIN_UNLOCK_CHILD: 'Admin mở khoá tài khoản của bé',
  TAKEDOWN_HIDE: 'Tạm ẩn vì có yêu cầu gỡ bản quyền',
  TAKEDOWN_ACCEPT: 'Admin chấp nhận yêu cầu gỡ bản quyền',
  TAKEDOWN_REJECT: 'Admin bác bỏ yêu cầu gỡ bản quyền',
  /* Dòng vết DUY NHẤT không kèm được game hay bé: cả hai đã bị xoá cùng lúc với nó
     được ghi ra. Nhãn phải tự đứng một mình mà vẫn đọc được — xem `xoa-gia-dinh.ts`. */
  ADMIN_DELETE_FAMILY: 'Admin xoá tài khoản cả gia đình',
  PARENT_DELETE: 'Phụ huynh xoá hẳn game',
};

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

export function hanXoaHan(removedAt: Date): Date;
export function hanXoaHan(removedAt: Date | null): Date | null;
export function hanXoaHan(removedAt: Date | null): Date | null {
  if (!removedAt) return null;
  return new Date(removedAt.getTime() + NGAY_GIU_GAME_DA_GO * 86400_000);
}

/**
 * Trạng thái mà CỘNG ĐỒNG đang áp cho game, tính thuần từ số báo cáo đáng tin.
 *
 * Một hàm duy nhất cho mọi chỗ cần trả lời "bỏ lệnh ẩn thì game về đâu": phụ huynh
 * bấm hiện lại, admin bác một khiếu nại bản quyền, hay báo cáo mới đẩy mức lên. Nếu
 * mỗi chỗ tự tính thì sớm muộn có chỗ trả về PUBLISHED cho một game đang có sáu báo
 * cáo — và cái lỗ đó sẽ không ai thấy, vì nó chỉ hiện ra khi hai luồng gặp nhau.
 *
 * KHÔNG bao gồm REMOVED: gỡ hẳn là phán quyết của người, không phải kết quả đếm.
 */
export function communityStatus(trustedReportCount: number): 'PUBLISHED' | 'LIMITED' | 'HIDDEN' {
  if (trustedReportCount >= REPORT_HARD_HIDE_THRESHOLD) return 'HIDDEN';
  if (trustedReportCount >= REPORT_AUTO_HIDE_THRESHOLD) return 'LIMITED';
  return 'PUBLISHED';
}

/**
 * Khoá chống báo cáo trùng, lưu vào cột `Report.reporterIpHash`.
 *
 * Ai đăng nhập rồi thì khoá theo DANH TÍNH, chỉ khách vãng lai mới khoá theo IP.
 * Lý do giống hệt chỗ chống dò mật khẩu trong `auth.ts`: cả một lớp học hay cả một
 * nhà thường đi chung một IP, khoá theo IP nghĩa là cả lớp chỉ báo cáo được một lần.
 *
 * Vì vậy cột này KHÔNG còn thuần là hash của IP như tên gọi — đọc dữ liệu thô thì
 * đừng giả định nó luôn là IP.
 */
function reporterKey(
  actor: { kind: 'parent' | 'child'; id: string } | null,
  ip: string | null
): string {
  if (actor) return createHash('sha256').update(`${actor.kind}:${actor.id}`).digest('hex');

  /*
   * Khách vãng lai mà KHÔNG biết IP thì sinh khoá ngẫu nhiên, không dùng hằng số.
   *
   * Bản trước ghi `ip:${ip ?? 'khong-ro'}`: thiếu IP là mọi khách hash về CÙNG MỘT
   * giá trị, rồi `@@unique([gameId, reporterIpHash])` coi từ người thứ hai trở đi
   * là báo cáo trùng và ÂM THẦM BỎ. Nghĩa là một game chỉ nhận được đúng một báo
   * cáo của khách, mãi mãi, và không có lỗi nào để ai nhìn thấy.
   *
   * Khi nào xảy ra: khi không có `x-forwarded-for`. Ở production thì Caddy luôn
   * đặt header đó (đã ghi đè trong Caddyfile), nhưng ở dev, ở LAN, hay nếu sau này
   * có ai đổi cách vào thì là mất trắng lớp báo cáo của khách.
   *
   * Đánh đổi cố ý: mất chống trùng cho đúng nhóm này. Chấp nhận được, vì báo cáo
   * của khách KHÔNG tính vào ngưỡng tự ẩn (`reportCountsTowardThreshold` đòi phụ
   * huynh đã xác minh email) — nó chỉ đưa game vào hàng đợi admin. Mất chống trùng
   * là thêm việc cho admin; bỏ báo cáo là mất hẳn một con mắt.
   */
  const raw = ip ? `ip:${ip}` : `khong-ro:${randomUUID()}`;
  return createHash('sha256').update(raw).digest('hex');
}

/** Prisma ném lỗi này khi đụng ràng buộc unique — ở đây là báo cáo trùng. */
function isUniqueViolation(e: unknown): boolean {
  return Boolean(e && typeof e === 'object' && 'code' in e && e.code === 'P2002');
}

export interface ReportGameInput {
  gameId: string;
  reason: string;
  actor: { kind: 'parent' | 'child'; id: string } | null;
  ip: string | null;
}

/**
 * Báo cáo này có được tính vào ngưỡng tự động hay không.
 *
 * Chỉ phụ huynh ĐÃ XÁC MINH EMAIL. Trẻ và khách vãng lai vẫn báo cáo được và vẫn
 * hiện trên trang admin — chúng chỉ không tự kích hoạt việc thay đổi trạng thái.
 *
 * Đọc lại từ DB chứ không tin cờ nào trong session: phiên có thể đã mở từ trước lúc
 * xác minh, và một cờ cũ nằm trong cookie mà quyết định được việc ẩn game của người
 * khác là thứ không nên tồn tại.
 */
async function reportCountsTowardThreshold(
  actor: { kind: 'parent' | 'child'; id: string } | null
): Promise<boolean> {
  if (actor?.kind !== 'parent') return false;
  const parent = await prisma.parent.findUnique({
    where: { id: actor.id },
    select: { emailVerifiedAt: true },
  });
  return Boolean(parent?.emailVerifiedAt);
}

/** Thứ tự nghiêm khắc dần. Dùng để không bao giờ NỚI trạng thái bằng một báo cáo. */
const MUC_DO: Record<string, number> = { PUBLISHED: 0, LIMITED: 1, HIDDEN: 2, REMOVED: 3 };

/**
 * Ghi nhận một báo cáo, và siết trạng thái game nếu đã đủ ngưỡng.
 *
 * Báo cáo trùng KHÔNG bị coi là lỗi: người báo vẫn thấy lời cảm ơn như thường.
 * Nói "bạn báo rồi" chẳng giúp được gì cho họ, mà lại tiết lộ rằng ai đó cùng IP
 * đã báo cáo game này.
 */
export async function reportGame(input: ReportGameInput): Promise<void> {
  if (!isReportReason(input.reason)) {
    throw new AuthError('Chọn một lý do trước khi gửi nhé.');
  }

  /*
   * Báo cáo được cả game đang bị ẩn mềm, cố ý: chính những game đó là những game
   * cần thêm tín hiệu nhất. Chặn ở đây thì mức LIMITED thành một cái sàn không bao
   * giờ leo lên HIDDEN được, và ngưỡng gấp đôi trở thành chữ chết.
   *
   * Còn HIDDEN/REMOVED thì coi như không tồn tại, giống hệt cách /game/[id] trả 404.
   */
  const game = await prisma.game.findFirst({
    where: { id: input.gameId, status: { in: ['PUBLISHED', 'LIMITED'] } },
    select: { id: true },
  });
  if (!game) throw new AuthError('Không tìm thấy game này.');

  const key = reporterKey(input.actor, input.ip);
  const trusted = await reportCountsTowardThreshold(input.actor);

  /** Mức mới, chỉ khác null khi báo cáo này thật sự làm trạng thái đổi. */
  let dbiSiet: 'LIMITED' | 'HIDDEN' | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.report.create({
        data: {
          gameId: input.gameId,
          reporterParentId: input.actor?.kind === 'parent' ? input.actor.id : null,
          reporterIpHash: key,
          reason: input.reason,
        },
      });

      // Đếm bằng `increment` trong transaction chứ không đọc-rồi-ghi: hai người
      // báo cáo cùng lúc mà đọc-rồi-ghi thì một lượt sẽ bị nuốt mất.
      const updated = await tx.game.update({
        where: { id: input.gameId },
        data: {
          reportCount: { increment: 1 },
          ...(trusted ? { trustedReportCount: { increment: 1 } } : {}),
        },
        select: { trustedReportCount: true, status: true },
      });

      const muon = communityStatus(updated.trustedReportCount);

      /*
       * CHỈ siết, không bao giờ nới. Nếu phụ huynh đã tự ẩn game (HIDDEN) thì một
       * báo cáo mới không được phép hạ xuống LIMITED — tức là bật một game đang bị
       * ẩn cho chơi lại, bằng chính hành động tố cáo nó.
       *
       * Loại PUBLISHED ra tường minh: nó không bao giờ nghiêm khắc hơn trạng thái
       * hiện tại nên nhánh này chỉ để nói với cả người đọc lẫn TypeScript rằng từ
       * đây trở xuống `muon` chỉ có thể là LIMITED hoặc HIDDEN.
       */
      if (muon === 'PUBLISHED' || MUC_DO[muon] <= MUC_DO[updated.status]) return;

      await tx.game.update({ where: { id: input.gameId }, data: { status: muon } });
      await tx.moderationLog.create({
        data: {
          gameId: input.gameId,
          actorId: 'system',
          action: muon === 'HIDDEN' ? 'AUTO_HIDE' : 'AUTO_LIMIT',
          note:
            muon === 'HIDDEN'
              ? `Tự động ẩn hẳn khi đủ ${REPORT_HARD_HIDE_THRESHOLD} báo cáo đã xác minh`
              : `Tự động ẩn khỏi danh sách khi đủ ${REPORT_AUTO_HIDE_THRESHOLD} báo cáo đã xác minh`,
        },
      });
      dbiSiet = muon;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return; // đã báo cáo rồi — im lặng coi như thành công
    throw e;
  }

  /*
   * Mail nằm NGOÀI transaction và không được phép làm việc báo cáo thất bại: báo
   * cáo đã ghi, trạng thái đã siết, ném lỗi ở đây chỉ khiến người báo thấy "gửi
   * không được" rồi bấm lại — mà bấm lại thì đụng ràng buộc trùng và im lặng.
   *
   * Cùng lý do với `notifyParentOfNewGame` trong ingest.ts.
   */
  if (dbiSiet) {
    try {
      await notifyParentOfModeration(input.gameId, dbiSiet);
    } catch (e) {
      console.error('[moderation] không gửi được mail báo phụ huynh:', e);
    }
  }
}

/**
 * Mail báo phụ huynh khi game của con bị hệ thống siết vì báo cáo.
 *
 * Bắt buộc phải có, không phải phép lịch sự: đây là lần duy nhất một game đổi
 * trạng thái mà KHÔNG có người nào quyết định. Không gửi thư thì phụ huynh chỉ phát
 * hiện khi con hỏi "sao game của con không thấy trên trang chủ nữa", và người phải
 * đi tìm câu trả lời là đứa trẻ.
 *
 * Cố ý KHÔNG nói ai đã báo cáo và báo vì lý do gì. Lý do là dữ liệu cho admin phán
 * xử; đưa cho phụ huynh thì mở đường cho việc đoán xem đứa nào trong lớp đã bấm nút.
 */
async function notifyParentOfModeration(gameId: string, muc: 'LIMITED' | 'HIDDEN'): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      title: true,
      child: { select: { displayName: true, parent: { select: { email: true } } } },
    },
  });
  if (!game) return;

  const origin = appOrigin();
  const anMem = muc === 'LIMITED';

  await sendMail({
    to: game.child.parent.email,
    subject: anMem
      ? `Game "${game.title}" của bé ${game.child.displayName} tạm không hiện trên trang chủ`
      : `Game "${game.title}" của bé ${game.child.displayName} đã bị ẩn`,
    text: [
      'Chào bạn,',
      '',
      `Game "${game.title}" của bé ${game.child.displayName} vừa nhận đủ số báo cáo để`,
      anMem
        ? 'hệ thống tạm rút khỏi trang chủ và phần tìm kiếm.'
        : 'hệ thống ẩn hoàn toàn.',
      '',
      anMem
        ? 'Game VẪN CHƠI ĐƯỢC bằng link trực tiếp, nên những người bé đã gửi link cho vẫn vào được:'
        : 'Game không còn xem được nữa, kể cả bằng link trực tiếp:',
      `  ${origin}/game/${game.id}`,
      '',
      'Việc này do hệ thống tự làm khi đủ ngưỡng, chưa có người nào xem nội dung.',
      'Đội kiểm duyệt sẽ xem lại. Nếu là báo cáo sai, game sẽ được cho hiện lại.',
      '',
      'Bạn cũng có thể tự ẩn game của con bất cứ lúc nào ở trang quản lý:',
      `  ${origin}/phu-huynh`,
      '',
      'KidoGame',
    ].join('\n'),
  });
}

// --- Thao tác của admin ------------------------------------------------------

/**
 * Ngày tháng cho thư gửi phụ huynh, dạng ngày/tháng/năm.
 *
 * Giờ của MÁY CHỦ, nên container `web` phải khai `TZ=Asia/Ho_Chi_Minh` như hai
 * service `backup` và `prune` — không thì nó chạy UTC và mọi mốc rơi sau 17:00 giờ
 * ta bị lùi một ngày. Ở một lá thư nói "sau ngày này thì mất hẳn", lệch một ngày
 * không phải chuyện hiển thị.
 */
export function ngayVi(d: Date): string {
  return d.toLocaleDateString('vi-VN');
}

/** Gỡ hẳn game khỏi trang. Khác `HIDDEN` ở chỗ phụ huynh không tự bật lại được. */
export async function adminRemoveGame(adminId: string, gameId: string, note: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    /*
     * Đọc cả tên game, tên bé, mail phụ huynh và `sb3Sha256` ngay ở đây, TRƯỚC
     * transaction: sau khi gỡ thì mấy thứ này vẫn còn, nhưng lấy một lần rồi dùng
     * cho cả thư thì không phải mở thêm một truy vấn ở đường nóng của admin.
     */
    select: {
      id: true,
      title: true,
      sb3Sha256: true,
      child: { select: { displayName: true, parent: { select: { email: true } } } },
    },
  });
  if (!game) throw new AuthError('Không tìm thấy game này.');

  /* Một mốc thời gian duy nhất cho cả hàng DB lẫn lá thư. Gọi `new Date()` hai lần
     thì hạn in trong thư và hạn job dọn đọc ra là hai thời điểm khác nhau — lệch vài
     mili giây thì vô hại, nhưng nó là loại lệch không ai đi kiểm. */
  const goLuc = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.game.update({
      where: { id: gameId },
      data: { status: 'REMOVED', removedAt: goLuc },
    });
    await tx.report.updateMany({
      where: { gameId, status: 'OPEN' },
      data: { status: 'RESOLVED' },
    });
    await tx.moderationLog.create({
      data: { gameId, actorId: adminId, action: 'ADMIN_REMOVE', note },
    });
  });

  /*
   * THƯ BÁO PHỤ HUYNH, KÈM LINK TẢI FILE GỐC.
   *
   * Trước khi có nó, đường này im hoàn toàn: admin gỡ game, bảy ngày sau job dọn xoá
   * cả `.sb3` gốc của bé, và không ai được báo lấy một lần. Cái mất không phải là
   * game trên trang — cái đó là quyết định có chủ ý — mà là bản gốc của một đứa trẻ,
   * thứ chúng tôi nhận vào và hứa giữ. Bảy ngày là đủ để tải về, nhưng chỉ với người
   * BIẾT là mình còn bảy ngày.
   *
   * Link trỏ thẳng player origin và không cần đăng nhập, đúng như nút "Tải file .sb3
   * gốc" trên trang game và đúng như `/dieu-khoan` đã nói công khai. Nó KHÔNG mở
   * thêm quyền gì: file vẫn nằm ở đúng URL theo hash mà nó vẫn nằm, thư chỉ nói cho
   * người sở hữu biết địa chỉ đó trước khi nó biến mất.
   *
   * NGOÀI transaction và nuốt lỗi: việc gỡ đã xong và đã ghi vết. Mail trượt là
   * chậm, còn ném lỗi ở đây thì server action báo đỏ cho admin về một việc đã làm
   * xong — và admin sẽ bấm lại.
   */
  await sendMail({
    to: game.child.parent.email,
    subject: `Game "${game.title}" của bé ${game.child.displayName} đã bị gỡ khỏi KidoGame`,
    text: [
      'Chào bạn,',
      '',
      `Đội kiểm duyệt đã xem và gỡ game "${game.title}" của bé ${game.child.displayName}`,
      'khỏi KidoGame. Game không còn xem được nữa, kể cả bằng link trực tiếp.',
      '',
      `FILE GỐC CỦA BÉ SẼ BỊ XOÁ HẲN NGÀY ${ngayVi(hanXoaHan(goLuc))}.`,
      `Chúng tôi giữ lại ${NGAY_GIU_GAME_DA_GO} ngày để bạn kịp lấy. Sau ngày đó thì không lấy lại được.`,
      '',
      'Nếu bé chưa giữ bản .sb3 trên máy, tải lại tại đây trước ngày trên:',
      `  ${objectUrl('sb3', game.sb3Sha256)}`,
      '',
      'File tải về mang tên là một chuỗi dài — đó là mã nội dung của chính file. Đổi tên',
      'lại cho dễ nhớ rồi mở bằng Scratch như bình thường, nội dung không đổi.',
      '',
      'Nếu bạn cho rằng đây là nhầm lẫn, trả lời thư này giúp chúng tôi.',
      '',
      'KidoGame',
    ].join('\n'),
  }).catch((e) => console.error('[moderation] không gửi được thư báo gỡ game:', e));
}

/**
 * Phụ huynh tự xoá hẳn một game của con mình.
 *
 * VÌ SAO CẦN, và đây là một lỗ hổng quyền riêng tư thật chứ không phải tiện tay: nút
 * "Ẩn game" KHÔNG thu hồi nội dung. Player origin phục vụ thuần theo hash và không
 * tra database — đo được: trang `/game/<id>` của một game đã gỡ trả 404, còn file HTML
 * và `.sb3` của chính nó vẫn trả 200, không cần đăng nhập, `cache-control: immutable`.
 * Với `HIDDEN` thì tình trạng đó là VĨNH VIỄN, vì `storage:prune` chỉ xoá file mồ côi
 * và game đang ẩn vẫn trỏ tới file nên file không bao giờ thành mồ côi.
 *
 * Lý do thường nhất để một phụ huynh bấm ẩn là game để lộ gì đó về con họ. Trước hàm
 * này, thao tác duy nhất họ làm được không hề lấy nội dung ấy khỏi mạng, và không có
 * đường nào khác — trang phụ huynh và `/dieu-khoan` cũng không nói ra điều đó.
 *
 * DÙNG LẠI ĐÚNG CƠ CHẾ CỦA `adminRemoveGame`: `REMOVED` + `removedAt`, rồi job dọn
 * hằng đêm xoá thật hàng DB và file sau `NGAY_GIU_GAME_DA_GO` ngày. Không thêm trạng
 * thái thứ năm, và không xoá file tại chỗ: storage địa chỉ hoá theo nội dung nên hai
 * game cùng hash dùng chung một file, xoá theo hash là xoá mất bản gốc của game khác.
 *
 * Phụ huynh KHÔNG tự bật lại được, giống hệt game bị admin gỡ — `setGameHiddenAction`
 * đã chặn `REMOVED` từ trước. Đó là đánh đổi có chủ ý: cái đổi lấy là file thật sự
 * biến mất, và một hành động có hệ quả ấy phải nặng hơn một cú bấm bật/tắt.
 */
export async function parentRemoveGame(parentId: string, gameId: string): Promise<void> {
  const game = await prisma.game.findFirst({
    where: { id: gameId, child: { parentId } },
    select: {
      id: true,
      title: true,
      status: true,
      sb3Sha256: true,
      child: { select: { displayName: true, parent: { select: { email: true } } } },
    },
  });
  if (!game) throw new AuthError('Không tìm thấy game này.');

  if (game.status === 'REMOVED') {
    throw new AuthError('Game này đã được gỡ khỏi trang rồi.');
  }

  /*
   * Phép kiểm "đang có khiếu nại bản quyền chờ xử lý" nằm ở SERVER ACTION, không ở
   * đây, và đó là chuyện kỹ thuật chứ không phải chọn lựa: `gameDangBiKhieuNai` ở
   * `takedown.ts`, mà `takedown.ts` đã import file này — gọi ngược lại là một vòng
   * import. `setGameHiddenAction` kiểm cùng điều kiện ở cùng tầng, nên hai đường của
   * phụ huynh vẫn nhất quán với nhau.
   */

  /* Một mốc thời gian duy nhất cho cả hàng DB lẫn lá thư — cùng lý do đã ghi ở
     `adminRemoveGame`: gọi `new Date()` hai lần là hai thời điểm khác nhau trong hai
     chỗ nói về cùng một cái hạn, và đó là loại lệch không ai đi kiểm. */
  const goLuc = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.game.update({
      where: { id: gameId },
      data: { status: 'REMOVED', removedAt: goLuc },
    });
    /* Đóng báo cáo đang mở: game không còn trên trang thì một hàng đợi "cần xem" trỏ
       vào nó chỉ làm người trực mở ra rồi thấy 404. */
    await tx.report.updateMany({
      where: { gameId, status: 'OPEN' },
      data: { status: 'RESOLVED' },
    });
    await tx.moderationLog.create({
      data: {
        gameId,
        actorId: parentId,
        action: 'PARENT_DELETE',
        note: 'Phụ huynh tự xoá từ trang quản lý',
      },
    });
  });

  /*
   * Thư kèm link tải, gửi NGOÀI transaction và nuốt lỗi — cùng khuôn `adminRemoveGame`.
   *
   * Vẫn gửi dù chính họ vừa bấm: thứ lá thư này mang không phải tin "đã xoá" mà là
   * NGÀY file gốc biến mất và địa chỉ tải nó về trước ngày đó. Một phụ huynh xoá game
   * vì nó để lộ gì đó về con mình vẫn có thể muốn giữ bản gốc công của con.
   */
  await sendMail({
    to: game.child.parent.email,
    subject: `Đã xoá game "${game.title}" của bé ${game.child.displayName}`,
    text: [
      'Chào bạn,',
      '',
      `Bạn vừa xoá game "${game.title}" của bé ${game.child.displayName} khỏi KidoGame.`,
      'Game không còn xem được nữa, kể cả bằng link trực tiếp.',
      '',
      `FILE GỐC CỦA BÉ SẼ BỊ XOÁ HẲN NGÀY ${ngayVi(hanXoaHan(goLuc))}.`,
      `Chúng tôi giữ lại ${NGAY_GIU_GAME_DA_GO} ngày để bạn kịp lấy. Sau ngày đó thì không lấy lại được,`,
      'và bản đã đóng gói cũng không còn ai tải được nữa.',
      '',
      'Nếu bé chưa giữ bản .sb3 trên máy, tải lại tại đây trước ngày trên:',
      `  ${objectUrl('sb3', game.sb3Sha256)}`,
      '',
      'File tải về mang tên là một chuỗi dài — đó là mã nội dung của chính file. Đổi tên',
      'lại cho dễ nhớ rồi mở bằng Scratch như bình thường, nội dung không đổi.',
      '',
      'Bạn không tự bật lại game này được. Nếu bấm nhầm, trả lời thư này trước ngày trên',
      'thì chúng tôi còn kịp giúp.',
      '',
      'KidoGame',
    ].join('\n'),
  }).catch((e) => console.error('[moderation] không gửi được thư báo phụ huynh xoá game:', e));
}

/**
 * Admin xác nhận game không sao và cho hiện lại.
 *
 * Phải đưa CẢ HAI bộ đếm về 0 và đóng các báo cáo đang mở. Nếu không, số đếm vẫn
 * nằm trên ngưỡng nên chỉ cần thêm một báo cáo nữa là game bị ẩn lại ngay —
 * quyết định của admin sẽ bị lật mà không ai hiểu vì sao.
 *
 * `trustedReportCount` đặc biệt quan trọng: nó chính là đầu vào của
 * `communityStatus`, nên bỏ sót nó thì mọi luồng "bỏ lệnh ẩn" sau này (phụ huynh
 * bấm hiện lại, admin bác một khiếu nại bản quyền) sẽ tính ra LIMITED và lặng lẽ
 * kéo game trở lại chỗ admin vừa gỡ nó ra.
 */
export async function adminRestoreGame(adminId: string, gameId: string, note: string): Promise<void> {
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
  if (!game) throw new AuthError('Không tìm thấy game này.');

  await prisma.$transaction(async (tx) => {
    await tx.game.update({
      where: { id: gameId },
      /* `removedAt: null` là bắt buộc, không phải dọn cho sạch: để nguyên thì game
         vừa được cho hiện lại vẫn mang hạn xoá cũ, và job dọn sẽ xoá nó vài ngày
         sau trong lúc nó đang chạy bình thường trên trang chủ. */
      data: { status: 'PUBLISHED', reportCount: 0, trustedReportCount: 0, removedAt: null },
    });
    await tx.report.updateMany({
      where: { gameId, status: 'OPEN' },
      data: { status: 'DISMISSED' },
    });
    await tx.moderationLog.create({
      data: { gameId, actorId: adminId, action: 'ADMIN_RESTORE', note },
    });
  });
}

/**
 * Bác bỏ báo cáo mà GIỮ NGUYÊN trạng thái game.
 *
 * Khác `adminRestoreGame` ở chỗ không đụng tới `status`. Cần riêng một hàm vì game
 * còn đang hiện mà dính 1-2 báo cáo sai thì admin phải dọn được số đếm; nếu không,
 * lựa chọn duy nhất còn lại là gỡ hẳn game vô tội, hoặc để số đếm nằm đó chờ báo cáo
 * thứ ba đẩy nó qua ngưỡng.
 */
export async function adminDismissReports(
  adminId: string,
  gameId: string,
  note: string
): Promise<void> {
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
  if (!game) throw new AuthError('Không tìm thấy game này.');

  await prisma.$transaction(async (tx) => {
    /*
     * Xoá cả `trustedReportCount`: đã bác báo cáo thì bác luôn phần đếm được của
     * chúng, không thì game giữ nguyên tín hiệu cộng đồng cũ và chỉ cần một báo cáo
     * nữa là qua ngưỡng — đúng cái mà việc bác bỏ vừa nói là không đáng.
     *
     * Vẫn KHÔNG đụng `status`, theo đúng mô tả trên. Với game đã bị siết thì thao tác
     * đúng là "cho hiện lại" (`adminRestoreGame`), và trang /admin cũng chỉ hiện nút
     * bác bỏ cho game còn đang hiện — nên không có đường nào dẫn tới trạng thái lửng.
     */
    await tx.game.update({
      where: { id: gameId },
      data: { reportCount: 0, trustedReportCount: 0 },
    });
    await tx.report.updateMany({
      where: { gameId, status: 'OPEN' },
      data: { status: 'DISMISSED' },
    });
    await tx.moderationLog.create({
      data: { gameId, actorId: adminId, action: 'ADMIN_DISMISS_REPORTS', note },
    });
  });
}

/**
 * Admin khoá/mở khoá tài khoản của một bé bất kỳ.
 *
 * Phụ huynh cũng làm được việc này cho con mình (`setChildLocked` trong `auth.ts`),
 * nhưng admin cần làm được cho bé KHÔNG phải con mình — bé tái phạm mà chờ đúng phụ
 * huynh của bé đó xử lý thì có thể chờ mãi.
 *
 * Thu hồi phiên ngay, cùng lý do với chỗ phụ huynh khoá: khoá mà phiên đang mở vẫn
 * dùng được thì việc khoá gần như vô nghĩa cho tới khi bé tự đăng xuất.
 *
 * CÓ ghi `ModerationLog` với `childId` thay cho `gameId`. Đây là thao tác nặng nhất
 * admin làm được — nó chặn một đứa trẻ đăng nhập, và người bị ảnh hưởng không phải
 * người gây ra chuyện. Không có vết thì phụ huynh hỏi "sao con tôi không vào được"
 * mà không ai trả lời nổi là ai khoá, lúc nào, vì sao.
 *
 * CHỈ log thao tác của ADMIN, không log khi phụ huynh khoá con mình
 * (`setChildLocked` trong auth.ts). Đó là quyền của bố mẹ trong gia đình, không
 * phải hành vi kiểm duyệt, và ghi nó vào cùng một bảng làm loãng đúng thứ mà bảng
 * này tồn tại để trả lời: người ngoài đã làm gì với tài khoản của con tôi.
 */
export async function adminSetChildLocked(
  adminId: string,
  childId: string,
  locked: boolean,
  note: string
): Promise<void> {
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { id: true } });
  if (!child) throw new AuthError('Không tìm thấy tài khoản của bé.');

  await prisma.$transaction(async (tx) => {
    await tx.child.update({ where: { id: childId }, data: { isLocked: locked } });
    await tx.moderationLog.create({
      data: {
        childId,
        actorId: adminId,
        action: locked ? 'ADMIN_LOCK_CHILD' : 'ADMIN_UNLOCK_CHILD',
        note,
      },
    });
  });

  // Ngoài transaction: thu hồi phiên là việc chỉ nên làm sau khi việc khoá đã
  // chắc chắn được ghi. Ngược lại thì transaction rollback mà phiên đã mất rồi.
  if (locked) await revokeAllSessions({ childId });
}
