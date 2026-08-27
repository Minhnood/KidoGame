import Link from 'next/link';
import { verifyEmail } from '@/lib/account';
import { AuthError } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getActor } from '@/lib/session';
import { Notice } from '@/components/notice';
import { PageTitle } from '@/components/page';
import { ButtonLink } from '@/components/button';

export const dynamic = 'force-dynamic';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let error: string | null = null;
  let ok = false;

  if (!token) {
    error = 'Link không hợp lệ — thiếu mã xác nhận.';
  } else {
    try {
      await verifyEmail(token);
      ok = true;
    } catch (e) {
      error = e instanceof AuthError ? e.message : 'Có lỗi xảy ra, thử lại sau nhé.';
    }
  }

  /*
   * Token chỉ dùng được một lần, mà trình quét link của nhiều hòm thư sẽ tự mở
   * link trước cả người dùng. Khi đó email THỰC SỰ đã được xác minh, nhưng người
   * dùng bấm vào lại thấy báo lỗi và tưởng hỏng. Nên nếu tài khoản đang đăng nhập
   * đã xác minh rồi thì coi như thành công.
   */
  if (error) {
    const actor = await getActor();
    if (actor?.kind === 'parent') {
      const parent = await prisma.parent.findUnique({
        where: { id: actor.id },
        select: { emailVerifiedAt: true },
      });
      if (parent?.emailVerifiedAt) {
        error = null;
        ok = true;
      }
    }
  }

  return (
    <>
      <PageTitle title="Xác minh email" />

      <div className="mb-6 max-w-125">
        {ok ? (
          <Notice tone="info" role="status">
            Email đã được xác minh. Từ giờ nếu quên mật khẩu, bạn lấy lại được qua email này.
          </Notice>
        ) : (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
      </div>

      <div className="mb-12">
        {ok ? (
          <ButtonLink href="/phu-huynh">Về trang của bố mẹ</ButtonLink>
        ) : (
          <p className="text-ink-soft">
            Vào{' '}
            <Link href="/phu-huynh" className="font-bold text-accent-text underline">
              trang của bố mẹ
            </Link>{' '}
            để bấm gửi lại link mới.
          </p>
        )}
      </div>
    </>
  );
}
