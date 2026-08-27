import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getActor } from '@/lib/session';
import { REPORT_AUTO_HIDE_THRESHOLD } from '@/lib/moderation';
import { reasonLabel } from '@/lib/report-reasons';
import { objectUrl } from '@/lib/storage';
import { EmptyState, PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { slaDueAt } from '@/lib/operator';
import {
  ChildLockButton,
  DismissReportsButton,
  RemoveGameButton,
  RestoreGameButton,
} from './admin-controls';
import { TakedownControls } from './takedown-controls';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'đang hiện',
  HIDDEN: 'đang ẩn',
  REMOVED: 'đã gỡ hẳn',
};

/** Nhãn cho `ModerationLog.action`. Mã lạ thì hiện nguyên mã chứ không vỡ trang. */
const ACTION_LABEL: Record<string, string> = {
  AUTO_HIDE: 'Hệ thống tự ẩn (đủ ngưỡng báo cáo)',
  PARENT_HIDE: 'Phụ huynh ẩn game',
  PARENT_UNHIDE: 'Phụ huynh cho hiện lại',
  ADMIN_REMOVE: 'Admin gỡ hẳn',
  ADMIN_RESTORE: 'Admin cho hiện lại',
  ADMIN_DISMISS_REPORTS: 'Admin bỏ qua báo cáo',
  ADMIN_LOCK_CHILD: 'Admin khoá tài khoản của bé',
  ADMIN_UNLOCK_CHILD: 'Admin mở khoá tài khoản của bé',
  TAKEDOWN_HIDE: 'Tạm ẩn vì có yêu cầu gỡ bản quyền',
  TAKEDOWN_ACCEPT: 'Admin chấp nhận yêu cầu gỡ bản quyền',
  TAKEDOWN_REJECT: 'Admin bác bỏ yêu cầu gỡ bản quyền',
};

/**
 * Bộ lọc. `can-xem` là mặc định vì phần lớn thời gian admin chỉ quan tâm việc cần làm,
 * nhưng vẫn phải duyệt được toàn bộ game khi muốn đi soát chủ động.
 */
