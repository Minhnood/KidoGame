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
  /**
   * Mã máy đọc được, tuỳ chọn.
   *
   * Có vì một chỗ gọi cần phân biệt ĐÚNG một tình huống — email đã có tài khoản —
   * để làm thêm một việc. Cách khác là so chuỗi `message`, mà chuỗi đó là câu chữ
   * hiển thị cho người dùng: ai sửa lời cho dễ hiểu hơn sẽ lặng lẽ làm chết logic
   * ở chỗ khác, và không phép kiểm nào chỉ vào đó.
   */
  readonly ma?: string;

  constructor(message: string, ma?: string) {
    super(message);
    this.name = 'AuthError';
    this.ma = ma;
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

/**
 * Xoá bộ đếm sai mật khẩu sau khi đăng nhập thành công.
 *
 * `updateMany` chứ KHÔNG phải `update`, và đây là một lỗi đã đo được chứ không phải
 * chuyện phong cách.
 *
 * Người chưa từng nhập sai lần nào thì KHÔNG có dòng `LoginAttempt` nào cả — tức là
 * đường đi phổ biến NHẤT. `update` với where không khớp thì Prisma NÉM, và cái
 * `.catch(() => {})` cũ nuốt đúng nên hành vi không sai. Nhưng Prisma đã kịp in lỗi
 * ra stderr TRƯỚC khi bị nuốt, nên mỗi lần đăng nhập sạch là một khối `prisma:error`
 * đỏ trong log. Đo được: tài khoản demo có 0 dòng `LoginAttempt`, đăng nhập một lần
 * thành công thì số khối `prisma:error` trong log tăng đúng 1.
 *
 * Tác hại không phải chức năng, mà là log đỏ trên đúng đường đi thành công sẽ che mất
 * lỗi thật, và trên VPS có cảnh báo log thì nó báo động vào lúc không có gì xảy ra.
 *
 * `updateMany` không khớp gì thì trả về `{ count: 0 }`, không ném, không in gì —
 * cùng idiom đã dùng và đã ghi rõ lý do ở `api/games/[id]/play/route.ts`.
 */
async function clearFailures(identity: string): Promise<void> {
  await prisma.loginAttempt.updateMany({
    where: { identity },
    data: { failedCount: 0, lockedUntil: null },
  });
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

/**
 * Trần số lượt đăng ký từ một IP trong một giờ. Áp ở `registerParentAction`.
 *
 * Hằng số này nằm ở đây chứ không nằm cạnh chỗ dùng, vì `actions.ts` là file
 * `'use server'` và một file như thế CHỈ được export hàm async — export một `const`
 * ra khỏi đó là lỗi build, mà `tsc --noEmit` không hề thấy.
 *
 * Chặn hai thứ khác nhau bằng cùng một con số:
 *
 *  1. **Dò danh sách email.** `/dang-ky` trả lời thẳng "email này đã được dùng" —
 *     lý lẽ đầy đủ ở `registerParent` bên dưới. Một người dò một email không phải
 *     vấn đề; dò mười nghìn email mới là, và trần này biến việc đó thành nhiều tháng.
 *  2. **Tạo tài khoản hàng loạt**, và cái này nặng hơn: mỗi lượt đăng ký là một lượt
 *     băm scrypt, mà scrypt có semaphore 4 và hàng chờ 32 (`lib/password.ts`). Bơm
 *     đăng ký là làm đầy hàng chờ, rồi người thật đang đăng nhập nhận
 *     `ScryptBusyError` — một script rẻ tiền khoá được cả trang.
 *
 * 60 chứ không phải 10: cả một lớp học hay cả một nhà đi chung một IP, và đây là
 * trần cho MỌI người sau NAT đó cộng lại.
 */
export const REGISTRATIONS_PER_IP_PER_HOUR = 60;

const normalizeEmail = (raw: string) => raw.trim().toLowerCase();
const normalizeUsername = (raw: string) => raw.trim().toLowerCase();

// --- Phụ huynh ---------------------------------------------------------------

/** Trả về id phụ huynh vừa tạo, để tầng gọi còn gửi mail xác minh. */
export async function registerParent(emailRaw: string, password: string): Promise<string> {
  const email = normalizeEmail(emailRaw);

  // Cố tình kiểm rất nhẹ: mọi regex email đều sai ở đâu đó, và ở đây không cần
  // đúng tuyệt đối. Xác thực thật nằm ở mail xác minh (M2.5, xem account.ts).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new AuthError('Email không hợp lệ.');
  }

  const problem = checkParentPassword(password);
  if (problem) throw new AuthError(problem.message);

  const existing = await prisma.parent.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    /*
     * NÓI THẲNG là email đã có tài khoản, cố ý. Cách này để người ngoài thăm dò được
     * email nào đã đăng ký, và đó là đánh đổi đã cân:
     *
     * Cách che thông tin đó là trả lời y như đăng ký thành công rồi gửi thư "bạn đã
     * có tài khoản, đây là link đặt lại mật khẩu". Nhưng cách ấy chỉ an toàn khi thư
     * CHẮC CHẮN tới, mà mail thật của dự án còn chưa dựng — làm bây giờ thì phụ
     * huynh nhập lại email cũ (chuyện rất hay xảy ra, vì họ quên đã đăng ký) sẽ thấy
     * "thành công", không có tài khoản nào được tạo, mật khẩu mới không dùng được, và
     * không có thư nào để hiểu vì sao. Mắc kẹt hoàn toàn, im lặng.
     *
     * Cái thật sự phải chặn không phải một người dò một email, mà là dò cả một danh
     * sách — chỗ đó đã siết bằng trần theo IP ở `registerParentAction`.
     *
     * ĐÃ XEM LẠI khi mail thật chạy được (3/9), và GIỮ NGUYÊN câu trả lời thẳng.
     * Phương án "trả lời y như thành công rồi gửi thư" chỉ che được thông tin nếu
     * hai nhánh cho ra cùng một kết quả quan sát được từ ngoài — mà nhánh thành
     * công hiện mở phiên và chuyển sang /phu-huynh, nên người dò vẫn phân biệt được
     * bằng đúng một cái nhìn. Che thật thì phải bỏ luôn việc tự đăng nhập sau khi
     * đăng ký, tức MỌI phụ huynh phải mở hòm thư trước khi vào được. Cái giá đó lớn
     * hơn giá trị che một thông tin mà GitHub và Google cũng để lộ ở form đăng ký.
     *
     * Việc đã thêm là gửi cho chủ hòm thư một lá thư nhắc kèm link đặt lại mật khẩu
     * (xem `registerParentAction`): phần hữu ích của phương án kia, không kèm cái
     * giá của nó. Người gõ lại email cũ vì quên mình đã đăng ký giờ có đường ra
     * ngay trong hòm thư, chứ không phải đọc một câu rồi tự đi tìm.
     */
    throw new AuthError(
      'Email này đã được dùng để đăng ký rồi. Bạn đăng nhập, hoặc bấm "Quên mật khẩu" nếu không nhớ.',
      'EMAIL_DA_DUNG'
    );
  }

  const parent = await prisma.parent.create({
    data: { email, passwordHash: await hashPassword(password) },
  });

  await createSession({ parentId: parent.id });
  return parent.id;
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

/**
 * Tạo tài khoản cho con — CHỈ khi email của phụ huynh đã xác minh.
 *
 * Vì sao chặn ĐÚNG ở đây, chứ không phải ở lúc đăng nhập:
 *
 *  - Chính hành động này là cơ chế đồng ý của người đại diện (Nghị định 13/2023,
 *    COPPA). Một sự đồng ý gắn với hòm thư chưa ai chứng minh là đọc được thì gần
 *    như không có giá trị: bất kỳ ai cũng gõ được email của người khác vào form đăng
 *    ký rồi tạo tài khoản cho một đứa trẻ.
 *  - Nó cũng là chỗ duy nhất chặn được mà KHÔNG khoá ai ra khỏi thứ gì. Chặn ở lúc
 *    đăng nhập thì một lá mail rơi vào thư rác là cả gia đình mất quyền vào tài
 *    khoản; chặn ở các thao tác an toàn (khoá tài khoản con, ẩn game của con) thì tệ
 *    hơn nữa — đó là những việc phải làm được NGAY, không đợi hòm thư.
 *  - Và nó làm lớp tự động của phần kiểm duyệt sống lại: ngưỡng báo cáo chỉ đếm phụ
 *    huynh đã xác minh, nên nếu không có cổng này thì gần như không ai xác minh và
 *    ngưỡng đó gần như không bao giờ nổ.
 *
 * Kiểm ở tầng lib, không ở route: đường nào sau này tạo tài khoản con (nhập theo
 * lớp học, API cho trường) cũng tự thừa hưởng. Đặt ở tầng route là để quên.
 */
export async function createChild(input: CreateChildInput): Promise<string> {
  const parent = await prisma.parent.findUnique({
    where: { id: input.parentId },
    select: { emailVerifiedAt: true },
  });
  if (!parent) throw new AuthError('Không tìm thấy tài khoản phụ huynh.');
  if (!parent.emailVerifiedAt) {
    throw new AuthError(
      'Bạn cần xác minh email trước khi tạo tài khoản cho con. Kiểm tra hòm thư của bạn, hoặc bấm "Gửi lại thư xác minh" ở trên.'
    );
  }

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
