import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { Field, TextInput } from '@/components/field';
import { FormColumn, PageTitle } from '@/components/page';
import { loginChildAction } from '@/lib/actions';
import { getActor } from '@/lib/session';
import { OTenBe } from './o-ten-be';

export default async function LoginChildPage({
  searchParams,
}: {
  searchParams: Promise<{ ten?: string }>;
}) {
  if (await getActor()) redirect('/');

  /*
   * `?ten=` do nút "Cho bé đăng nhập trên máy này" ở trang bố mẹ gửi sang, để bé chỉ phải
   * gõ mật khẩu. Chỉ nhận đúng dạng tên đăng nhập (cùng luật với `createChild`): link này
   * ai cũng dựng được, và ô tên không nên điền sẵn thứ gì khác.
   */
  const ten = (await searchParams).ten ?? '';
  const tenDienSan = /^[a-z0-9._-]{3,24}$/.test(ten) ? ten : undefined;

  return (
    <FormColumn>
      <PageTitle
        title="Bé đăng nhập"
        lead="Dùng tên đăng nhập và mật khẩu mà bố mẹ đã tạo cho bé nhé."
      />

      <AuthForm action={loginChildAction} submitLabel="Vào chơi" busyLabel="Đang vào…">
        <Field id="username" label="Tên đăng nhập của bé">
          <OTenBe tenDienSan={tenDienSan} />
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
        <Link href="/dang-nhap" className="kg-link-bam font-bold text-accent-text underline">
          ở đây
        </Link>
        .
      </p>
    </FormColumn>
  );
}
