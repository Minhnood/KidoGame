import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getActor } from '@/lib/session';
import { createChildAction } from '@/lib/actions';
import { AuthForm } from '@/components/auth-form';
import { Field, TextInput } from '@/components/field';
import { EmptyState, PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { GameVisibilityToggle, LockToggle, ResetPasswordForm } from './child-controls';
import { VerifyEmailButton } from './verify-email-button';

export const dynamic = 'force-dynamic';

export default async function ParentDashboard() {
  const actor = await getActor();
  if (!actor) redirect('/dang-nhap');
  if (actor.kind !== 'parent') redirect('/');

  const me = await prisma.parent.findUnique({
    where: { id: actor.id },
    select: { emailVerifiedAt: true },
  });

  const children = await prisma.child.findMany({
    where: { parentId: actor.id },
    orderBy: { createdAt: 'asc' },
    include: {
      games: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, playCount: true, createdAt: true },
      },
    },
  });

  const thisYear = new Date().getFullYear();

  return (
    <>
      <PageTitle title="Trang của bố mẹ" lead={actor.email} />

      <Notice tone="info">
        Game của bé được hiển thị công khai ngay sau khi đăng. Bố mẹ xem lại ở đây và ẩn bất kỳ
        game nào, bất cứ lúc nào.
      </Notice>

      {/*
        Chưa xác minh email KHÔNG chặn gì cả — chỉ nhắc. Chặn thì đứa trẻ phải ngồi
        chờ bố mẹ mở hòm thư mới có tài khoản để đăng game. Nhưng phải nhắc, vì email
        chưa xác minh là email không lấy lại được mật khẩu.
      */}
      {!me?.emailVerifiedAt && (
        <div data-testid="email-unverified">
          <Notice tone="warn">
            Email của bạn chưa được xác minh. Chưa xác minh thì nếu quên mật khẩu sẽ không lấy
            lại được tài khoản.
            <VerifyEmailButton />
          </Notice>
        </div>
      )}

      <h2 className="mb-3 mt-9 text-xl font-bold">Tài khoản của các bé</h2>

      {children.length === 0 ? (
        <EmptyState>Chưa có bé nào. Tạo tài khoản cho bé ở khung bên dưới nhé.</EmptyState>
      ) : (
        <ul className="mb-9 list-none space-y-4 p-0">
          {children.map((child) => (
            <li key={child.id} className="rounded-card border border-border bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">
                    {child.displayName}{' '}
                    {child.isLocked && (
                      <span className="align-middle text-sm font-semibold text-danger">
                        (đang khoá)
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-ink-soft">
                    Tên đăng nhập: <strong>{child.username}</strong>
                    {child.birthYear ? ` · sinh năm ${child.birthYear}` : ''}
                  </p>
                </div>
                <LockToggle childId={child.id} isLocked={child.isLocked} />
              </div>

              <ResetPasswordForm childId={child.id} />

              <p className="mt-5 font-semibold">
                Game đã đăng ({child.games.length})
              </p>
              {child.games.length === 0 ? (
                <p className="text-ink-soft">Bé chưa đăng game nào.</p>
              ) : (
                <ul className="mt-2 list-none space-y-2 p-0">
                  {child.games.map((game) => (
                    <li
                      key={game.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-border px-3.5 py-2.5"
                    >
                      <span className="min-w-0">
                        <Link href={`/game/${game.id}`} className="font-semibold">
                          {game.title}
                        </Link>
                        <span className="ml-2 text-sm text-ink-soft">
                          {game.playCount} lượt chơi
                          {game.status !== 'PUBLISHED' && ' · đang ẩn'}
                        </span>
                      </span>
                      <GameVisibilityToggle gameId={game.id} hidden={game.status !== 'PUBLISHED'} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-9 text-xl font-bold">Tạo tài khoản cho bé</h2>

      <AuthForm
        action={createChildAction}
        submitLabel="Tạo tài khoản"
        busyLabel="Đang tạo…"
        successMessage="Đã tạo tài khoản cho bé. Tải lại trang để thấy trong danh sách."
      >
        <Field
          id="displayName"
          label="Tên hiển thị"
          hint="Tên này hiện công khai cạnh game — nên dùng tên gọi ở nhà, đừng dùng tên thật đầy đủ."
        >
          <TextInput id="displayName" name="displayName" required maxLength={40} placeholder="Bé Minh" />
        </Field>

        <Field
          id="username"
          label="Tên đăng nhập"
          hint="Chữ không dấu, số, dấu chấm hoặc gạch. Bé sẽ dùng tên này để đăng nhập."
        >
          <TextInput
            id="username"
            name="username"
            required
            placeholder="beminh"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>

        <Field id="password" label="Mật khẩu cho bé" hint="Ít nhất 6 ký tự — đủ để bé nhớ được.">
          <TextInput id="password" name="password" type="password" required minLength={6} />
        </Field>

        <Field id="birthYear" label="Năm sinh của bé" hint="Không bắt buộc.">
          <TextInput
            id="birthYear"
            name="birthYear"
            type="number"
            min={thisYear - 18}
            max={thisYear}
            placeholder={String(thisYear - 9)}
          />
        </Field>
      </AuthForm>
    </>
  );
}
