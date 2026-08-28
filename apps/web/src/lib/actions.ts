'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  AuthError,
  createChild,
  loginChild,
  loginParent,
  registerParent,
  resetChildPassword,
  setChildLocked,
} from './auth';
import {
  requestEmailVerification,
  requestPasswordReset,
  resetPasswordWithToken,
} from './account';
import {
  adminDismissReports,
  adminRemoveGame,
  adminRestoreGame,
  adminSetChildLocked,
  communityStatus,
  reportGame,
} from './moderation';
import { adminResolveTakedown, gameDangBiKhieuNai, submitTakedownRequest } from './takedown';
import { clientFingerprint, destroySession, getActor } from './session';
import { prisma } from './db';

/** Kết quả trả về form. `null` nghĩa là chưa submit lần nào. */
export type FormState = { error: string } | { ok: true } | null;

/** IP của client, lấy từ header proxy đặt vào. Null khi không xác định được. */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

async function fingerprint(): Promise<string> {
  const h = await headers();
  return clientFingerprint(await clientIp(), h.get('user-agent'));
}

/**
 * Bọc một action để lỗi AuthError thành thông báo hiện trên form, còn lỗi lạ thì
 * log ở server và trả về câu chung — không bao giờ đẩy stack trace ra client.
 *
 * `redirect()` của Next hoạt động bằng cách ném exception, nên phải để nó bay
 * qua chứ không được bắt.
 */
async function run(fn: () => Promise<void>): Promise<FormState> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    if (e && typeof e === 'object' && 'digest' in e && String(e.digest).startsWith('NEXT_')) {
      throw e;
    }
    console.error('[action] lỗi không lường trước:', e);
    return { error: 'Có lỗi xảy ra, thử lại sau nhé.' };
  }
}

// --- Đăng ký / đăng nhập -----------------------------------------------------

export async function registerParentAction(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  const state = await run(async () => {
    const parentId = await registerParent(
      String(form.get('email') ?? ''),
      String(form.get('password') ?? '')
    );
    /*
     * Mail xác minh gửi trượt KHÔNG được làm hỏng việc đăng ký. Tài khoản đã tạo
     * xong và phiên đã mở; bắt người dùng đăng ký lại chỉ vì nhà cung cấp mail
     * đang lỗi là vô lý. Họ bấm "gửi lại" ở trang quản lý là được.
     */
    try {
      await requestEmailVerification(parentId);
    } catch (e) {
      console.error('[action] không gửi được mail xác minh lúc đăng ký:', e);
    }
  });
  if (state && 'ok' in state) redirect('/phu-huynh');
  return state;
}

// --- Xác minh email / quên mật khẩu ------------------------------------------

export async function resendVerificationAction(
  _prev: FormState,
  _form: FormData
): Promise<FormState> {
  const state = await run(async () => {
    const parentId = await requireParent();
    await requestEmailVerification(parentId);
  });
  revalidatePath('/phu-huynh');
  return state;
}

/**
 * Luôn trả về `ok`, kể cả khi email không có tài khoản nào.
 *
 * Phân biệt hai trường hợp là biến form này thành công cụ dò xem ai đã đăng ký.
 * `requestPasswordReset` cũng tự nuốt lỗi gửi mail vì đúng lý do đó.
 */
export async function requestPasswordResetAction(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  return run(async () => {
    await requestPasswordReset(String(form.get('email') ?? ''));
  });
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const state = await run(async () => {
    await resetPasswordWithToken(
      String(form.get('token') ?? ''),
      String(form.get('password') ?? '')
    );
  });
  // Đổi mật khẩu đã thu hồi hết phiên, nên chắc chắn đang ở trạng thái chưa đăng nhập.
  if (state && 'ok' in state) redirect('/dang-nhap?dat-lai=xong');
  return state;
}

export async function loginParentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const state = await run(async () => {
    await loginParent(
      String(form.get('email') ?? ''),
      String(form.get('password') ?? ''),
      await fingerprint()
    );
  });
  if (state && 'ok' in state) redirect('/phu-huynh');
  return state;
}

