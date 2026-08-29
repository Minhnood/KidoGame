import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { Field, TextInput } from '@/components/field';
import { FormColumn, PageTitle } from '@/components/page';
import { registerParentAction } from '@/lib/actions';
import { getActor } from '@/lib/session';

export default async function RegisterPage() {
  // Đã đăng nhập rồi thì không cần xem trang này nữa.
  const actor = await getActor();
  if (actor?.kind === 'parent') redirect('/phu-huynh');
  if (actor?.kind === 'child') redirect('/');

  return (
    <FormColumn>
      <PageTitle
        title="Đăng ký cho phụ huynh"
        lead="Bố mẹ đăng ký tài khoản trước, rồi tạo tài khoản riêng cho từng bé."
      />

      <AuthForm action={registerParentAction} submitLabel="Đăng ký" busyLabel="Đang đăng ký…">
        <Field id="email" label="Email của bố mẹ">
          <TextInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="bome@email.com"
          />
        </Field>

        <Field id="password" label="Mật khẩu" hint="Ít nhất 10 ký tự.">
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
          />
        </Field>
      </AuthForm>

      <p className="mb-12 text-ink-soft">
        Đã có tài khoản?{' '}
        <Link href="/dang-nhap" className="font-bold text-accent-text underline">
          Đăng nhập
        </Link>
      </p>
    </FormColumn>
  );
}
