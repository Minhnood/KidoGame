import Link from 'next/link';
import { ButtonLink } from './button';
import { logoutAction } from '@/lib/actions';
import { getActor } from '@/lib/session';

/**
 * Thanh điều hướng thay đổi theo người đang đăng nhập.
 *
 * Ba trạng thái có chủ đích khác nhau:
 *  - Chưa đăng nhập: mời đăng nhập, KHÔNG mời "Đăng game" — bấm vào sẽ bị chặn
 *    và đó là trải nghiệm tệ.
 *  - Là bé: nổi bật nút "Đăng game", vì đó là việc bé vào đây để làm.
 *  - Là phụ huynh: đưa về trang quản lý. Phụ huynh KHÔNG đăng game hộ con —
 *    game phải gắn với tài khoản của bé.
 */
export async function SiteNav() {
  const actor = await getActor();

  return (
    <nav className="flex flex-wrap items-center gap-2 sm:gap-3">
      {actor?.kind === 'child' && (
        <>
          <span className="hidden text-sm text-chrome-ink/70 sm:inline">Xin chào {actor.displayName}</span>
          <ButtonLink href="/upload">Đăng game</ButtonLink>
        </>
      )}

      {actor?.kind === 'parent' && (
        <ButtonLink href="/phu-huynh" variant="ghost" className="!border-chrome-ink/25 !text-chrome-ink">
          Trang của bố mẹ
        </ButtonLink>
      )}

      {actor?.kind === 'parent' && actor.isAdmin && (
        <Link
          href="/admin"
          data-testid="nav-admin"
          className="min-h-touch inline-flex items-center px-2 font-semibold text-chrome-ink/80 no-underline hover:text-chrome-ink"
        >
          Kiểm duyệt
        </Link>
      )}

      {actor ? (
        <form action={logoutAction}>
          <button
            type="submit"
            data-testid="logout"
            className="min-h-touch cursor-pointer rounded-full border-0 bg-transparent px-3 font-semibold text-chrome-ink/80 hover:text-chrome-ink"
          >
            Đăng xuất
          </button>
        </form>
      ) : (
        <>
          <Link
            href="/dang-nhap"
            className="min-h-touch inline-flex items-center px-2 font-semibold text-chrome-ink/80 no-underline hover:text-chrome-ink"
          >
            Bố mẹ
          </Link>
          <ButtonLink href="/be-dang-nhap">Bé đăng nhập</ButtonLink>
        </>
      )}
    </nav>
  );
}
