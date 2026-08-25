import { prisma } from './db';
import {
  checkChildPassword,
  checkParentPassword,
  hashPassword,
  verifyPassword,
} from './password';
import { createSession, revokeAllSessions } from './session';

/** Lỗi có thông báo an toàn để hiện thẳng cho người dùng. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

const MAX_FAILURES = 5;
const BASE_LOCK_MINUTES = 15;

/**
 * Chặn dò mật khẩu.
 *
 * Khoá theo danh tính (email/username) chứ KHÔNG theo IP: cả một lớp học hoặc cả
 * một gia đình thường dùng chung IP, khoá theo IP là khoá oan người vô can.
 * Nhược điểm là kẻ tấn công có thể cố tình khoá tài khoản người khác — chấp nhận
 * được ở đây vì thời gian khoá ngắn và tài khoản trẻ không có gì để mất ngoài game.
 */
async function assertNotLocked(identity: string): Promise<void> {
  const row = await prisma.loginAttempt.findUnique({ where: { identity } });
  if (row?.lockedUntil && row.lockedUntil > new Date()) {
    const minutes = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AuthError(`Sai quá nhiều lần rồi. Thử lại sau ${minutes} phút nhé.`);
  }
}

async function recordFailure(identity: string): Promise<void> {
  const row = await prisma.loginAttempt.upsert({
    where: { identity },
    update: { failedCount: { increment: 1 } },
    create: { identity, failedCount: 1 },
  });

  if (row.failedCount >= MAX_FAILURES) {
    // Mỗi lần vượt ngưỡng thì thời gian khoá nhân đôi, tối đa 24 giờ.
    const over = row.failedCount - MAX_FAILURES;
    const minutes = Math.min(BASE_LOCK_MINUTES * 2 ** over, 24 * 60);
    await prisma.loginAttempt.update({
      where: { identity },
      data: { lockedUntil: new Date(Date.now() + minutes * 60_000) },
    });
  }
}

async function clearFailures(identity: string): Promise<void> {
  await prisma.loginAttempt
    .update({ where: { identity }, data: { failedCount: 0, lockedUntil: null } })
    .catch(() => {});
}

/**
 * Hash thật của một mật khẩu vứt đi, dùng làm mồi khi tài khoản không tồn tại.
 *
 * Nếu không tìm thấy tài khoản mà trả về ngay, thời gian phản hồi sẽ ngắn hơn
 * hẳn so với lúc có tài khoản — kẻ tấn công đo thời gian là biết email/username
 * nào tồn tại. Băm với hash mồi này giữ cho hai đường đi tốn thời gian như nhau.
 */
const DUMMY_HASH =
  'scrypt$65536$8$1$bdf83e5715049ca7fa26b99d060565ca$' +
  'f3634a56aa10aeed4fa17c0f77db837011780899a7b899137ad5c1ab83e6eb7a' +
  '9941fa7e724a151c378408b173f46f7643d8800556ab3da22247e9187fa8b3bd';

/** Luôn tốn đúng một lần băm, kể cả khi tài khoản không tồn tại. */
async function verifyOrDecoy(password: string, storedHash: string | null): Promise<boolean> {
  if (storedHash === null) {
    await verifyPassword(password, DUMMY_HASH);
    return false;
  }
  return verifyPassword(password, storedHash);
}

const normalizeEmail = (raw: string) => raw.trim().toLowerCase();
const normalizeUsername = (raw: string) => raw.trim().toLowerCase();

// --- Phụ huynh ---------------------------------------------------------------

export async function registerParent(emailRaw: string, password: string): Promise<void> {
  const email = normalizeEmail(emailRaw);

  // Cố tình kiểm rất nhẹ: mọi regex email đều sai ở đâu đó, và ở đây không cần
  // đúng tuyệt đối. Xác thực thật là gửi mail xác nhận (chưa làm ở M2).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new AuthError('Email không hợp lệ.');
  }

  const problem = checkParentPassword(password);
  if (problem) throw new AuthError(problem.message);

  const existing = await prisma.parent.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new AuthError('Email này đã được dùng để đăng ký rồi.');
  }

  const parent = await prisma.parent.create({
    data: { email, passwordHash: await hashPassword(password) },
  });

  await createSession({ parentId: parent.id });
}

