'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  AuthError,
  createChild,
  loginChild,
  loginAdmin,
  loginParent,
  registerParent,
  REGISTRATIONS_PER_IP_PER_HOUR,
  resetChildPassword,
  setChildLocked,
} from './auth';
import {
  guiThuEmailDaCoTaiKhoan,
  requestEmailVerification,
  requestPasswordReset,
  resetPasswordWithToken,
} from './account';
import { ScryptBusyError, scryptLoad } from './password';
import {
  adminDismissReports,
  adminRemoveGame,
  adminRestoreGame,
  adminSetChildLocked,
  communityStatus,
  parentRemoveGame,
  reportGame,
} from './moderation';
import { adminResolveTakedown, gameDangBiKhieuNai, submitTakedownRequest } from './takedown';
import { resolveAllErrors, setErrorResolved } from './error-log';
import { BaoLoiError, datBaoLoiDaXuLy, guiBaoLoi } from './bao-loi';
import { xoaGiaDinh } from './xoa-gia-dinh';
import { rateKey, tooMany } from './rate-limit';
import { xoaHopThuDev } from './mail';
import {
  clientFingerprint,
  createAdminSession,
  destroyAdminSession,
  destroySession,
  getActor,
  getAdmin,
} from './session';
import { prisma } from './db';
import { PhanUngError, thaIcon, type TomTatPhanUng } from './phan-ung';
import { LoiNhanError, nhanLoi, type TomTatLoiNhan } from './loi-nhan';
import { doiTheoDoi, TheoDoiError } from './theo-doi';

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
    /*
     * Quá tải băm mật khẩu: nói thật là máy chủ đang bận, đừng để rơi xuống câu
     * chung "Có lỗi xảy ra". Người dùng cần biết đây là chuyện tạm thời và thử lại
     * được, chứ không phải họ vừa làm sai cái gì.
     */
    if (e instanceof ScryptBusyError) {
      console.warn('[action] chạm trần scrypt:', scryptLoad());
      return { error: e.message };
    }
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
    /*
     * KHÔNG biết IP thì KHÔNG giới hạn, cùng lý lẽ đã dùng ở `reporterKey` trong
     * `moderation.ts`: gộp mọi người không rõ IP vào một khoá là chặn oan cả nhóm.
     * Ở production Caddy luôn ghi đè `x-forwarded-for`, nên đường không-có-IP chỉ
     * chạy ở dev và LAN — và nhờ đó các bộ e2e (dựng tới sáu phụ huynh một lượt,
     * chạy lại nhiều lần trong một giờ) không bao giờ chạm trần này.
     */
    const ip = await clientIp();
    if (ip && tooMany(rateKey('dang-ky', ip), REGISTRATIONS_PER_IP_PER_HOUR, 60 * 60 * 1000)) {
      throw new AuthError(
        'Có quá nhiều lượt đăng ký từ mạng của bạn trong một giờ qua. Bạn thử lại sau ít phút nhé.'
      );
    }

    const emailNhap = String(form.get('email') ?? '');

    let parentId: string;
    try {
      parentId = await registerParent(emailNhap, String(form.get('password') ?? ''));
    } catch (e) {
      /*
       * Email đã có tài khoản: gửi cho chủ hòm thư một lá thư nhắc kèm link đặt lại
       * mật khẩu, rồi ném lại để người đang đứng ở form vẫn nhận đúng câu trả lời
       * thẳng như cũ.
       *
       * Người gõ lại email cũ gần như luôn là chính chủ đã quên mình đăng ký rồi.
       * Câu trên màn hình bảo họ đi bấm "Quên mật khẩu"; lá thư này mang luôn cái
       * link đó tới nơi họ chắc chắn mở.
       *
       * Nhận biết bằng `ma` chứ không so `message`: message là câu chữ cho người
       * đọc, và ai sửa lời cho dễ hiểu hơn sẽ lặng lẽ tắt mất nhánh này.
       *
       * Nuốt lỗi gửi thư, không để nó thay câu trả lời. `createAuthToken` ném khi
       * vượt trần 5 lượt một giờ cho mỗi tài khoản — chính là van chặn việc dùng
       * /dang-ky làm máy gửi thư tới hòm thư người khác. Chạm van đó thì thư không
       * đi, và người ở form vẫn phải thấy đúng câu "email này đã được dùng".
       */
      if (e instanceof AuthError && e.ma === 'EMAIL_DA_DUNG') {
        try {
          await guiThuEmailDaCoTaiKhoan(emailNhap);
        } catch (loi) {
          console.error('[action] không gửi được thư nhắc email đã có tài khoản:', loi);
        }
      }
      throw e;
    }
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

