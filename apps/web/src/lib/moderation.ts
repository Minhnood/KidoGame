import { createHash } from 'node:crypto';
import { AuthError } from './auth';
import { prisma } from './db';
import { appOrigin, sendMail } from './mail';
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
  const raw = actor ? `${actor.kind}:${actor.id}` : `ip:${ip ?? 'khong-ro'}`;
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

/** Gỡ hẳn game khỏi trang. Khác `HIDDEN` ở chỗ phụ huynh không tự bật lại được. */
export async function adminRemoveGame(adminId: string, gameId: string, note: string): Promise<void> {
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
  if (!game) throw new AuthError('Không tìm thấy game này.');

  await prisma.$transaction(async (tx) => {
    await tx.game.update({ where: { id: gameId }, data: { status: 'REMOVED' } });
    await tx.report.updateMany({
      where: { gameId, status: 'OPEN' },
      data: { status: 'RESOLVED' },
    });
    await tx.moderationLog.create({
      data: { gameId, actorId: adminId, action: 'ADMIN_REMOVE', note },
    });
  });
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
      data: { status: 'PUBLISHED', reportCount: 0, trustedReportCount: 0 },
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
