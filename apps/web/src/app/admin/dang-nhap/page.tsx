import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { Field, TextInput } from '@/components/field';
import { Notice } from '@/components/notice';
import { adminLoginAction } from '@/lib/actions';
import { getAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Cửa vào khu quản trị, trên origin riêng của nó.
 *
 * VÌ SAO CÓ CỬA RIÊNG thay vì tiếp tục dùng `/dang-nhap` của site: đăng nhập ở đó
 * phát ra phiên site, và phiên site không mở được khu này nữa (`Session.scope`). Đó
 * là toàn bộ điểm của việc tách — hai cửa, hai phiên, hai cookie trên hai host.
 *
 * KHÔNG dùng `AdminLayout`: layout đó đòi có phiên quản trị rồi mới vẽ, nên trang
 * này nằm trong nó là một vòng lặp — chưa đăng nhập thì bị đẩy về đây, mà vào đây
 * lại bị đòi đăng nhập. Next giải bằng route group `(cong)` bên dưới thì phức tạp
 * hơn cần thiết cho một trang; ở đây chỉ cần layout không bọc, và cách rẻ nhất là
 * `AdminLayout` tự bỏ qua đúng đường dẫn này.
 *
 * Cùng một email và mật khẩu với tài khoản phụ huynh, cố ý. Người quản trị của
 * KidoGame cũng là một phụ huynh trên site — tách thành hai bộ mật khẩu là buộc họ
 * nhớ hai thứ, và bộ ít dùng hơn sẽ là bộ bị ghi vào một tờ giấy.
 */
export default async function AdminLoginPage() {
  if (await getAdmin()) redirect('/admin');

  return (
    <div className="mx-auto w-full max-w-112 px-5 py-16">
      <h1 className="mb-2 text-3xl font-extrabold tracking-tight">KidoGame quản trị</h1>
      <p className="mb-6 text-ink-soft">
        Khu này dành cho người kiểm duyệt. Dùng email và mật khẩu tài khoản phụ huynh của bạn.
      </p>

      <AuthForm action={adminLoginAction} submitLabel="Vào khu quản trị" busyLabel="Đang vào…">
        <Field id="email" label="Email">
          <TextInput id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field id="password" label="Mật khẩu">
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
      </AuthForm>

      <div className="mt-6">
        <Notice tone="info">
          Phiên quản trị hết hiệu lực sau <strong>24 giờ</strong>, ngắn hơn phiên bình thường —
          khu này mở ra quyền ẩn game của người khác, nên một máy bỏ quên không nên còn đăng nhập
          vào tuần sau.
        </Notice>
      </div>
    </div>
  );
}
