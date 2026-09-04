import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdmin } from '@/lib/session';
import { prisma } from '@/lib/db';
import { appOrigin } from '@/lib/mail';
import { AdminNav } from './admin-nav';
import { adminLogoutAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

/**
 * Khung riêng của khu quản trị.
 *
 * VÌ SAO TÁCH KHỎI KHUNG SITE. Thanh điều hướng, tranh đồi cây và chân trang được
 * dựng cho trẻ em và bố mẹ: chữ to, màu tươi, cột nội dung 1024px. Việc của người
 * quản trị ngược lại — đọc danh sách dài, so số đếm, bấm nút khó đảo. Đặt nó giữa
 * mấy cái cây làm cả hai chuyện cùng dở đi: danh sách bị bó vào 1024px trong khi
 * cần cả bề ngang, còn cái cây thì nằm cạnh một nút "Gỡ hẳn".
 *
 * Layout gốc vẫn giữ `<html>`, `<body>`, font và script chống loé giao diện — đó là
 * hạ tầng của mọi trang. Nó nhận biết khu này qua header `x-pathname` do middleware
 * đặt vào; xem chú thích trong `app/layout.tsx`.
 *
 * KIỂM QUYỀN Ở ĐÂY **VÀ** Ở TỪNG TRANG, cố ý lặp. Layout của Next KHÔNG chạy lại
 * trên mọi lần điều hướng phía client — nó được giữ nguyên giữa các trang cùng một
 * layout. Nên một layout đóng vai người giữ cửa duy nhất là một người giữ cửa có
 * lúc ngủ. Ở đây nó chỉ để không phải vẽ khung cho người không có quyền; quyết định
 * thật vẫn nằm trong từng trang.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  /*
   * Trang đăng nhập KHÔNG được bọc khung này, và phải kiểm trước mọi thứ khác.
   *
   * Khung dưới đây đòi có phiên quản trị rồi mới vẽ được, nên nếu nó bọc luôn cửa
   * vào thì thành một vòng lặp: chưa đăng nhập bị đẩy về `/admin/dang-nhap`, mà vào
   * đó lại bị đòi đăng nhập. Đọc `x-pathname` do middleware đặt vào — cùng cái header
   * layout gốc đang dùng, vì server component không tự đọc được pathname.
   */
  const pathname = (await headers()).get('x-pathname') ?? '';
  if (pathname === '/admin/dang-nhap') return <>{children}</>;

  /*
   * PHIÊN QUẢN TRỊ, không phải phiên site. Đây là chỗ việc tách origin thành thật:
   * một phụ huynh có `isAdmin` đang đăng nhập ở site KHÔNG vào được đây, họ phải
   * đăng nhập lần nữa ở cửa này để nhận một phiên khác trên một cookie khác.
   */
  const admin = await getAdmin();
  if (!admin) redirect('/admin/dang-nhap');

  /*
   * Số đếm cho thanh điều hướng: việc đang chờ ở mỗi mục.
   *
   * Đặt Ở LAYOUT chứ không ở từng trang, để đứng ở trang nào cũng thấy mục kia còn
   * gì. Trước đây chỉ `/admin` mới biết số nhóm lỗi, nên đang xem trang lỗi thì
   * không biết hàng đợi bản quyền vừa có thêm yêu cầu.
   */
  const [soYeuCauGo, soNhomLoi] = await Promise.all([
    prisma.takedownRequest.count({ where: { status: 'OPEN' } }),
    prisma.errorLog.count({ where: { resolvedAt: null } }),
  ]);

  return (
    /*
     * `min-h-0 flex-1` chứ không `min-h-screen`: khối này nằm trong `<main class="flex-1">`
     * của layout gốc, vốn đã là một ô flex cao hết màn hình. Đặt lại chiều cao màn
     * hình ở đây là cộng dồn hai lần và trang có một dải trống cuối.
     */
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      {/*
        Thanh quản trị: MỘT lớp màu đặc, không chuyển sắc, không lá, không vệt sáng.
        Thanh của site có ba lớp nền và một nhánh lá vì nó phải mời một đứa trẻ vào;
        thanh này thì việc của nó là đứng yên và không kéo mắt khỏi danh sách bên dưới.
      */}
      <header className="border-b border-border bg-nav-1 text-chrome-ink">
        <div className="mx-auto flex w-full max-w-400 flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <p className="text-lg font-extrabold tracking-tight">
            KidoGame{' '}
            <span className="font-semibold text-chrome-ink/60">quản trị</span>
          </p>

          <AdminNav soYeuCauGo={soYeuCauGo} soNhomLoi={soNhomLoi} />

          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="hidden text-chrome-ink/60 sm:inline" data-testid="admin-who">
              {admin.email}
            </span>
            {/*
              "Về site" không nằm trong nhóm tab bên trái — trộn vào đó là một tab dẫn
              đi mất, và mắt phải đọc chữ mới biết tab nào là tab nào.

              Link TUYỆT ĐỐI sang app origin, không phải `href="/"`.
              Trên admin origin, `/` bị middleware trả 404 — đó chính là điều làm
              origin này chỉ phục vụ khu quản trị. Nên đường về site phải nêu rõ host,
              và `<a>` chứ không `<Link>`: đây là điều hướng sang một origin khác,
              không phải một route của app này.
            */}
            <a
              href={appOrigin()}
              className="text-chrome-ink/80 underline-offset-2 hover:underline"
              data-testid="admin-ve-site"
            >
              Về site
            </a>
            <form action={adminLogoutAction}>
              <button
                type="submit"
                data-testid="admin-logout"
                className="cursor-pointer border-0 bg-transparent text-chrome-ink/80 underline-offset-2 hover:underline"
              >
                Đăng xuất
              </button>
            </form>
          </div>
        </div>
      </header>

      {/*
        `max-w-400` = 1600px, rộng hơn hẳn 1024px của site.
        Không bỏ trần hẳn: trên màn 2560 một bảng chạy suốt bề ngang thì mắt mất dòng
        khi đi từ ảnh game sang cột nút ở tận mép phải.
      */}
      <div className="mx-auto w-full max-w-400 flex-1 px-5 pb-16">{children}</div>
    </div>
  );
}
