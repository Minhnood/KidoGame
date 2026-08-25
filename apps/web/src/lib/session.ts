import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from './db';

export const SESSION_COOKIE = 'kidogame_session';
const SESSION_DAYS = 30;

/**
 * Cookie phiên — cấu hình ở đây là phần giữ cho việc tách origin có ý nghĩa.
 *
 * KHÔNG set `domain`: cookie thành host-only, nên nó chỉ đi tới đúng app origin
 * và không bao giờ lọt sang player origin (nơi chạy game của người dùng).
 * Set `domain` ở đây là phá tan lớp cách ly quan trọng nhất của cả hệ thống.
 *
 * `sameSite: 'lax'` chặn cookie đi kèm POST từ site khác, tức là đã chống CSRF
 * cho mọi mutation — vì mọi mutation ở đây đều là POST.
 */
function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
    // Cố tình KHÔNG có `domain`.
  };
}

/** Token trong cookie là bí mật; DB chỉ giữ sha256 của nó. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Vân tay client, chỉ để phụ huynh nhận ra phiên lạ. Không lưu IP thô. */
export function clientFingerprint(ip: string | null, userAgent: string | null): string {
  return createHash('sha256')
    .update(`${ip ?? ''}|${userAgent ?? ''}`)
    .digest('hex')
    .slice(0, 32);
}

export type Actor =
  | { kind: 'parent'; id: string; email: string; isAdmin: boolean }
  | { kind: 'child'; id: string; username: string; displayName: string; parentId: string };

export async function createSession(
  owner: { parentId: string; childId?: undefined } | { childId: string; parentId?: undefined },
  clientHash = ''
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const maxAge = SESSION_DAYS * 24 * 60 * 60;

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      parentId: owner.parentId ?? null,
      childId: owner.childId ?? null,
      expiresAt: new Date(Date.now() + maxAge * 1000),
      clientHash,
    },
  });

  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(maxAge));
}

/**
 * Đọc phiên hiện tại. Trả về null nếu không có, hết hạn, hoặc tài khoản bị khoá.
 *
 * Phiên hết hạn thì xoá luôn khỏi DB — dọn rác ngay trên đường đi, không cần cron.
 */
export async function getActor(): Promise<Actor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      parent: { select: { id: true, email: true, isAdmin: true } },
      child: {
        select: { id: true, username: true, displayName: true, parentId: true, isLocked: true },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { tokenHash: session.tokenHash } }).catch(() => {});
    return null;
  }

  if (session.parent) {
    return {
      kind: 'parent',
      id: session.parent.id,
      email: session.parent.email,
      isAdmin: session.parent.isAdmin,
    };
  }

  if (session.child) {
    // Phụ huynh khoá tài khoản con thì phiên đang mở mất hiệu lực ngay.
    if (session.child.isLocked) return null;
    return {
      kind: 'child',
      id: session.child.id,
      username: session.child.username,
      displayName: session.child.displayName,
      parentId: session.child.parentId,
    };
  }

  return null;
}

/** Đăng xuất: xoá bản ghi phiên rồi xoá cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.delete({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

/** Thu hồi mọi phiên của một tài khoản — dùng khi đổi mật khẩu hoặc khoá tài khoản. */
export async function revokeAllSessions(
  owner: { parentId: string } | { childId: string }
): Promise<number> {
  const result = await prisma.session.deleteMany({ where: owner });
  return result.count;
}
