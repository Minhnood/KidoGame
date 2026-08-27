import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { Field, TextInput } from '@/components/field';
import { Notice } from '@/components/notice';
import { PageTitle } from '@/components/page';
import { loginParentAction } from '@/lib/actions';
import { getActor } from '@/lib/session';

export default async function LoginParentPage({
  searchParams,
}: {
  searchParams: Promise<{ 'dat-lai'?: string }>;
}) {
  const actor = await getActor();
  if (actor?.kind === 'parent') redirect('/phu-huynh');
  if (actor?.kind === 'child') redirect('/');

  const justReset = (await searchParams)['dat-lai'] === 'xong';

  return (
    <>
      <PageTitle title="Đăng nhập cho phụ huynh" />

      {justReset && (
        <div className="mb-5 max-w-125">
          <Notice tone="info" role="status">
            Đã đổi mật khẩu xong. Đăng nhập lại bằng mật khẩu mới nhé.
          </Notice>
        </div>
      )}

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
        <Link href="/quen-mat-khau" className="font-bold text-accent-text underline">
          Quên mật khẩu?
        </Link>
        {' · '}
        Bé đăng nhập để đăng game?{' '}
        <Link href="/be-dang-nhap" className="font-bold text-accent-text underline">
          Vào đây
        </Link>
        {' · '}
        Chưa có tài khoản?{' '}
        <Link href="/dang-ky" className="font-bold text-accent-text underline">
          Đăng ký
        </Link>
      </p>
    </>
  );
}