export async function loginChildAction(_prev: FormState, form: FormData): Promise<FormState> {
  const state = await run(async () => {
    await loginChild(
      String(form.get('username') ?? ''),
      String(form.get('password') ?? ''),
      await fingerprint()
    );
  });
  if (state && 'ok' in state) redirect('/');
  return state;
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/');
}

// --- Phụ huynh quản lý tài khoản con ----------------------------------------

/** Bảo đảm người gọi là phụ huynh. Trẻ không được gọi các action dưới đây. */
async function requireParent(): Promise<string> {
  const actor = await getActor();
  if (!actor || actor.kind !== 'parent') {
    throw new AuthError('Cần đăng nhập bằng tài khoản phụ huynh.');
  }
  return actor.id;
}

export async function createChildAction(_prev: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const parentId = await requireParent();
    const birthYearRaw = String(form.get('birthYear') ?? '').trim();
    await createChild({
      parentId,
      username: String(form.get('username') ?? ''),
      displayName: String(form.get('displayName') ?? ''),
      password: String(form.get('password') ?? ''),
      birthYear: birthYearRaw ? Number(birthYearRaw) : null,
    });
  });
}

export async function resetChildPasswordAction(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  return run(async () => {
    const parentId = await requireParent();
    await resetChildPassword(
      parentId,
      String(form.get('childId') ?? ''),
      String(form.get('password') ?? '')
    );
  });
}

export async function setChildLockedAction(_prev: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const parentId = await requireParent();
    await setChildLocked(
      parentId,
      String(form.get('childId') ?? ''),
      String(form.get('locked')) === 'true'
    );
  });
}

/**
 * Phụ huynh ẩn game của con.
 *
 * Đây là lớp bảo vệ hậu kiểm quan trọng nhất, vì game được public ngay khi đăng:
 * phụ huynh phải gỡ được ngay mà không cần chờ admin.
 */
export async function setGameHiddenAction(_prev: FormState, form: FormData): Promise<FormState> {
  const state = await run(async () => {
    const parentId = await requireParent();
    const gameId = String(form.get('gameId') ?? '');
    const hidden = String(form.get('hidden')) === 'true';

    // Chỉ cho phép tác động lên game của con MÌNH.
    const game = await prisma.game.findFirst({
      where: { id: gameId, child: { parentId } },
      select: { id: true, status: true, trustedReportCount: true },
    });
    if (!game) throw new AuthError('Không tìm thấy game này.');

    /*
     * Game admin đã GỠ HẲN thì phụ huynh không được bật lại.
     *
     * Trước đây không có chỗ kiểm này, nên `hidden=false` set thẳng PUBLISHED và một
     * game bị admin gỡ vì nội dung xấu chỉ cách việc trở lại trang chủ đúng một cú
     * bấm của phụ huynh — mà chính phụ huynh cũng thường không biết vì sao nó bị gỡ.
     * Đó là toàn bộ lý do REMOVED tồn tại tách khỏi HIDDEN.
     */
    if (game.status === 'REMOVED') {
      throw new AuthError(
        'Game này đã bị đội kiểm duyệt gỡ, bạn không tự bật lại được. Hãy liên hệ với chúng tôi nếu bạn cho rằng đây là nhầm lẫn.'
      );
    }

    /*
     * Game đang có yêu cầu gỡ bản quyền CHƯA xử lý thì cũng không bật lại được.
     *
     * Đây là lỗ đã dựng lại được bằng luồng thật: khiếu nại ẩn game xong, phụ huynh
     * bấm "Hiện lại" một cái là nó công khai trở lại, không lỗi gì. Trong khi
     * `/dieu-khoan` hứa với người khiếu nại là ẩn ngay và trả lời trong hạn.
     *
     * Cố ý KHÔNG nói ai khiếu nại và vì lý do gì — người khiếu nại để lại danh tính
     * cho đội kiểm duyệt, không phải cho phụ huynh. Cần đối chất thì admin đứng giữa.
     */
    if (!hidden && (await gameDangBiKhieuNai([gameId])).has(gameId)) {
      throw new AuthError(
        'Game này đang tạm ẩn vì có yêu cầu gỡ bản quyền chờ xử lý. Đội kiểm duyệt sẽ xem lại và trả lời; bạn chưa bật lại được lúc này.'
      );
    }

    /*
     * Ẩn thì luôn được — đây là lớp bảo vệ mạnh nhất của phụ huynh, không đặt điều
     * kiện gì.
     *
     * Nhưng HIỆN LẠI thì chỉ hiện tới mức mà cộng đồng đang cho phép. Nếu không,
     * mọi cơ chế đếm báo cáo đều vô nghĩa: game bị siết vì đủ báo cáo, phụ huynh bấm
     * "hiện" một cái là về PUBLISHED, và có thể bấm lại mãi. Việc siết là để chờ
     * người kiểm duyệt xem, không phải để thương lượng với chủ game.
     */
    const status = hidden ? 'HIDDEN' : communityStatus(game.trustedReportCount);

    await prisma.game.update({ where: { id: gameId }, data: { status } });
    await prisma.moderationLog.create({
      data: {
        gameId,
        actorId: parentId,
        action: hidden ? 'PARENT_HIDE' : 'PARENT_UNHIDE',
        note: 'Phụ huynh thao tác từ trang quản lý',
      },
    });
  });
  revalidatePath('/phu-huynh');
  return state;
}

