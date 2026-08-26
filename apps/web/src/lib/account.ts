import { AuthError } from './auth';
import { prisma } from './db';
import { appOrigin, sendMail } from './mail';
import { checkParentPassword, hashPassword } from './password';
import { revokeAllSessions } from './session';
import { consumeAuthToken, createAuthToken } from './tokens';

/*
 * Xác minh email và quên mật khẩu (M2.5).
 *
 * Để riêng khỏi `auth.ts` để tránh vòng import: `tokens.ts` cần `AuthError` từ
 * `auth.ts`, nên `auth.ts` không được phép import ngược lại `tokens.ts`.
 */

const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

// --- Xác minh email ----------------------------------------------------------

export async function requestEmailVerification(parentId: string): Promise<void> {
  const parent = await prisma.parent.findUnique({
    where: { id: parentId },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!parent) throw new AuthError('Không tìm thấy tài khoản.');
  if (parent.emailVerifiedAt) return; // đã xác minh rồi, không gửi lại làm gì

  const token = await createAuthToken(parentId, 'EMAIL_VERIFY');
  const link = `${appOrigin()}/xac-minh-email?token=${encodeURIComponent(token)}`;

  await sendMail({
    to: parent.email,
    subject: 'Xác minh email cho tài khoản KidoGame',
    text: [
      'Chào bạn,',
      '',
      'Bấm vào link dưới đây để xác minh email cho tài khoản KidoGame của bạn:',
      '',
      link,
      '',
      'Link có hiệu lực trong 24 giờ.',
      '',
      'Nếu bạn không đăng ký KidoGame thì bỏ qua thư này là được.',
    ].join('\n'),
  });
}

export async function verifyEmail(rawToken: string): Promise<void> {
  const parentId = await consumeAuthToken(rawToken, 'EMAIL_VERIFY');
  await prisma.parent.update({
    where: { id: parentId },
    data: { emailVerifiedAt: new Date() },
  });
}

// --- Quên mật khẩu -----------------------------------------------------------

/**
 * Xin link đặt lại mật khẩu.
 *
 * KHÔNG BAO GIỜ tiết lộ email có tồn tại hay không. Tầng gọi luôn hiện đúng một
 * câu "nếu email này có tài khoản thì thư đã được gửi", dù ở đây không làm gì cả.
 * Báo "email không tồn tại" là biến form này thành công cụ dò xem ai đã đăng ký.
 *
 * Lỗi gửi mail cũng bị nuốt vì lý do tương tự: gửi trượt mà báo lỗi ra màn hình
 * thì cũng là một tín hiệu phân biệt được email có thật.
 */
export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const email = normalizeEmail(emailRaw);
  const parent = await prisma.parent.findUnique({ where: { email }, select: { id: true } });
  if (!parent) return;

  try {
    const token = await createAuthToken(parent.id, 'PASSWORD_RESET');
    const link = `${appOrigin()}/dat-lai-mat-khau?token=${encodeURIComponent(token)}`;

    await sendMail({
      to: email,
      subject: 'Đặt lại mật khẩu KidoGame',
      text: [
        'Chào bạn,',
        '',
        'Có người vừa yêu cầu đặt lại mật khẩu cho tài khoản KidoGame này.',
        'Bấm vào link dưới đây để đặt mật khẩu mới:',
        '',
        link,
        '',
        'Link có hiệu lực trong 1 giờ và chỉ dùng được một lần.',
        '',
        'Nếu không phải bạn yêu cầu thì bỏ qua thư này — mật khẩu hiện tại vẫn giữ nguyên.',
      ].join('\n'),
    });
  } catch (e) {
    // Kể cả khi vượt hạn mức xin token hay nhà cung cấp mail lỗi: im lặng với
    // người dùng, nhưng phải log để còn biết mà sửa.
    console.error('[account] không gửi được mail đặt lại mật khẩu:', e);
  }
}

/**
 * Đặt mật khẩu mới bằng token trong link.
 *
 * Thu hồi MỌI phiên của phụ huynh đó. Nếu ai đó đã chiếm được tài khoản, việc đổi
 * mật khẩu phải đá họ ra ngay chứ không để phiên cũ sống tiếp.
 *
 * KHÔNG đụng tới phiên của các bé: bố mẹ đổi mật khẩu của mình thì không có lý do
 * gì bắt con đăng nhập lại.
 */
export async function resetPasswordWithToken(rawToken: string, password: string): Promise<void> {
  const problem = checkParentPassword(password);
  if (problem) throw new AuthError(problem.message);

  const parentId = await consumeAuthToken(rawToken, 'PASSWORD_RESET');

  await prisma.parent.update({
    where: { id: parentId },
    data: {
      passwordHash: await hashPassword(password),
      /*
       * Đặt lại mật khẩu qua mail cũng chứng minh người đó đọc được hòm thư —
       * đúng điều mà xác minh email cần chứng minh. Không tận dụng thì lại bắt
       * họ bấm thêm một link nữa cho cùng một việc.
       */
      emailVerifiedAt: new Date(),
    },
  });

  await revokeAllSessions({ parentId });
}
