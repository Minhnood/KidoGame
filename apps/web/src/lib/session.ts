import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from './db';

/**
 * Ở production thì cookie chạy qua HTTPS và mang được tiền tố `__Host-`.
 *
 * Tiền tố đó KHÔNG phải để cho đẹp tên. Nó là một quy tắc trình duyệt tự thi
 * hành: cookie mang tiền tố này bị TỪ CHỐI nếu có thuộc tính `Domain`. Đó đúng
 * là lỗ mà việc bỏ `domain` ở dưới không bịt được — bỏ `domain` ngăn player
 * origin ĐỌC cookie, nhưng không ngăn nó GHI một cookie trùng tên với
 * `Domain=kidogame.vn`. Hai cookie cùng tên thì trình duyệt gửi cả hai, cái có
 * `Path` dài hơn đi trước, và `cookies().get()` lấy cái đầu tiên. Kết quả là
 * script trên player origin gán được phiên của nó cho đứa trẻ đang đăng nhập,
 * và `jar.delete()` không xoá nổi cái đó nên đăng xuất cũng không gỡ ra được.
 *
 * Chưa có đường nào để JS lạ chạy trên player origin (extension URL bị chặn,
 * asset lọc theo whitelist, payload đóng gói được escape). Đây là hàng rào thứ
 * hai — dựng sẵn vì cả hệ thống này đã coi player origin là nơi có mã thù địch.
 *
 * VÌ SAO phải theo môi trường: `__Host-` bắt buộc `Secure`, mà `secure` chỉ bật
 * ở production. Dev và `dev-lan` chạy HTTP trần — gắn tiền tố ở đó thì trình
 * duyệt vứt cookie đi và không ai đăng nhập được, kể cả trên điện thoại thật.
 */
const IS_PROD = process.env.NODE_ENV === 'production';
export const SESSION_COOKIE = IS_PROD ? '__Host-kidogame_session' : 'kidogame_session';
const SESSION_DAYS = 30;

/**
 * Cookie phiên — cấu hình ở đây là phần giữ cho việc tách origin có ý nghĩa.
 *
 * KHÔNG set `domain`: cookie thành host-only, nên nó chỉ đi tới đúng app origin
 * và không bao giờ lọt sang player origin (nơi chạy game của người dùng).
 * Set `domain` ở đây là phá tan lớp cách ly quan trọng nhất của cả hệ thống —
 * và ở production nó còn làm trình duyệt vứt luôn cookie, vì tiền tố `__Host-`.
 *
 * `sameSite: 'lax'` chặn cookie đi kèm POST từ site khác, tức là đã chống CSRF
 * cho mọi mutation — vì mọi mutation ở đây đều là POST.
 */
function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax' as const,
    // `__Host-` cũng đòi đúng `Path=/`. Trùng với thứ ta vốn muốn.
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
      scope: 'SITE',
    },
  });

  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(maxAge));
}

// --- Phiên khu quản trị ------------------------------------------------------

/**
 * Cookie phiên của khu quản trị, TÁCH HẲN khỏi cookie phiên site.
 *
 * Đây là chỗ toàn bộ giá trị bảo mật của việc tách origin nằm. Cookie không có
 * `Domain`, nên nó là host-only trên admin origin: trình duyệt không gửi nó tới app
 * origin, và mã JavaScript chạy trên app origin không đọc được nó — khác origin thì
 * không có đường nào chạm tới cookie jar của nhau.
 *
 * VÌ SAO ĐIỀU ĐÓ QUAN TRỌNG Ở ĐÂY hơn ở phần lớn trang web: app origin render tên
 * game và mô tả do TRẺ EM nhập. Đó là đường XSS đáng lo nhất của cả dự án, và trước
 * bản này một lỗ XSS ở đó đọc được phiên quản trị vì hai bên dùng chung một cookie
 * trên chung một host. Nay thì lỗ đó vẫn là lỗ, nhưng nó không còn với tới được
 * quyền ẩn game và khoá tài khoản.
 *
 * Tên khác hẳn cookie site, không phải thêm hậu tố: hai cookie cùng tên trên hai
 * host khác nhau là chuyện bình thường và trình duyệt phân biệt được, nhưng người
 * đọc log và người debug thì không — và `__Host-` chỉ chặn được cookie có `Domain`,
 * chứ không chặn một origin khác ghi cookie trùng tên trên chính host của nó.
 */
export const ADMIN_SESSION_COOKIE = IS_PROD ? '__Host-kidogame_admin' : 'kidogame_admin';

