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
/*
 * Kiểu chung của các mục CHỮ trên thanh điều hướng — "Bố mẹ", "Kiểm duyệt",
 * "Đăng xuất", và nút đổi giao diện dùng lại y hệt.
 *
 * Điểm đổi so với bản cũ: khi trỏ chuột vào, mục hiện ra một NỀN bo tròn chứ không
 * chỉ đậm chữ lên. Đậm chữ là thay đổi 20% độ mờ của mấy chục pixel chữ — trên nền
 * tối gần như không thấy, nên các mục này trông như chữ chết chứ không phải chỗ bấm
 * được. Cả thanh đã toàn hình viên thuốc (nút cam, nút ghost), nên nền hover cũng
 * bo tròn thì hover ra đúng hình dạng của thứ nó sắp thành.
 *
 * Nền là token `chrome-lift`, không phải `bg-chrome-ink/10`: nền pha alpha thì
 * `contrast-check` không đo được — xem ghi chú ở token trong `globals.css`.
 */
const MUC_CHU =
  'min-h-touch inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 ' +
  'font-semibold text-chrome-ink/80 no-underline transition-colors ' +
  'hover:bg-chrome-lift hover:text-chrome-ink sm:px-3';

export async function SiteNav() {
  const actor = await getActor();

  return (
    /*
     * `flex-nowrap`, KHÔNG phải `flex-wrap`.
     *
     * Trên màn 390px, bản cũ để "Bố mẹ" rơi xuống dòng riêng còn logo tụt xuống dòng
     * dưới — thanh điều hướng cao gấp đôi và trông như vỡ. Ở đây thà chật một chút
     * còn hơn xuống dòng, nên các mục tự thu padding trên máy nhỏ thay vì gãy hàng.
     */
    <nav className="flex flex-nowrap items-center gap-1 sm:gap-3">
      {actor?.kind === 'child' && (
        <>
          <span className="hidden text-sm text-chrome-ink/70 sm:inline">Xin chào {actor.displayName}</span>
          <ButtonLink href="/upload">Đăng game</ButtonLink>
        </>
      )}

      {actor?.kind === 'parent' && (
        /*
         * `hover:bg-chrome-lift!` là một BẢN SỬA LỖI, không phải trang trí.
         *
         * Biến thể `ghost` sinh ra cho nền SÁNG: nó có `hover:bg-surface`, tức nền
         * gần trắng. Ở đây nó nằm trên thanh tối nên chữ bị ép sang `chrome-ink`
         * cũng gần trắng — trỏ chuột vào là chữ trắng trên nền trắng, nút "Trang
         * của bố mẹ" biến thành một viên thuốc trống. Chỉ phụ huynh đã đăng nhập
         * mới thấy được, nên nó sống sót qua mọi lần xem trang chủ.
         */
        <ButtonLink
          href="/phu-huynh"
          variant="ghost"
          className="border-chrome-ink/25! text-chrome-ink! hover:bg-chrome-lift!"
        >
          Trang của bố mẹ
        </ButtonLink>
      )}

      {/*
        KHÔNG có link tới khu quản trị ở đây, cố ý — trước đây có, và đã bỏ.

        Thanh này là thanh của trẻ em và bố mẹ. Một mục "Kiểm duyệt" trên đó nói cho
        mọi người biết khu quản trị nằm ở đâu, kể cả những người không vào được, và
        nó chỉ tiết kiệm cho đúng một người: người quản trị, người vốn biết đường.
        Khu quản trị có thanh điều hướng riêng (`app/admin/layout.tsx`), vào bằng
        đường dẫn `/admin`.
      */}

      {actor ? (
        <form action={logoutAction}>
          <button
            type="submit"
            data-testid="logout"
            className={`${MUC_CHU} cursor-pointer border-0 bg-transparent`}
          >
            Đăng xuất
          </button>
        </form>
      ) : (
        <>
          <Link href="/dang-nhap" className={MUC_CHU}>
            Bố mẹ
          </Link>
          {/*
            Quầng cam quanh nút, CHỈ ở đây chứ không sửa vào `variant="primary"`.
            Nút cam trên nền tím đêm thì quầng sáng cùng màu làm nó nổi hẳn lên như
            đang phát sáng; nhưng cũng chính cái nút ấy còn dùng ở giữa trang, trên
            nền kem sáng — quầng cam trên nền kem chỉ là một vệt mờ bẩn quanh nút.
            Cùng một hiệu ứng, một nền thì đẹp một nền thì hỏng, nên nó thuộc về CHỖ
            ĐẶT nút, không thuộc về cái nút.
          */}
          <ButtonLink
            href="/be-dang-nhap"
            className="shadow-lg shadow-accent/25 hover:shadow-accent/40"
          >
            Bé đăng nhập
          </ButtonLink>
        </>
      )}
    </nav>
  );
}