// --- Báo cáo game ------------------------------------------------------------

/**
 * Ai cũng báo cáo được, kể cả khách chưa đăng nhập.
 *
 * Cố ý không bắt đăng nhập: người phát hiện nội dung xấu thường là người tình cờ
 * đi ngang qua. Bắt họ đăng ký tài khoản trước khi báo cáo thì phần lớn sẽ bỏ đi,
 * và nội dung xấu cứ nằm đó.
 */
export async function reportGameAction(_prev: FormState, form: FormData): Promise<FormState> {
  const gameId = String(form.get('gameId') ?? '');
  return run(async () => {
    const actor = await getActor();
    await reportGame({
      gameId,
      reason: String(form.get('reason') ?? ''),
      actor: actor ? { kind: actor.kind, id: actor.id } : null,
      ip: await clientIp(),
    });
  });
  /*
   * CỐ Ý không revalidate trang game ở đây.
   *
   * Nếu báo cáo này là cái thứ 3, game vừa bị ẩn — dựng lại trang sẽ khiến chính
   * người vừa bấm báo cáo bị ném sang trang 404 thay vì thấy lời cảm ơn, trông
   * y như ứng dụng vừa hỏng. Game vẫn ẩn ngay tức khắc với mọi người khác vì
   * trang /game/[id] là `force-dynamic`, mỗi lượt truy cập đều đọc lại status.
   */
}

// --- Gỡ nội dung vi phạm bản quyền -------------------------------------------

/**
 * Người ngoài gửi yêu cầu gỡ. KHÔNG cần đăng nhập, và đó là điều kiện tiên quyết:
 * người làm ra bản gốc gần như chắc chắn không có tài khoản trên KidoGame, nên bắt
 * đăng ký trước khi khiếu nại là dựng đúng bức tường trước đúng người cần đi qua.
 */
export async function submitTakedownAction(_prev: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    await submitTakedownRequest({
      gameRef: String(form.get('gameRef') ?? ''),
      claimantName: String(form.get('claimantName') ?? ''),
      claimantEmail: String(form.get('claimantEmail') ?? ''),
      evidence: String(form.get('evidence') ?? ''),
      // Checkbox không được tick thì FormData KHÔNG có khoá này chứ không phải có
      // với giá trị rỗng — nên phải hỏi "có mặt hay không", đừng so với 'true'.
      attested: form.get('attest') !== null,
      ip: await clientIp(),
    });
  });
}

// --- Admin -------------------------------------------------------------------

/** Bảo đảm người gọi là phụ huynh CÓ cờ isAdmin. */
async function requireAdmin(): Promise<string> {
  const actor = await getActor();
  if (!actor || actor.kind !== 'parent' || !actor.isAdmin) {
    throw new AuthError('Bạn không có quyền vào khu vực này.');
  }
  return actor.id;
}

