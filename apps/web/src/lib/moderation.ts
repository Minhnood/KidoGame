import { createHash } from 'node:crypto';
import { AuthError } from './auth';
import { prisma } from './db';
import { isReportReason } from './report-reasons';
import { revokeAllSessions } from './session';

/**
 * Đủ bằng này báo cáo thì game tự ẩn, không chờ người lớn.
 *
 * Game ở KidoGame public NGAY khi đăng, không có hàng đợi duyệt trước — nên đây là
 * lớp hậu kiểm chạy tự động duy nhất. Ẩn chứ KHÔNG xoá: sai thì admin cho hiện lại
 * được, còn nội dung xấu thì mỗi phút nó còn hiển thị là một phút quá nhiều.
 */
export const REPORT_AUTO_HIDE_THRESHOLD = 3;

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
 * Ghi nhận một báo cáo, và tự ẩn game nếu đã đủ ngưỡng.
 *
 * Báo cáo trùng KHÔNG bị coi là lỗi: người báo vẫn thấy lời cảm ơn như thường.
 * Nói "bạn báo rồi" chẳng giúp được gì cho họ, mà lại tiết lộ rằng ai đó cùng IP
 * đã báo cáo game này.
 */
export async function reportGame(input: ReportGameInput): Promise<void> {
  if (!isReportReason(input.reason)) {
    throw new AuthError('Chọn một lý do trước khi gửi nhé.');
  }

  // Chỉ báo cáo được game đang hiện. Game đã ẩn/gỡ thì coi như không tồn tại,
  // giống hệt cách trang /game/[id] trả 404 — không xác nhận là nó có tồn tại.
  const game = await prisma.game.findFirst({
    where: { id: input.gameId, status: 'PUBLISHED' },
    select: { id: true },
  });
  if (!game) throw new AuthError('Không tìm thấy game này.');

  const key = reporterKey(input.actor, input.ip);

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
        data: { reportCount: { increment: 1 } },
        select: { reportCount: true, status: true },
      });

      if (updated.status === 'PUBLISHED' && updated.reportCount >= REPORT_AUTO_HIDE_THRESHOLD) {
        await tx.game.update({ where: { id: input.gameId }, data: { status: 'HIDDEN' } });
        await tx.moderationLog.create({
          data: {
            gameId: input.gameId,
            actorId: 'system',
            action: 'AUTO_HIDE',
            note: `Tự động ẩn khi đủ ${REPORT_AUTO_HIDE_THRESHOLD} báo cáo`,
          },
        });
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return; // đã báo cáo rồi — im lặng coi như thành công
    throw e;
  }
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
 * Phải đưa `reportCount` về 0 và đóng các báo cáo đang mở. Nếu không, số đếm vẫn
 * nằm trên ngưỡng nên chỉ cần thêm một báo cáo nữa là game bị ẩn lại ngay —
 * quyết định của admin sẽ bị lật mà không ai hiểu vì sao.
 */
export async function adminRestoreGame(adminId: string, gameId: string, note: string): Promise<void> {
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
  if (!game) throw new AuthError('Không tìm thấy game này.');

  await prisma.$transaction(async (tx) => {
    await tx.game.update({
      where: { id: gameId },
      data: { status: 'PUBLISHED', reportCount: 0 },
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
    await tx.game.update({ where: { id: gameId }, data: { reportCount: 0 } });
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