const FILTERS = [
  { key: 'can-xem', label: 'Cần xem' },
  { key: 'tat-ca', label: 'Tất cả' },
  { key: 'dang-hien', label: 'Đang hiện' },
  { key: 'da-an', label: 'Đang ẩn' },
  { key: 'da-go', label: 'Đã gỡ' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function whereFor(filter: FilterKey): Prisma.GameWhereInput {
  switch (filter) {
    case 'tat-ca':
      return {};
    case 'dang-hien':
      return { status: 'PUBLISHED' };
    case 'da-an':
      return { status: 'HIDDEN' };
    case 'da-go':
      return { status: 'REMOVED' };
    case 'can-xem':
    default:
      return { OR: [{ reportCount: { gt: 0 } }, { status: { not: 'PUBLISHED' } }] };
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string; trang?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect('/dang-nhap');

  /*
   * Người không phải admin nhận 404 chứ không phải "403 bạn không có quyền".
   * Báo 403 là xác nhận trang này có tồn tại và đáng để dò tiếp; 404 thì trang
   * admin đơn giản là không tồn tại đối với họ.
   */
  if (actor.kind !== 'parent' || !actor.isAdmin) notFound();

  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.loc)?.key ?? 'can-xem') as FilterKey;
  const page = Math.max(1, Number(sp.trang ?? '1') || 1);
  const where = whereFor(filter);

  const [total, games, takedowns] = await Promise.all([
    prisma.game.count({ where }),
    prisma.game.findMany({
      where,
      orderBy: [{ reportCount: 'desc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        child: {
          select: {
            id: true,
            displayName: true,
            username: true,
            isLocked: true,
            parent: { select: { email: true } },
            /*
             * Vết khoá/mở khoá TÀI KHOẢN, tách khỏi vết của từng game. Hai loại
             * này phải hiện riêng: "admin gỡ một game" và "admin chặn đứa trẻ
             * đăng nhập" là hai mức độ hoàn toàn khác nhau, trộn vào một danh
             * sách là làm mờ đúng chỗ cần rõ nhất.
             */
            moderationLogs: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: { id: true, actorId: true, action: true, note: true, createdAt: true },
            },
          },
        },
        reports: {
          where: { status: 'OPEN' },
          orderBy: { createdAt: 'desc' },
          select: { id: true, reason: true, createdAt: true },
        },
        moderationLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, actorId: true, action: true, note: true, createdAt: true },
        },
      },
    }),

    /*
     * Hàng đợi yêu cầu gỡ bản quyền — KHÔNG lọc theo `filter`, KHÔNG phân trang.
     *
     * Cố ý nằm ngoài mọi bộ lọc của danh sách game bên dưới: đây là thứ duy nhất
     * trên trang này có hạn chót đã hứa công khai với người ngoài, nên nó không được
     * phép biến mất chỉ vì admin đang xem một tab khác. Cũ nhất lên trước, vì cái cũ
     * nhất là cái sắp trễ hạn.
     */
    prisma.takedownRequest.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      include: {
        game: {
          select: {
            id: true,
            title: true,
            status: true,
            child: { select: { displayName: true, username: true } },
          },
        },
      },
    }),
  ]);

  /*
   * `ModerationLog.actorId` là chuỗi thường, KHÔNG phải khoá ngoại — nó chứa id phụ
   * huynh, id admin, hoặc chuỗi "system". Nên phải tự tra ngược ra email bằng một
   * truy vấn gộp, thay vì join. Không tra thì màn hình chỉ hiện cuid vô nghĩa.
   */
  const actorIds = [
    ...new Set(
      games.flatMap((g) =>
        [...g.moderationLogs, ...g.child.moderationLogs].map((l) => l.actorId)
      )
    ),
  ].filter((id) => id !== 'system');
  const actorEmails = new Map(
    (
      await prisma.parent.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true },
      })
    ).map((p) => [p.id, p.email])
  );
  const actorName = (id: string) => (id === 'system' ? 'hệ thống' : actorEmails.get(id) ?? id);

  interface LogRow {
    id: string;
    actorId: string;
    action: string;
    note: string;
    createdAt: Date;
  }

  /** Dùng chung cho vết của game và vết của tài khoản — hai danh sách, một cách hiển thị. */
  const logList = (logs: LogRow[], label: string, testId: string) =>
    logs.length > 0 ? (
      <details className="mt-2 text-sm" data-testid={testId}>
        <summary className="min-h-touch inline-flex cursor-pointer items-center font-semibold text-ink-soft">
          {label} ({logs.length})
        </summary>
        <ul className="mt-1 list-none space-y-1 p-0 text-ink-soft">
          {logs.map((log) => (
            <li key={log.id}>
              — {ACTION_LABEL[log.action] ?? log.action} · {actorName(log.actorId)} ·{' '}
              <time dateTime={log.createdAt.toISOString()}>
                {log.createdAt.toLocaleString('vi-VN')}
              </time>
              {log.note && ` · ${log.note}`}
            </li>
          ))}
        </ul>
      </details>
    ) : null;

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const linkTo = (f: FilterKey, p: number) => `/admin?loc=${f}${p > 1 ? `&trang=${p}` : ''}`;

  return (
    <>
      <PageTitle
        title="Kiểm duyệt"
        lead={`${actor.email} · game tự ẩn khi đủ ${REPORT_AUTO_HIDE_THRESHOLD} báo cáo`}
      />

      {takedowns.length > 0 && (
        <section className="mb-7" data-testid="admin-takedowns">
          <h2 className="text-xl font-extrabold tracking-tight">
            Yêu cầu gỡ bản quyền ({takedowns.length})
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Game đã tạm ẩn khi nhận. Cả hai lựa chọn dưới đây đều gửi email cho người khiếu nại và
            cho phụ huynh của bé.
          </p>

          <ul className="mt-3 list-none space-y-4 p-0">
            {takedowns.map((req) => {
              const due = slaDueAt(req.createdAt);
              const overdue = due.getTime() < Date.now();
              return (
                <li
                  key={req.id}
                  data-testid="admin-takedown"
                  data-request-id={req.id}
                  className="rounded-card border border-warn-border bg-warn-bg p-5"
                >
                  <p className="text-lg font-bold">
                    <Link href={`/game/${req.game.id}`}>{req.game.title}</Link>{' '}
                    <span className="align-middle text-sm font-semibold text-ink-soft">
                      ({STATUS_LABEL[req.game.status] ?? req.game.status})
                    </span>
                  </p>
                  <p className="text-sm text-ink-soft">
                    Của bé {req.game.child.displayName} ({req.game.child.username})
                  </p>

                  <p className="mt-2 text-sm">
                    <span className="font-semibold">Người khiếu nại:</span> {req.claimantName}{' '}
                    &lt;{req.claimantEmail}&gt;
                  </p>
                  <p className="text-sm" data-testid="admin-takedown-due">
                    <span className="font-semibold">Nhận lúc:</span>{' '}
                    <time dateTime={req.createdAt.toISOString()}>
                      {req.createdAt.toLocaleString('vi-VN')}
                    </time>{' '}
                    ·{' '}
                    <span className={overdue ? 'font-bold text-danger' : ''}>
                      hạn trả lời {due.toLocaleDateString('vi-VN')}
                      {overdue && ' — ĐÃ TRỄ'}
                    </span>
                  </p>

                  {/*
                    `whitespace-pre-wrap` chứ không để React gộp dòng: người khiếu nại
                    hay dán vào đây mỗi link một dòng, và `sanitizeMultiline` đã cố ý
                    giữ nguyên xuống dòng để đọc được đúng như họ viết.
                  */}
                  <div className="mt-3 rounded-field border border-warn-border bg-surface p-3.5">
                    <p className="text-sm font-semibold">Căn cứ họ nêu</p>
                    <p
                      className="mt-1 whitespace-pre-wrap text-[0.95rem]"
                      data-testid="admin-takedown-evidence"
                    >
                      {req.evidence}
                    </p>
                  </div>

                  <TakedownControls requestId={req.id} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <nav className="mb-5 flex flex-wrap gap-2" data-testid="admin-filters">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={linkTo(f.key, 1)}
            data-testid={`admin-filter-${f.key}`}
            aria-current={f.key === filter ? 'page' : undefined}
            className={[
              'min-h-touch inline-flex items-center rounded-full border px-4 font-semibold no-underline',
              f.key === filter
                ? 'border-transparent bg-accent text-ink'
                : 'border-border bg-surface text-ink hover:bg-bg',
            ].join(' ')}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <Notice tone="info">
        Cho hiện lại và Bỏ qua báo cáo đều đưa số đếm báo cáo về 0. Không đưa về 0 thì chỉ thêm
        một báo cáo nữa là game bị ẩn lại ngay, và quyết định của bạn bị lật mà không rõ vì sao.
      </Notice>

      <p className="mt-4 text-sm text-ink-soft" data-testid="admin-total">
        {total} game · trang {page}/{lastPage}
      </p>

      {games.length === 0 ? (
        <EmptyState>
          Không có game nào trong mục này. <Link href="/">Về trang chủ</Link>
        </EmptyState>
      ) : (
        <ul className="mb-8 mt-3 list-none space-y-4 p-0" data-testid="admin-list">
          {games.map((game) => (
            <li
              key={game.id}
              className="rounded-card border border-border bg-surface p-5"
              data-testid="admin-game"
              data-game-id={game.id}
            >
              <div className="flex flex-wrap items-start gap-4">
                {/*
                  Ảnh nằm trên player origin nên dùng <img> thường, giống game-card:
                  next/image sẽ đòi cấu hình remotePatterns mà chẳng được lợi gì thêm.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={objectUrl('thumb', game.thumbSha256)}
                  alt=""
                  loading="lazy"
                  width={160}
                  height={120}
                  className="block aspect-4/3 w-40 shrink-0 rounded-field bg-bg object-cover"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold">
                    {/* Admin xem được cả game đã ẩn — xem ngoại lệ trong /game/[id]/page.tsx */}
                    <Link href={`/game/${game.id}`}>{game.title}</Link>{' '}
                    <span className="align-middle text-sm font-semibold text-ink-soft">
                      ({STATUS_LABEL[game.status] ?? game.status})
                    </span>
                  </p>
                  <p className="text-sm text-ink-soft">
                    Của bé {game.child.displayName} ({game.child.username})
                    {game.child.isLocked && (
                      <span className="font-semibold text-danger"> · tài khoản đang khoá</span>
                    )}{' '}
                    · bố mẹ: {game.child.parent.email}
                  </p>
                  <p className="text-sm text-ink-soft" data-testid="admin-report-count">
                    {game.reportCount} báo cáo · {game.playCount} lượt chơi
                  </p>

                  {game.reports.length > 0 && (
                    <ul className="mt-2 list-none space-y-1 p-0 text-sm" data-testid="admin-reasons">
                      {game.reports.map((report) => (
                        <li key={report.id}>
                          <span className="font-semibold text-danger">
                            {reasonLabel(report.reason)}
                          </span>{' '}
                          <time dateTime={report.createdAt.toISOString()} className="text-ink-soft">
                            ({report.createdAt.toLocaleString('vi-VN')})
                          </time>
                        </li>
                      ))}
                    </ul>
                  )}

                  {logList(game.moderationLogs, 'Lịch sử kiểm duyệt', 'admin-log')}
                  {logList(
                    game.child.moderationLogs,
                    'Lịch sử tài khoản của bé',
                    'admin-child-log'
                  )}
                </div>
              </div>

              {/*
                Nút xuống hàng riêng chứ không xếp cạnh phần chữ. Ba nút cạnh nhau
                chiếm gần nửa bề ngang, ép cột thông tin hẹp lại tới mức email và
                trạng thái tài khoản gãy dòng lung tung.
              */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {game.status !== 'PUBLISHED' && <RestoreGameButton gameId={game.id} />}
                {/* Game vẫn đang hiện mà dính báo cáo sai: dọn báo cáo, giữ nguyên game. */}
                {game.status === 'PUBLISHED' && game.reportCount > 0 && (
                  <DismissReportsButton gameId={game.id} />
                )}
                {game.status !== 'REMOVED' && <RemoveGameButton gameId={game.id} />}
                <ChildLockButton childId={game.child.id} isLocked={game.child.isLocked} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 && (
        <nav className="mb-12 flex flex-wrap items-center gap-3" data-testid="admin-pager">
          {page > 1 && <Link href={linkTo(filter, page - 1)}>← Trang trước</Link>}
          {page < lastPage && <Link href={linkTo(filter, page + 1)}>Trang sau →</Link>}
        </nav>
      )}
    </>
  );
}