export async function loginParent(
  emailRaw: string,
  password: string,
  clientHash: string
): Promise<void> {
  const email = normalizeEmail(emailRaw);
  const identity = `parent:${email}`;
  await assertNotLocked(identity);

  const parent = await prisma.parent.findUnique({ where: { email } });

  const ok = await verifyOrDecoy(password, parent?.passwordHash ?? null);

  if (!parent || !ok) {
    await recordFailure(identity);
    throw new AuthError('Email hoặc mật khẩu không đúng.');
  }

  await clearFailures(identity);
  await createSession({ parentId: parent.id }, clientHash);
}

// --- Trẻ ---------------------------------------------------------------------

export interface CreateChildInput {
  parentId: string;
  username: string;
  displayName: string;
  password: string;
  birthYear?: number | null;
}

export async function createChild(input: CreateChildInput): Promise<string> {
  const username = normalizeUsername(input.username);
  const displayName = input.displayName.trim().replace(/\s+/g, ' ');

  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    throw new AuthError(
      'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm hoặc gạch, dài 3–24 ký tự.'
    );
  }
  if (displayName.length < 2 || displayName.length > 40) {
    throw new AuthError('Tên hiển thị cần từ 2 đến 40 ký tự.');
  }

  const problem = checkChildPassword(input.password);
  if (problem) throw new AuthError(problem.message);

  const taken = await prisma.child.findUnique({ where: { username }, select: { id: true } });
  if (taken) throw new AuthError('Tên đăng nhập này đã có người dùng, chọn tên khác nhé.');

  const year = input.birthYear ?? null;
  if (year !== null) {
    const thisYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < thisYear - 18 || year > thisYear) {
      throw new AuthError('Năm sinh không hợp lệ.');
    }
  }

  const child = await prisma.child.create({
    data: {
      parentId: input.parentId,
      username,
      displayName,
      passwordHash: await hashPassword(input.password),
      birthYear: year,
    },
  });

  return child.id;
}

export async function loginChild(
  usernameRaw: string,
  password: string,
  clientHash: string
): Promise<void> {
  const username = normalizeUsername(usernameRaw);
  const identity = `child:${username}`;
  await assertNotLocked(identity);

  const child = await prisma.child.findUnique({ where: { username } });

  const ok = await verifyOrDecoy(password, child?.passwordHash ?? null);

  if (!child || !ok) {
    await recordFailure(identity);
    throw new AuthError('Tên đăng nhập hoặc mật khẩu không đúng.');
  }

  if (child.isLocked) {
    throw new AuthError('Tài khoản này đang được bố mẹ tạm khoá.');
  }

  await clearFailures(identity);
  await createSession({ childId: child.id }, clientHash);
}

/** Phụ huynh đổi mật khẩu cho con — thu hồi luôn mọi phiên đang mở của bé. */
export async function resetChildPassword(
  parentId: string,
  childId: string,
  newPassword: string
): Promise<void> {
  const problem = checkChildPassword(newPassword);
  if (problem) throw new AuthError(problem.message);

  const child = await prisma.child.findFirst({
    where: { id: childId, parentId },
    select: { id: true },
  });
  if (!child) throw new AuthError('Không tìm thấy tài khoản của bé.');

  await prisma.child.update({
    where: { id: childId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await revokeAllSessions({ childId });
}

/** Khoá / mở khoá tài khoản con. Khoá thì thu hồi luôn phiên đang mở. */
export async function setChildLocked(
  parentId: string,
  childId: string,
  locked: boolean
): Promise<void> {
  const child = await prisma.child.findFirst({
    where: { id: childId, parentId },
    select: { id: true },
  });
  if (!child) throw new AuthError('Không tìm thấy tài khoản của bé.');

  await prisma.child.update({ where: { id: childId }, data: { isLocked: locked } });
  if (locked) await revokeAllSessions({ childId });
}