/**
 * Đăng nhập vào khu quản trị. Chỉ dùng được trên admin origin.
 *
 * `redirect('/admin')` là đường dẫn TƯƠNG ĐỐI, cố ý: action này chỉ chạy khi form
 * trên admin origin gửi tới, nên tương đối là ở lại đúng origin đó. Ghi origin
 * tuyệt đối vào đây thì phải đọc biến môi trường, và sai biến là chuyển người vừa
 * đăng nhập sang một host không có cookie của họ.
 */
export async function adminLoginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const state = await run(async () => {
    await loginAdmin(
      String(form.get('email') ?? ''),
      String(form.get('password') ?? ''),
      await fingerprint()
    );
  });
  if (state && 'ok' in state) redirect('/admin');
  return state;
}

/**
 * Đăng xuất khỏi khu quản trị.
 *
 * KHÔNG gọi `destroySession()`: phiên site của cùng người đó là một phiên khác, trên
 * một origin khác, và họ có thể đang mở nó ở tab bên cạnh với tư cách phụ huynh.
 * Đăng xuất khỏi khu quản trị không có lý gì đăng xuất họ khỏi trang của con mình.
 */
export async function adminLogoutAction(): Promise<void> {
  await destroyAdminSession();
  redirect('/admin/dang-nhap');
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
  /*
   * Đọc `gameId` NGOÀI `run` để dòng `revalidatePath` cuối hàm dùng lại được. Nó
   * không phải là chỗ kiểm quyền — quyền vẫn kiểm bên trong, bằng truy vấn đòi
   * `child: { parentId }` — nên một id bịa ra ở đây chỉ làm mới lại một trang mà
   * người bịa vốn đã xem được.
   */
  const gameId = String(form.get('gameId') ?? '');

  const state = await run(async () => {
    const parentId = await requireParent();
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
  /*
   * Và cả trang của chính game đó, vì nút "Ẩn game" giờ cũng nằm ở đấy.
   *
   * Thiếu dòng này thì bấm xong không có gì đổi trên màn hình — nhãn vẫn là "Ẩn
   * game", dải cảnh báo không hiện — trong khi DB đã đổi thật. Người dùng sẽ bấm
   * lần nữa. Ba trang liên quan đều `force-dynamic`, nhưng đó chỉ nói về lượt điều
   * hướng mới; sau một server action thì đây mới là thứ bảo router vẽ lại trang
   * đang đứng.
   */
  if (gameId) revalidatePath(`/game/${gameId}`);
  return state;
}

/**
 * Phụ huynh xoá hẳn một game của con mình.
 *
 * Đường thu hồi thật, khác nút "Ẩn game": ẩn chỉ rút game khỏi trang, còn file HTML và
 * `.sb3` vẫn được player origin phục vụ theo hash cho bất cứ ai có URL — vĩnh viễn, vì
 * `storage:prune` chỉ xoá file mồ côi. Xoá thì `removedAt` bắt đầu chạy và job dọn hằng
 * đêm xoá thật cả hàng DB lẫn file.
 *
 * Chốt "đang có khiếu nại bản quyền" đặt ở đây chứ không trong `parentRemoveGame`, vì
 * `gameDangBiKhieuNai` sống ở `takedown.ts` và file đó đã import `moderation.ts` — gọi
 * ngược lại là một vòng import. Cùng tầng, cùng điều kiện với `setGameHiddenAction`.
 */
export async function parentRemoveGameAction(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  const state = await run(async () => {
    const parentId = await requireParent();
    const gameId = String(form.get('gameId') ?? '');

    if ((await gameDangBiKhieuNai([gameId])).has(gameId)) {
      throw new AuthError(
        'Game này đang tạm ẩn vì có yêu cầu gỡ bản quyền chờ xử lý, nên chưa xoá được. Đội kiểm duyệt sẽ trả lời trước, sau đó bạn xoá được.'
      );
    }

    await parentRemoveGame(parentId, gameId);
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

/**
 * Bảo đảm người gọi đang có PHIÊN QUẢN TRỊ, không chỉ là một phụ huynh có isAdmin.
 *
 * Đổi từ `getActor()` sang `getAdmin()` là chỗ quan trọng nhất của việc tách origin,
 * và nếu bỏ sót thì cả việc tách thành trang trí: tám server action bên dưới ẩn game
 * của trẻ, gỡ hẳn, khoá tài khoản. Chúng là những thứ một lỗ XSS trên app origin sẽ
 * muốn gọi tới — và server action gọi được bằng một POST kèm cookie của trang đang
 * mở. Nếu chốt này còn đọc cookie phiên site thì kẻ tấn công có XSS ở app origin vẫn
 * bấm được mọi nút quản trị, dù trang `/admin` đã dời sang origin khác.
 *
 * `getAdmin()` đọc cookie khác, host-only trên admin origin, nên POST phát ra từ app
 * origin không mang nó theo. Cộng với `sameSite: 'lax'`, một POST từ origin khác
 * cũng không mang được cookie admin.
 */
async function requireAdmin(): Promise<string> {
  const admin = await getAdmin();
  if (!admin) {
    throw new AuthError('Bạn không có quyền vào khu vực này.');
  }
  return admin.id;
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

/**
 * Xoá hẳn tài khoản của cả một gia đình, theo yêu cầu của phụ huynh.
 *
 * ĐÒI GÕ LẠI EMAIL, và việc so chuỗi ấy nằm Ở ĐÂY chứ không chỉ ở giao diện. Nút bên
 * kia có chặn thì cũng chỉ chặn được người bấm nút; một server action là một điểm
 * vào riêng, gọi thẳng được mà không đi qua màn hình nào. Với thao tác phá huỷ nhất
 * hệ thống có, cái chốt phải nằm ở phía không bỏ qua được.
 *
 * `revalidatePath` cả `/admin/tong-quan`: bảng số đếm ở đó vừa mất mấy game của nhà
 * này, và một bảng "hôm nay có việc gì gấp" mà còn đếm game đã biến mất thì người
 * trực sẽ đi tìm chúng.
 */
export async function adminXoaGiaDinhAction(_prev: FormState, form: FormData): Promise<FormState> {
  const state = await run(async () => {
    const adminId = await requireAdmin();
    const email = String(form.get('email') ?? '').trim();
    const goLai = String(form.get('xacNhanEmail') ?? '').trim();
    if (!email || goLai.toLowerCase() !== email.toLowerCase()) {
      throw new AuthError('Email gõ lại không khớp. Không xoá gì cả.');
    }
    await xoaGiaDinh(adminId, email, String(form.get('note') ?? '').trim());
  });
  revalidatePath('/admin/tai-khoan');
  revalidatePath('/admin/tong-quan');
  return state;
}

/**
 * Người dùng gửi một báo lỗi. KHÔNG đòi đăng nhập, cố ý.
 *
 * Cùng lý lẽ với `reportGameAction`: người gặp lỗi thường đang gặp nó ở ĐÚNG luồng
 * đăng nhập hoặc đăng ký, nên bắt đăng nhập trước khi báo là đóng cửa với đúng nhóm
 * báo cáo giá trị nhất. Chống lạm dụng bằng trần theo IP và trần tổng, xem
 * `lib/bao-loi.ts`.
 *
 * Đọc IP và user agent Ở ĐÂY chứ không nhận từ form: hai thứ đó phải do server tự
 * thấy, không thì chúng chỉ là hai ô chữ nữa mà người gửi tự điền.
 */
export async function guiBaoLoiAction(_prev: FormState, form: FormData): Promise<FormState> {
  return run(async () => {
    const h = await headers();
    try {
      await guiBaoLoi({
        moTa: String(form.get('moTa') ?? ''),
        maLoi: String(form.get('maLoi') ?? ''),
        duongDan: String(form.get('duongDan') ?? ''),
        emailLienHe: String(form.get('emailLienHe') ?? ''),
        ip: await clientIp(),
        userAgent: h.get('user-agent'),
      });
    } catch (e) {
      /* `BaoLoiError` mang câu chữ viết cho người gửi đọc, nên nó phải hiện nguyên
         văn trên form. `run` chỉ chuyển `AuthError` như vậy, nên bọc lại — không thì
         "hộp báo lỗi đang đầy" rơi xuống câu chung "Có lỗi xảy ra, thử lại sau nhé",
         đúng lúc người dùng cần biết vì sao. */
      if (e instanceof BaoLoiError) throw new AuthError(e.message);
      throw e;
    }
  });
}

/** Admin đánh dấu một báo lỗi của người dùng đã xử lý, hoặc mở lại. */
export async function adminDatBaoLoiDaXuLyAction(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  const state = await run(async () => {
    await requireAdmin();
    await datBaoLoiDaXuLy(String(form.get('id') ?? ''), String(form.get('daXuLy')) === 'true');
  });
  revalidatePath('/admin/loi');
  revalidatePath('/admin/tong-quan');
  return state;
}

/**
 * Đánh dấu một nhóm lỗi đã xử lý, hoặc mở lại.
 *
 * KHÔNG ghi `ModerationLog`, khác mọi action admin ở trên. Vết kiểm duyệt là hồ sơ
 * về những gì đã làm với game và tài khoản của một đứa trẻ, tức nó có ý nghĩa với
 * người ngoài; còn đánh dấu một lỗi kỹ thuật là ghi chú nội bộ của người đang sửa.
 * Trộn hai loại vào một dòng thời gian là làm loãng đúng chỗ cần đọc kỹ nhất.
 */
export async function adminSetErrorResolvedAction(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  const state = await run(async () => {
    await requireAdmin();
    await setErrorResolved(String(form.get('id') ?? ''), String(form.get('resolved')) === 'true');
  });
  revalidatePath('/admin/loi');
  return state;
}

/**
 * Dọn hộp thư dev.
 *
 * KHÔNG đòi admin, nhưng CÓ chốt production — đúng như trang `/dev/thu`: đường đi
 * cần thử nhất là phụ huynh vừa đăng ký, chưa xác minh, chưa là gì cả. Còn chốt
 * `NODE_ENV` là bắt buộc: một action là một điểm vào riêng, người ta gọi được nó mà
 * không cần mở trang nào, nên `notFound()` bên trang không che cho nó.
 */
export async function xoaHopThuDevAction(
  _prev: FormState,
  _form: FormData
): Promise<FormState> {
  const state = await run(async () => {
    if (process.env.NODE_ENV === 'production') {
      throw new AuthError('Hộp thư dev không tồn tại ở môi trường này.');
    }
    xoaHopThuDev();
  });
  revalidatePath('/dev/thu');
  return state;
}

export async function adminResolveAllErrorsAction(
  _prev: FormState,
  _form: FormData
): Promise<FormState> {
  const state = await run(async () => {
    await requireAdmin();
    await resolveAllErrors();
  });
  revalidatePath('/admin/loi');
  return state;
}

// --- Thả icon lên game --------------------------------------------------------

/**
 * Trần số lần đổi icon của MỘT bé trong một phút.
 *
 * Không phải để chống tấn công — một bé thả nhiều nhất một icon mỗi game, nên không
 * có cách nào bơm số đếm lên bằng cách bấm nhanh. Nó chống đúng một thứ: ngón tay
 * của một đứa trẻ phát hiện ra rằng bấm liên tục thì icon nhấp nháy vui mắt, và mỗi
 * nhịp nhấp nháy là hai truy vấn DB.
 *
 * Đặt rộng tay (30/phút) vì đổi ý vài lần liên tiếp là hành vi BÌNH THƯỜNG ở đây —
 * thử lần lượt từng icon xem cái nào hợp là đúng cách người ta dùng hàng nút này.
 */
const DOI_ICON_MOI_PHUT = 30;

export type KetQuaThaIcon = { error: string } | { ok: true; tomTat: TomTatPhanUng };

/**
 * Thả / đổi / gỡ icon. Trả về tóm tắt MỚI để giao diện vẽ lại mà không tải lại trang.
 *
 * KHÔNG dùng `run()` như các action khác, cố ý: `run()` trả `FormState` chỉ nói
 * được ok hay lỗi, mà ở đây thứ nơi gọi cần là CON SỐ MỚI. Bắt trang tự tải lại để
 * lấy số thì mỗi lần bấm là một vòng render cả trang game — kể cả cái iframe đang
 * chạy game dở.
 *
 * KHÔNG `revalidatePath('/game/[id]')` vì lý do vừa nói: dựng lại trang là nạp lại
 * iframe, tức đứa trẻ đang chơi dở bị đá về màn hình đầu chỉ vì vừa thả một trái
 * tim. Con số trên các DANH SÁCH sẽ lệch tới lần dựng lại kế tiếp, và đó là đánh
 * đổi có ý thức: sai vài phút ở một con số trang trí, đổi lấy việc không phá ván
 * chơi của ai.
 */
export async function thaIconAction(gameId: string, ma: string): Promise<KetQuaThaIcon> {
  const actor = await getActor();

  // Phụ huynh và khách xem được số nhưng không thả được — lý do ở `model Reaction`.
  // Nói rõ "bé" chứ không nói "bạn chưa đăng nhập", vì phụ huynh ĐANG đăng nhập và
  // câu kia sẽ làm họ đi tìm nút đăng nhập không tồn tại.
  if (!actor || actor.kind !== 'child') {
    return { error: 'Chỉ tài khoản của bé mới thả được icon.' };
  }

  if (tooMany(`icon:${actor.id}`, DOI_ICON_MOI_PHUT, 60 * 1000)) {
    return { error: 'Bấm chậm lại một chút nhé!' };
  }

  try {
    return { ok: true, tomTat: await thaIcon(gameId, actor.id, ma) };
  } catch (e) {
    if (e instanceof PhanUngError) return { error: e.message };
    console.error('[thaIconAction]', e);
    return { error: 'Có lỗi xảy ra, thử lại nhé.' };
  }
}

// --- Lời nhắn có sẵn ----------------------------------------------------------

/**
 * Trần số lần đổi câu của MỘT bé trong một phút.
 *
 * Cùng con số với icon, và cùng lý do: một bé nhiều nhất một lời nhắn mỗi game nên
 * bấm nhanh không bơm được gì, nhưng mỗi nhịp bấm vẫn là hai truy vấn DB. Đọc hết
 * tám câu rồi đổi ý vài lần là cách dùng BÌNH THƯỜNG của hàng nút này.
 */
const DOI_LOI_NHAN_MOI_PHUT = 30;

export type KetQuaNhanLoi = { error: string } | { ok: true; tomTat: TomTatLoiNhan };

/**
 * Nhắn / đổi câu / gỡ. Trả về tóm tắt MỚI để giao diện vẽ lại mà không tải lại trang.
 *
 * Không `run()` và không `revalidatePath`, đúng như `thaIconAction` — dựng lại trang
 * game là nạp lại iframe, tức đứa trẻ đang chơi dở bị đá về màn hình đầu chỉ vì vừa
 * nhắn một câu. Lý lẽ đầy đủ ở `thaIconAction` ngay trên.
 */
export async function nhanLoiAction(gameId: string, ma: string): Promise<KetQuaNhanLoi> {
  const actor = await getActor();

  // Nói rõ "bé" thay vì "bạn chưa đăng nhập": phụ huynh ĐANG đăng nhập, và câu kia
  // sẽ đẩy họ đi tìm một nút đăng nhập không tồn tại.
  if (!actor || actor.kind !== 'child') {
    return { error: 'Chỉ tài khoản của bé mới nhắn được.' };
  }

  if (tooMany(`loi-nhan:${actor.id}`, DOI_LOI_NHAN_MOI_PHUT, 60 * 1000)) {
    return { error: 'Bấm chậm lại một chút nhé!' };
  }

  try {
    return { ok: true, tomTat: await nhanLoi(gameId, actor.id, ma) };
  } catch (e) {
    if (e instanceof LoiNhanError) return { error: e.message };
    console.error('[nhanLoiAction]', e);
    return { error: 'Có lỗi xảy ra, thử lại nhé.' };
  }
}

// --- Theo dõi một bạn ---------------------------------------------------------

/** Trần số lần bật/tắt theo dõi của MỘT bé trong một phút. */
const DOI_THEO_DOI_MOI_PHUT = 20;

export type KetQuaTheoDoi = { error: string } | { ok: true; dangTheoDoi: boolean };

/**
 * Bật / tắt theo dõi. Trả về trạng thái MỚI để nút tự vẽ lại.
 *
 * KHÔNG `revalidatePath('/')` dù dải "game mới của bạn bè" trên trang chủ có đổi
 * theo: nút này được bấm từ TRANG GAME, và dựng lại trang đó là nạp lại iframe —
 * đứa trẻ đang chơi dở bị đá về màn hình đầu vì vừa bấm theo dõi. Trang chủ sẽ đúng
 * ở lần tải kế tiếp, và đó chính là lúc bé nhìn vào nó.
 */
export async function doiTheoDoiAction(authorId: string): Promise<KetQuaTheoDoi> {
  const actor = await getActor();

  // Chỉ bé theo dõi được. Phụ huynh có phiên hợp lệ nên chốt phải hỏi ĐÚNG VAI, chứ
  // không chỉ hỏi "đã đăng nhập chưa".
  if (!actor || actor.kind !== 'child') {
    return { error: 'Chỉ tài khoản của bé mới theo dõi bạn được.' };
  }

  if (tooMany(`theo-doi:${actor.id}`, DOI_THEO_DOI_MOI_PHUT, 60 * 1000)) {
    return { error: 'Bấm chậm lại một chút nhé!' };
  }

  try {
    return { ok: true, dangTheoDoi: await doiTheoDoi(actor.id, authorId) };
  } catch (e) {
    if (e instanceof TheoDoiError) return { error: e.message };
    console.error('[doiTheoDoiAction]', e);
    return { error: 'Có lỗi xảy ra, thử lại nhé.' };
  }
}
