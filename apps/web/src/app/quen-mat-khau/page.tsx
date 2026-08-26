import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { Field, TextInput } from '@/components/field';
import { PageTitle } from '@/components/page';
import { requestPasswordResetAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <>
      <PageTitle
        title="Quên mật khẩu"
        lead="Nhập email bạn đã dùng để đăng ký. Chúng tôi sẽ gửi link đặt lại mật khẩu."
      />

      {/*
        Thông báo thành công CỐ TÌNH không nói email có tồn tại hay không — cùng
        một câu cho mọi trường hợp. Nói khác đi là biến form này thành công cụ dò
        xem ai đã đăng ký KidoGame.
      */}
      <AuthForm
        action={requestPasswordResetAction}
        submitLabel="Gửi link đặt lại"
        busyLabel="Đang gửi…"
        successMessage="Nếu email này có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu. Kiểm tra hòm thư nhé — link có hiệu lực trong 1 giờ."
      >
        <Field id="email" label="Email">
          <TextInput id="email" name="email" type="email" autoComplete="email" required />
        </Field>
      </AuthForm>

      <p className="mb-12 text-ink-soft">
        Nhớ ra mật khẩu rồi?{' '}
        <Link href="/dang-nhap" className="font-bold text-accent-dark">
          Đăng nhập
        </Link>
      </p>
    </>
  );
}