export async function adminRemoveGameAction(_prev: FormState, form: FormData): Promise<FormState> {
  const state = await run(async () => {
    const adminId = await requireAdmin();
    await adminRemoveGame(adminId, String(form.get('gameId') ?? ''), 'Admin gỡ từ trang kiểm duyệt');
  });
  revalidatePath('/admin');
  return state;
}

export async function adminRestoreGameAction(_prev: FormState, form: FormData): Promise<FormState> {
  const state = await run(async () => {
    const adminId = await requireAdmin();
    const gameId = String(form.get('gameId') ?? '');

    /*
     * Admin CŨNG không bật lại được game đang có khiếu nại bản quyền chờ xử lý.
     *
     * Đây đúng là lỗ đã vá cho phụ huynh ở phía trên trong cùng ngày — và đường
     * admin bị bỏ sót. Vá một nửa, sót nửa kia, lần thứ ba trong dự án này (lần
     * đầu ở luồng báo cáo, lần hai ở luồng phụ huynh).
     *
     * Hệ quả thứ hai giống hệt và vẫn tệ như vậy: `adminResolveTakedown` tính
     * "đã cho hiện lại chưa" bằng `updateMany` có điều kiện `status: 'HIDDEN'`.
     * Game đã bị bật lại thì điều kiện không khớp, `restored` = false, và người
     * khiếu nại nhận thư nói "game vẫn đang ẩn" trong khi nó đang công khai —
     * tức mình nói sai với họ, bằng văn bản, mà không ai phát hiện được.
     *
     * Với admin thì việc ĐÚNG không phải là bấm "Cho hiện lại", mà là vào hàng
     * đợi bản quyền bác khiếu nại — `adminResolveTakedown` tự cho hiện lại và tự
     * gửi thư cho cả hai phía. Nên thông báo chỉ đường sang đấy.
     */
    if ((await gameDangBiKhieuNai([gameId])).has(gameId)) {
      throw new AuthError(
        'Game này đang có yêu cầu gỡ bản quyền chờ xử lý. Hãy xử lý ở hàng đợi bản quyền — bác khiếu nại sẽ tự cho hiện lại và gửi thư cho cả hai phía.'
      );
    }

    await adminRestoreGame(adminId, gameId, 'Admin xác nhận không sao, cho hiện lại');
  });
  revalidatePath('/admin');
  return state;
}

export async function adminDismissReportsAction(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  const state = await run(async () => {
    const adminId = await requireAdmin();
    await adminDismissReports(
      adminId,
      String(form.get('gameId') ?? ''),
      'Admin xác nhận báo cáo không đúng'
    );
  });
  revalidatePath('/admin');
  return state;
}

/**
 * Admin phán xử một yêu cầu gỡ bản quyền.
 *
 * `revalidatePath('/admin')` là bắt buộc ở đây chứ không tuỳ chọn: hàng yêu cầu vừa
 * xử lý phải biến khỏi hàng đợi ngay. Còn đọng lại thì admin dễ bấm lần hai, và lần
 * hai sẽ báo lỗi "đã xử lý rồi" — trông như hệ thống hỏng.
 */
export async function adminResolveTakedownAction(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  const state = await run(async () => {
    const adminId = await requireAdmin();
    await adminResolveTakedown(
      adminId,
      String(form.get('requestId') ?? ''),
      String(form.get('accept')) === 'true',
      String(form.get('note') ?? '').trim()
    );
  });
  revalidatePath('/admin');
  return state;
}

export async function adminSetChildLockedAction(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  const state = await run(async () => {
    const adminId = await requireAdmin();
    const locked = String(form.get('locked')) === 'true';
    await adminSetChildLocked(
      adminId,
      String(form.get('childId') ?? ''),
      locked,
      locked ? 'Admin khoá tài khoản từ trang kiểm duyệt' : 'Admin mở khoá tài khoản'
    );
  });
  revalidatePath('/admin');
  return state;
}
