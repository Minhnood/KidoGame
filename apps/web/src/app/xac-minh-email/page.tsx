import { LinkCho } from '@/components/link-cho';
import { verifyEmail } from '@/lib/account';
import { AuthError } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getActor } from '@/lib/session';
import { Notice } from '@/components/notice';
import { FormColumn, PageTitle } from '@/components/page';
import { ButtonLink } from '@/components/button';
import { GocCo, THE_FORM } from '@/components/card';

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
    <FormColumn>
      <PageTitle title="Xác minh email" />

      {ok ? (
        /*
         * Thành công là một THẺ, không phải hộp `Notice`: hộp ℹ️ xám là giọng của một
         * thông báo trung tính, đọc lướt không ra là việc đã xong. Nút nằm TRONG thẻ để
         * lời báo và lối đi tiếp là một cụm, không phải hai thứ đứng rời nhau.
         */
        <div role="status" className={`${THE_FORM} text-center`}>
          <GocCo />
          <DauTich />
          <h2 className="mt-4 text-xl font-extrabold">Email đã được xác minh!</h2>
          <p className="mx-auto mt-2 max-w-90 text-ink-soft">
            Từ giờ nếu quên mật khẩu, bạn lấy lại được qua email này.
          </p>
          <ButtonLink href="/phu-huynh" size="lg" className="mt-6">
            Về trang của bố mẹ
          </ButtonLink>
        </div>
      ) : (
        <div className="mb-12">
          <Notice tone="error" role="alert">
            {error}
          </Notice>
          <p className="mt-4 text-ink-soft">
            Vào{' '}
            <LinkCho href="/phu-huynh" className="font-bold text-accent-text underline">
              trang của bố mẹ
            </LinkCho>{' '}
            để bấm gửi lại link mới.
          </p>
        </div>
      )}
    </FormColumn>
  );
}

/**
 * Vòng tròn dấu tích. Cặp màu `accent` nền + `chrome` nét là đúng cặp của nút chính,
 * đã có trong `contrast-check` — không thêm cặp màu mới nào phải đo.
 */
function DauTich() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent text-chrome shadow-sm"
    >
      <svg viewBox="0 0 24 24" className="size-9" fill="none">
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
