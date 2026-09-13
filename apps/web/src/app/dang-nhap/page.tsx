import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { Field, TextInput } from '@/components/field';
import { Notice } from '@/components/notice';
import { FormColumn, PageTitle } from '@/components/page';
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
    <FormColumn>
      <PageTitle title="Đăng nhập cho phụ huynh" />

      {justReset && (
        <div className="mb-5">
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

      {/*
        Ba đường đi khác nhau, nên xuống dòng chứ không nối bằng dấu "·".
        Nối lại thành một dòng dài thì mắt phải đọc hết cả câu mới biết có ba lựa
        chọn, mà người đang mắc ở màn hình đăng nhập thường chỉ liếc.

        Vùng bấm mỗi link cao 48px (`kg-link-bam`) trên dòng 24px, tức tràn sang dòng
        kề. Không chồng nhau chỉ vì ba link đứng ở ba khoảng ngang khác nhau (đo ở 390px:
        20–141, 158–219, 237–298). Đổi chữ để hai link thẳng cột thì phải giãn dòng —
        `a11y-check` đỏ ở "không chồng nhau" nếu quên.
      */}
      <div className="mb-12 space-y-1 text-ink-soft">
        <p>
          <Link href="/quen-mat-khau" className="kg-link-bam font-bold text-accent-text underline">
            Quên mật khẩu?
          </Link>
        </p>
        <p>
          Bé đăng nhập để đăng game?{' '}
          <Link href="/be-dang-nhap" className="kg-link-bam font-bold text-accent-text underline">
            Vào đây
          </Link>
        </p>
        <p>
          Chưa có tài khoản?{' '}
          <Link href="/dang-ky" className="kg-link-bam font-bold text-accent-text underline">
            Đăng ký
          </Link>
        </p>
      </div>
    </FormColumn>
  );
}
