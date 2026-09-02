import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getActor } from '@/lib/session';
import { MAX_UNRESOLVED_GROUPS, RETENTION_DAYS } from '@/lib/error-log';
import { EmptyState, PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { MAT_THE } from '@/components/card';
import { ResolveAllErrorsButton, ResolveErrorButton } from './error-controls';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

/** Nhãn cho `ErrorLog.source`. Mã lạ thì hiện nguyên mã chứ không vỡ trang. */
const SOURCE_LABEL: Record<string, string> = {
  boundary: 'trang lỗi',
  global: 'lỗi toàn trang',
  server: 'server',
};

const FILTERS = [
  { key: 'chua-xu-ly', label: 'Chưa xử lý' },
  { key: 'tat-ca', label: 'Tất cả' },
  { key: 'da-xu-ly', label: 'Đã xử lý' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function whereFor(filter: FilterKey): Prisma.ErrorLogWhereInput {
  switch (filter) {
    case 'tat-ca':
      return {};
    case 'da-xu-ly':
      return { resolvedAt: { not: null } };
    case 'chua-xu-ly':
    default:
      return { resolvedAt: null };
  }
}

/**
 * Lỗi ở máy người dùng thật.
 *
 * Trang riêng chứ không thêm một khối nữa vào `/admin`, và đây là quyết định về
 * người dùng chứ không về code: `/admin` là chỗ xử lý NỘI DUNG — game bị báo cáo,
 * yêu cầu gỡ bản quyền, tài khoản cần khoá. Việc ở đó có hạn chót và có trẻ con ở
 * đầu bên kia. Lỗi kỹ thuật là việc của người sửa code, nhịp khác hẳn. Xếp chung
 * một trang thì hàng đợi bản quyền — thứ duy nhất có hạn đã hứa công khai — bị đẩy
 * xuống dưới một danh sách stack trace.
 *
 * Bù lại, `/admin` có một dòng đếm dẫn sang đây, để người vào kiểm duyệt vẫn biết
 * có lỗi mới mà không phải nhớ tự mở trang này.
 */
export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string; trang?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect('/dang-nhap');
  // 404 chứ không 403, cùng lý do đã ghi ở /admin: 403 là xác nhận trang có tồn tại.
  if (actor.kind !== 'parent' || !actor.isAdmin) notFound();

  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.loc)?.key ?? 'chua-xu-ly') as FilterKey;
  const page = Math.max(1, Number(sp.trang ?? '1') || 1);
  const where = whereFor(filter);

  const [total, unresolved, groups] = await Promise.all([
    prisma.errorLog.count({ where }),
    prisma.errorLog.count({ where: { resolvedAt: null } }),
    prisma.errorLog.findMany({
      where,
      /*
       * Mới nhất trước, KHÔNG phải nhiều nhất trước.
       *
       * Sắp theo `count` thì một lỗi cũ đã đếm tới hàng nghìn lượt sẽ ngồi mãi trên
       * đỉnh và che đúng thứ đáng xem nhất: lỗi vừa mới xuất hiện, tức lỗi có khả
       * năng cao nhất là do bản vừa deploy gây ra.
       */
      orderBy: { lastSeenAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const linkTo = (f: FilterKey, p: number) => `/admin/loi?loc=${f}${p > 1 ? `&trang=${p}` : ''}`;

  return (
    <>
      <PageTitle
        title="Lỗi người dùng gặp"
        lead={`Gom theo nhóm, giữ ${RETENTION_DAYS} ngày. Không lưu IP, không lưu user agent đầy đủ, không lưu nội dung form.`}
      />

      {/* Link "về trang kiểm duyệt" từng ở đây, đã BỎ: thanh tab của khu quản trị
          làm đúng việc đó, ở mọi trang, và làm rõ hơn — nó còn cho biết trang kia
          đang có bao nhiêu việc chờ. */}

      {unresolved >= MAX_UNRESOLVED_GROUPS && (
        <Notice tone="error">
          Đã đầy {MAX_UNRESOLVED_GROUPS} nhóm chưa xử lý, nên lỗi MỚI đang bị bỏ chứ không được
          ghi. Các nhóm cũ vẫn tiếp tục đếm. Xử lý hoặc đánh dấu bớt để bảng nhận lại lỗi mới.
        </Notice>
      )}

      <nav className="mb-5 mt-5 flex flex-wrap gap-2" data-testid="error-filters">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={linkTo(f.key, 1)}
            data-testid={`error-filter-${f.key}`}
            aria-current={f.key === filter ? 'page' : undefined}
            className={[
              'min-h-touch inline-flex items-center rounded-full border px-4 font-semibold no-underline',
              f.key === filter
                ? 'border-transparent bg-accent text-chrome'
                : 'border-border bg-surface text-ink hover:bg-bg',
            ].join(' ')}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <Notice tone="info">
        <strong>Mã lỗi</strong> là sợi dây nối một dòng ở đây với một dòng trong log server: ở
        production, thông điệp lỗi thật cố tình không được gửi xuống trình duyệt, chỉ có mã này
        xuất hiện ở cả hai nơi. Phụ huynh báo lỗi kèm mã thì tìm bằng{' '}
        <code className="font-bold">docker compose logs web | grep &lt;mã&gt;</code>.
      </Notice>

      <p className="mt-4 text-sm text-ink-soft" data-testid="error-total">
        {total} nhóm · trang {page}/{lastPage} · {unresolved} chưa xử lý
      </p>

      {groups.length === 0 ? (
        <EmptyState>
          {filter === 'chua-xu-ly'
            ? 'Không có lỗi nào chưa xử lý. Đây là tin tốt.'
            : 'Không có nhóm nào trong mục này.'}{' '}
          <Link href="/admin">Về trang kiểm duyệt</Link>
        </EmptyState>
      ) : (
        <ul className="mb-8 mt-3 list-none space-y-4 p-0" data-testid="error-list">
          {groups.map((g) => (
            <li
              key={g.id}
              className={`p-5 ${MAT_THE}`}
              data-testid="error-group"
              data-error-id={g.id}
            >
              <p className="text-lg font-bold">
                <span data-testid="error-path">{g.path}</span>{' '}
                <span className="align-middle text-sm font-semibold text-ink-soft">
                  ({SOURCE_LABEL[g.source] ?? g.source})
                </span>
              </p>

              {/*
                `break-all` chứ không `truncate`: thông điệp lỗi bị cắt bằng dấu ba
                chấm thì đúng phần đuôi — chỗ hay có tên hàm và giá trị thật — là
                phần biến mất, mà đó lại là phần dùng để tìm ra nguyên nhân.
              */}
              {g.message && (
                <p className="mt-1 break-all font-mono text-sm" data-testid="error-message">
                  {g.message}
                </p>
              )}

              <p className="mt-2 text-sm text-ink-soft" data-testid="error-count">
                {g.count} lần · lần đầu{' '}
                <time dateTime={g.firstSeenAt.toISOString()}>
                  {g.firstSeenAt.toLocaleString('vi-VN')}
                </time>{' '}
                · lần cuối{' '}
                <time dateTime={g.lastSeenAt.toISOString()}>
                  {g.lastSeenAt.toLocaleString('vi-VN')}
                </time>
                {g.browser && ` · ${g.browser}`}
              </p>

              {g.digest ? (
                <p className="mt-1 text-sm" data-testid="error-digest">
                  Mã lỗi: <code className="font-bold">{g.digest}</code>
                </p>
              ) : (
                /*
                  Nói rõ vì sao TRỐNG, thay vì để trống.
                  Không có mã là đặc điểm của lỗi thuần phía client, không phải dữ
                  liệu bị thiếu — mà một ô trống thì người đọc luôn hiểu thành thiếu,
                  rồi đi tìm nguyên nhân của một lỗi không tồn tại.
                */
                <p className="mt-1 text-sm text-ink-soft">
                  Không có mã lỗi — lỗi xảy ra hẳn ở phía trình duyệt, nên không có dòng nào
                  tương ứng trong log server.
                </p>
              )}

              {g.resolvedAt && (
                <p className="mt-1 text-sm text-ink-soft" data-testid="error-resolved-at">
                  Đã đánh dấu xử lý{' '}
                  <time dateTime={g.resolvedAt.toISOString()}>
                    {g.resolvedAt.toLocaleString('vi-VN')}
                  </time>
                  {/*
                    Lỗi quay lại SAU khi đánh dấu là thông tin quan trọng nhất trên
                    cả dòng này: nó nghĩa là bản vá không ăn. Đánh dấu xử lý cố ý
                    không xoá dòng chính vì để so được hai mốc thời gian này.
                  */}
                  {g.lastSeenAt > g.resolvedAt && (
                    <span className="font-bold text-danger"> — nhưng đã xảy ra lại sau đó</span>
                  )}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <ResolveErrorButton id={g.id} resolved={g.resolvedAt !== null} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {filter === 'chua-xu-ly' && unresolved > 0 && <ResolveAllErrorsButton count={unresolved} />}

      {lastPage > 1 && (
        <nav className="mb-12 mt-6 flex flex-wrap items-center gap-3" data-testid="error-pager">
          {page > 1 && <Link href={linkTo(filter, page - 1)}>← Trang trước</Link>}
          {page < lastPage && <Link href={linkTo(filter, page + 1)}>Trang sau →</Link>}
        </nav>
      )}
    </>
  );
}
