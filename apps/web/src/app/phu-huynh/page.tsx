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
        Chưa xác minh email thì CHẶN đúng một việc: tạo tài khoản cho con. Không chặn
        đăng nhập, và tuyệt đối không chặn các thao tác an toàn (khoá tài khoản con, ẩn
        game của con) — những việc đó phải làm được ngay, không đợi hòm thư.

        Lý do đầy đủ nằm ở `createChild` trong src/lib/auth.ts. Server tự kiểm lại, nên
        khối này chỉ là để người dùng biết vì sao, chứ không phải lớp bảo vệ.
      */}
      {!me?.emailVerifiedAt && (
        <div data-testid="email-unverified">
          <Notice tone="warn">
            <p className="font-semibold">Bạn cần xác minh email trước khi tạo tài khoản cho con.</p>
            <p className="mt-1">
              Chúng tôi đã gửi một lá thư tới <strong>{actor.email}</strong>. Bấm link trong thư là
              xong. Việc này cần thiết vì tạo tài khoản cho con chính là lúc bạn thay con đồng ý
              với điều khoản — nên chúng tôi phải biết chắc hòm thư này là của bạn. Nó cũng là
              cách duy nhất để lấy lại mật khẩu nếu bạn quên.
            </p>
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
                          {game.status === 'LIMITED' && ' · tạm không hiện trên trang chủ'}
                          {game.status === 'HIDDEN' && ' · đang ẩn'}
                          {game.status === 'REMOVED' && ' · đã bị gỡ'}
                        </span>
                      </span>
                      {/*
                        `hidden` là "phụ huynh có đang ẩn game này không", KHÔNG phải
                        "game có hiện trên trang chủ không". Game LIMITED vẫn chơi được
                        bằng link nên nút phải ở trạng thái "Ẩn game" — hiện "Cho hiện
                        lại" thì bấm vào chẳng thay đổi gì (server tính lại vẫn ra
                        LIMITED) và người ta sẽ tưởng nút bị hỏng.

                        REMOVED thì không có nút: đó là phán quyết của admin, phụ huynh
                        không tự lật được, và server cũng từ chối.
                      */}
                      {game.status !== 'REMOVED' && (
                        <GameVisibilityToggle gameId={game.id} hidden={game.status === 'HIDDEN'} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-9 text-xl font-bold">Tạo tài khoản cho bé</h2>

      {/*
        Chưa xác minh thì KHÔNG render form, thay bằng lời giải thích.

        Cố ý không render một form vô hiệu hoá: bố mẹ sẽ gõ hết ba ô rồi mới biết là
        không gửi được. Nói trước, và nói ở đúng chỗ họ đang định gõ.
      */}
      {!me?.emailVerifiedAt ? (
        <div data-testid="create-child-blocked" className="mb-12">
          <Notice tone="warn" role="status">
            Xác minh email xong là khung tạo tài khoản hiện ra ngay ở đây. Thư đã gửi tới{' '}
            <strong>{actor.email}</strong> — nếu không thấy, xem thử thư rác, hoặc bấm{' '}
            <strong>Gửi lại thư xác minh</strong> ở phía trên.
          </Notice>
        </div>
      ) : (
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
      )}
    </>
  );
}
