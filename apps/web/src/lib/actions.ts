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
  adminDismissReports,
  adminRemoveGame,
  adminRestoreGame,
  adminSetChildLocked,
  reportGame,
} from './moderation';
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
    await registerParent(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
  });
  if (state && 'ok' in state) redirect('/phu-huynh');
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
      select: { id: true },
    });
    if (!game) throw new AuthError('Không tìm thấy game này.');

    await prisma.game.update({
      where: { id: gameId },
      data: { status: hidden ? 'HIDDEN' : 'PUBLISHED' },
    });
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
    await adminRestoreGame(
      adminId,
      String(form.get('gameId') ?? ''),
      'Admin xác nhận không sao, cho hiện lại'
    );
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

export async function adminSetChildLockedAction(
  _prev: FormState,
  form: FormData
): Promise<FormState> {
  const state = await run(async () => {
    await requireAdmin();
    await adminSetChildLocked(
      String(form.get('childId') ?? ''),
      String(form.get('locked')) === 'true'
    );
  });
  revalidatePath('/admin');
  return state;
}