/**
 * Phiên quản trị sống ngắn hơn phiên site: 1 ngày thay vì `SESSION_DAYS`.
 *
 * Phiên site dài là để một đứa trẻ không phải gõ lại mật khẩu mỗi lần vào chơi. Phiên
 * quản trị thì ngược lại — nó mở ra quyền ẩn game của người khác và khoá tài khoản,
 * nên một cái laptop bỏ quên ở trung tâm không nên còn đăng nhập vào tuần sau.
 */
const ADMIN_SESSION_HOURS = 24;

export async function createAdminSession(parentId: string, clientHash = ''): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const maxAge = ADMIN_SESSION_HOURS * 60 * 60;

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      parentId,
      expiresAt: new Date(Date.now() + maxAge * 1000),
      clientHash,
      scope: 'ADMIN',
    },
  });

  (await cookies()).set(ADMIN_SESSION_COOKIE, token, cookieOptions(maxAge));
}

/**
 * Đọc phiên quản trị. `null` nếu không có, hết hạn, sai `scope`, hoặc mất `isAdmin`.
 *
 * KIỂM `scope === 'ADMIN'` là bắt buộc, và nó là lý do cột `Session.scope` tồn tại:
 * không có phép kiểm này thì một token phiên phụ huynh bình thường — thứ chính chủ
 * đọc được từ cookie jar của mình — dán vào cookie admin sẽ tra ra một hàng hợp lệ.
 *
 * KIỂM LẠI `isAdmin` mỗi lần chứ không tin vào lúc phát phiên: quyền quản trị thu
 * hồi được bằng `db:make-admin --bo`, và thu hồi phải có hiệu lực ngay, không phải
 * sau khi phiên hết hạn.
 */
export async function getAdmin(): Promise<{ id: string; email: string } | null> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { parent: { select: { id: true, email: true, isAdmin: true } } },
  });

  if (!session || session.scope !== 'ADMIN') return null;

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { tokenHash: session.tokenHash } }).catch(() => {});
    return null;
  }

  if (!session.parent?.isAdmin) return null;

  return { id: session.parent.id, email: session.parent.email };
}

/** Đăng xuất khỏi khu quản trị. Không ảnh hưởng phiên site của cùng người đó. */
export async function destroyAdminSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.delete({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }
  jar.set(ADMIN_SESSION_COOKIE, '', cookieOptions(0));
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

  /*
   * Phiên quản trị KHÔNG dùng được làm phiên site, dù cùng một con người.
   *
   * Phép kiểm này là nửa còn lại của `getAdmin`, và nó cần vì cách ly cookie chỉ
   * chặn được trình duyệt tự động gửi sai chỗ — nó không chặn ai đó cầm token của
   * chính mình dán sang cookie bên kia. Chặn cả hai chiều thì `scope` mới thật sự
   * là "phiên này phát cho cửa nào", chứ không phải một cái nhãn.
   */
  if (session.scope !== 'SITE') return null;

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
  /*
   * Xoá bằng cách GHI ĐÈ một cookie đã hết hạn, không dùng `jar.delete()`.
   *
   * `jar.delete()` sinh ra `__Host-kidogame_session=; Path=/; Expires=1970` —
   * thiếu `Secure`. Mà cookie mang tiền tố `__Host-` thiếu `Secure` thì trình
   * duyệt TỪ CHỐI nguyên cái, nên lệnh xoá bị vứt và cookie cũ ở nguyên đó.
   *
   * Đã dựng lại được trên stack Docker: bấm Đăng xuất, response mang đúng
   * dòng Set-Cookie trên, và cookie vẫn còn trong trình duyệt sau đó.
   *
   * Không thành lỗ bảo mật vì bản ghi Session đã bị xoá ở trên — cookie còn lại
   * trỏ vào hư không và `getActor()` trả null. Nhưng nó là rác vĩnh viễn trong
   * trình duyệt của trẻ, và là loại lỗi mà lần sau sẽ thành lỗ thật.
   *
   * Dùng lại `cookieOptions` để lệnh xoá mang đủ `secure` và `path` như lúc set:
   * đây chính là điều kiện để trình duyệt chịu nhận.
   */
  jar.set(SESSION_COOKIE, '', cookieOptions(0));
}

/** Thu hồi mọi phiên của một tài khoản — dùng khi đổi mật khẩu hoặc khoá tài khoản. */
export async function revokeAllSessions(
  owner: { parentId: string } | { childId: string }
): Promise<number> {
  const result = await prisma.session.deleteMany({ where: owner });
  return result.count;
}
