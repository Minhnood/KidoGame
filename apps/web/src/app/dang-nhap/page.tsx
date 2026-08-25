import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { Field, TextInput } from '@/components/field';
import { PageTitle } from '@/components/page';
import { loginParentAction } from '@/lib/actions';
import { getActor } from '@/lib/session';

export default async function LoginParentPage() {
  const actor = await getActor();
  if (actor?.kind === 'parent') redirect('/phu-huynh');
  if (actor?.kind === 'child') redirect('/');

  return (
    <>
      <PageTitle title="Đăng nhập cho phụ huynh" />

      <AuthForm action={loginParentAction} submitLabel="Đăng nhập" busyLabel="Đang đăng nhập…">
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

      <p className="mb-12 text-ink-soft">
        Bé đăng nhập để đăng game?{' '}
        <Link href="/be-dang-nhap" className="font-bold text-accent-dark">
          Vào đây
        </Link>
        {' · '}
        Chưa có tài khoản?{' '}
        <Link href="/dang-ky" className="font-bold text-accent-dark">
          Đăng ký
        </Link>
      </p>
    </>
  );
}
