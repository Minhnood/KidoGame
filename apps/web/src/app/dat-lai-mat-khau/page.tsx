import { LinkCho } from '@/components/link-cho';
import { AuthForm } from '@/components/auth-form';
import { Field, TextInput } from '@/components/field';
import { Notice } from '@/components/notice';
import { FormColumn, PageTitle } from '@/components/page';
import { resetPasswordAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  /*
   * KHÔNG kiểm token ở đây, chỉ kiểm lúc submit.
   *
   * Kiểm ngay khi mở trang thì phải đọc và đánh dấu token, mà trình quét link của
   * hòm thư cũng mở trang này — token sẽ bị tiêu trước khi người dùng kịp bấm.
   */
  if (!token) {
    return (
      <FormColumn>
        <PageTitle title="Đặt lại mật khẩu" />
        <div className="mb-12">
          <Notice tone="error" role="alert">
            Link không hợp lệ — thiếu mã xác nhận. Hãy mở đúng link trong email, hoặc{' '}
            <LinkCho href="/quen-mat-khau">yêu cầu link mới</LinkCho>.
          </Notice>
        </div>
      </FormColumn>
    );
  }

  return (
    <FormColumn>
      <PageTitle title="Đặt lại mật khẩu" lead="Đặt mật khẩu mới cho tài khoản phụ huynh." />

      <AuthForm action={resetPasswordAction} submitLabel="Đổi mật khẩu" busyLabel="Đang đổi…">
        <input type="hidden" name="token" value={token} />
        <Field
          id="password"
          label="Mật khẩu mới"
          hint="Ít nhất 10 ký tự. Chọn câu gì đó dễ nhớ với bạn nhưng người khác khó đoán."
        >
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>
      </AuthForm>

      <p className="mb-12 text-ink-soft">
        Đổi xong, mọi thiết bị đang đăng nhập tài khoản này sẽ phải đăng nhập lại. Tài khoản của
        các bé không bị ảnh hưởng.
      </p>
    </FormColumn>
  );
}
