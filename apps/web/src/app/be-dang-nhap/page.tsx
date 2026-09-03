import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { Field, TextInput } from '@/components/field';
import { FormColumn, PageTitle } from '@/components/page';
import { loginChildAction } from '@/lib/actions';
import { getActor } from '@/lib/session';

export default async function LoginChildPage() {
  if (await getActor()) redirect('/');

  return (
    <FormColumn>
      <PageTitle
        title="Bé đăng nhập"
        lead="Dùng tên đăng nhập và mật khẩu mà bố mẹ đã tạo cho bé nhé."
      />

      <AuthForm action={loginChildAction} submitLabel="Vào chơi" busyLabel="Đang vào…">
        <Field id="username" label="Tên đăng nhập của bé">
          <TextInput
            id="username"
            name="username"
            autoComplete="username"
            required
            placeholder="beminh"
            /* Điện thoại hay tự viết hoa chữ đầu và tự sửa chính tả -> tắt hết,
               không thì bé gõ "Beminh" và không đăng nhập được. */
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
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
        Bố mẹ đăng nhập{' '}
        <Link href="/dang-nhap" className="font-bold text-accent-text underline">
          ở đây
        </Link>
        .
      </p>
    </FormColumn>
  );
}
