import { LinkCho } from '@/components/link-cho';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getAdmin } from '@/lib/session';
import { MAX_UNRESOLVED_GROUPS, RETENTION_DAYS } from '@/lib/error-log';
import { MAX_BAO_LOI_CHUA_XU_LY } from '@/lib/bao-loi';
import { EmptyState, PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { MAT_THE } from '@/components/card';
import {
  ResolveAllErrorsButton,
  ResolveBugReportButton,
  ResolveErrorButton,
} from './error-controls';
import { Pager } from '@/components/pager';

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
  const admin = await getAdmin();
  if (!admin) redirect('/admin/dang-nhap');

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

  /*
   * BÁO LỖI DO NGƯỜI DÙNG GỬI — truy vấn riêng, danh sách riêng, KHÔNG phân trang.
   *
   * Không phân trang vì hàng đợi này phải nhỏ theo thiết kế: có trần
   * `MAX_BAO_LOI_CHUA_XU_LY`, và nếu nó lớn tới mức cần phân trang thì bản thân điều
   * đó đã là sự cố cần xử lý chứ không phải cần thêm nút sang trang. Cùng lý lẽ với
   * hàng đợi yêu cầu gỡ bản quyền trên tab Tổng quan.
   *
   * Lấy 50 dòng chưa xử lý: đủ để thấy hết trong mọi trạng thái bình thường, và có
   * trần nên không bao giờ kéo về cả bảng.
   */
  const [baoLoiChuaXuLy, soBaoLoiChuaXuLy] = await Promise.all([
    prisma.bugReport.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.bugReport.count({ where: { resolvedAt: null } }),
  ]);

  return (
    <>
      {/*
        Lead phải nói về CẢ HAI phần của trang, và câu cũ thì không.
        Nó viết "gom theo nhóm… không lưu nội dung form" — đúng với lỗi tự động, sai
        hẳn với phần người dùng báo: phần đó KHÔNG gom nhóm (hai người viết hai câu
        khác nhau về cùng một chỗ hỏng) và nó CÓ lưu chữ người ta gõ, kể cả email nếu
        họ để lại. Một câu mô tả sai về nửa trang là loại sai tệ nhất ở đây, vì nó nói
        về việc giữ dữ liệu của người dùng.
      */}
      <PageTitle
        title="Lỗi người dùng gặp"
        lead={`Hai nguồn: người dùng tự báo, và lỗi máy tự ghi (gom theo nhóm, giữ ${RETENTION_DAYS} ngày). Cả hai đều không lưu IP thô và không lưu user agent đầy đủ.`}
      />

      {/* Link "về trang kiểm duyệt" từng ở đây, đã BỎ: thanh tab của khu quản trị
          làm đúng việc đó, ở mọi trang, và làm rõ hơn — nó còn cho biết trang kia
          đang có bao nhiêu việc chờ. */}

      {/*
        NGƯỜI DÙNG BÁO đứng TRÊN lỗi tự động, và thứ tự đó là nội dung.
        Lỗi tự động là máy nói với ta; ở đây có một người thật đã ngồi gõ một đoạn văn
        và có thể đang chờ được trả lời. Đặt xuống dưới ba mươi nhóm lỗi tự động thì nó
        rơi khỏi màn hình đầu tiên đúng vào ngày có nhiều lỗi — tức đúng ngày người ta
        báo nhiều nhất.

        Phần này KHÔNG chịu bộ lọc của trang: ba bộ lọc bên dưới nói về `ErrorLog`. Cho
        chúng lọc cả hai danh sách nghĩa là "Đã xử lý" hiện một hàng đợi trống rỗng và
        một danh sách lỗi cũ, hai thứ chẳng liên quan gì nhau.
      */}
      <section className="mt-5" data-testid="bug-reports">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 border-b border-border pb-2">
          <h2 className="text-lg font-extrabold tracking-tight">Người dùng báo</h2>
          <p className="text-sm text-ink-soft">
            {soBaoLoiChuaXuLy === 0
              ? 'chưa có báo lỗi nào đang chờ'
              : `${soBaoLoiChuaXuLy} đang chờ${soBaoLoiChuaXuLy >= MAX_BAO_LOI_CHUA_XU_LY ? ' — ĐÃ ĐẦY, báo lỗi mới đang bị từ chối' : ''}`}
          </p>
        </div>

        {baoLoiChuaXuLy.length === 0 ? (
          <p className="text-ink-soft">
            Không có báo lỗi nào đang chờ. Người dùng gửi ở{' '}
            <code className="font-bold">/bao-loi</code>.
          </p>
        ) : (
          <ul className="list-none space-y-3 p-0">
            {baoLoiChuaXuLy.map((b) => (
              <li
                key={b.id}
                className={`border-l-4 border-l-accent p-4 ${MAT_THE}`}
                data-testid="bug-report"
              >
                {/* Mô tả LÀ nội dung của dòng này, nên nó đứng đầu và giữ nguyên dấu
                    xuống dòng người ta gõ. `break-words` vì người dùng dán được cả
                    một URL dài không có khoảng trắng nào. */}
                <p className="whitespace-pre-wrap break-words" data-testid="bug-mo-ta">
                  {b.moTa}
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  {b.createdAt.toLocaleString('vi-VN')}
                  {b.duongDan && (
                    <>
                      {' · '}
                      <span data-testid="bug-duong-dan">{b.duongDan}</span>
                    </>
                  )}
                  {b.browser && ` · ${b.browser}`}
                </p>
                {b.maLoi && (
                  <p className="mt-1 text-sm" data-testid="bug-ma-loi">
                    Mã lỗi: <code className="font-bold">{b.maLoi}</code>
                  </p>
                )}
                {/* Email hiện thành link `mailto:` — người trực trả lời ngay từ đây.
                    Không có email thì nói THẲNG là không trả lời được, chứ không để
                    trống: một dòng trống đọc như "chưa đọc kỹ" chứ không như "người
                    gửi đã chọn không để lại địa chỉ". */}
                <p className="mt-1 text-sm" data-testid="bug-email">
                  {b.emailLienHe ? (
                    <a href={`mailto:${b.emailLienHe}`} className="font-semibold">
                      {b.emailLienHe}
                    </a>
                  ) : (
                    <span className="text-ink-soft">Không để lại email — không trả lời được.</span>
                  )}
                </p>
                {/* `div`, KHÔNG phải `p`: `ResolveBugReportButton` render một
                    `<form>`, và HTML không cho `<form>` nằm trong `<p>`. Trình duyệt
                    tự đóng thẻ `<p>` ngay trước `<form>`, nên cây DOM nó dựng khác
                    cây React gửi từ server — ra lỗi hydration, và nút có thể mất
                    handler. Đây là lỗi nằm trong HTML chứ không nằm trong React, nên
                    không phép kiểm giao diện nào của repo nhìn thấy: nút vẫn hiện,
                    vẫn đúng chỗ, vẫn bấm được trong bản render server. */}
                <div className="mt-3">
                  <ResolveBugReportButton id={b.id} resolved={false} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mb-3 mt-9 flex flex-wrap items-baseline gap-x-3 border-b border-border pb-2">
        <h2 className="text-lg font-extrabold tracking-tight">Lỗi tự động ghi lại</h2>
        <p className="text-sm text-ink-soft">máy tự phát hiện, gom theo nhóm</p>
      </div>

      {unresolved >= MAX_UNRESOLVED_GROUPS && (
        <Notice tone="error">
          Đã đầy {MAX_UNRESOLVED_GROUPS} nhóm chưa xử lý, nên lỗi MỚI đang bị bỏ chứ không được
          ghi. Các nhóm cũ vẫn tiếp tục đếm. Xử lý hoặc đánh dấu bớt để bảng nhận lại lỗi mới.
        </Notice>
      )}

      <nav className="mb-5 mt-5 flex flex-wrap gap-2" data-testid="error-filters">
        {FILTERS.map((f) => (
          <LinkCho
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
          </LinkCho>
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
          <LinkCho href="/admin">Về trang kiểm duyệt</LinkCho>
        </EmptyState>
      ) : (
        <ul className="mb-8 mt-3 list-none space-y-3 p-0" data-testid="error-list">
          {groups.map((g) => {
            /*
             * QUAY LẠI SAU KHI ĐÁNH DẤU XỬ LÝ là trạng thái quan trọng nhất trên cả
             * trang này, và trước đây nó chỉ là một mệnh đề nằm ở dòng thứ năm của
             * thẻ. Nó nghĩa là bản vá KHÔNG ăn — tức việc đã bị đóng lại một lần rồi
             * mà lỗi vẫn còn — nên nó phải đọc được trước cả khi đọc chữ.
             */
            const quayLai = g.resolvedAt !== null && g.lastSeenAt > g.resolvedAt;
            const chuaXuLy = g.resolvedAt === null;
            const vach = quayLai
              ? 'border-l-danger'
              : chuaXuLy
                ? 'border-l-accent'
                : 'border-l-border';
            return (
            <li
              key={g.id}
              className={`border-l-4 p-4 ${MAT_THE} ${vach}`}
              data-testid="error-group"
              data-error-id={g.id}
            >
              {/*
                SỐ LẦN đứng riêng một cột bên trái, cỡ lớn.
                Đây là con số quyết định thứ tự xử lý: một nhóm 400 lần và một nhóm 1
                lần là hai việc khác hẳn nhau, mà bản trước chôn cả hai vào cùng một
                dòng chữ xám thứ ba. Danh sách này dài ba mươi thẻ, nên thứ dùng để
                xếp ưu tiên phải đọc được mà không cần đọc.
              */}
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <p className="w-14 shrink-0 text-right">
                  <span
                    className={`block text-2xl font-extrabold leading-none tabular-nums ${
                      g.count > 1 ? 'text-ink' : 'text-ink-soft'
                    }`}
                  >
                    {g.count}
                  </span>
                  <span className="text-xs text-ink-soft">lần</span>
                </p>

                <div className="min-w-0 flex-1">
              <p className="text-lg font-bold">
                <span data-testid="error-path">{g.path}</span>{' '}
                <span className="align-middle text-sm font-semibold text-ink-soft">
                  ({SOURCE_LABEL[g.source] ?? g.source})
                </span>
                {quayLai && (
                  <span className="ml-2 align-middle rounded-full border border-danger-border bg-bg px-2 py-0.5 text-xs font-bold text-danger">
                    đã xảy ra lại sau khi đánh dấu xử lý
                  </span>
                )}
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

              {/* `error-count` vẫn mang đủ chữ "N lần" như cũ: bộ kiểm đọc chuỗi này,
                  và cột số bên trái là thứ thêm vào chứ không thay thế. */}
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
                    Câu "nhưng đã xảy ra lại sau đó" GIỮ NGUYÊN ở đây dù trên tiêu đề
                    đã có nhãn đỏ: nhãn kia nói có chuyện, còn hai mốc thời gian nằm
                    cạnh nhau ở dòng này mới cho biết lỗi quay lại sau bao lâu — và đó
                    là thứ phân biệt "bản vá không ăn" với "vá xong thì có người mở lại
                    tab cũ".
                  */}
                  {g.lastSeenAt > g.resolvedAt && (
                    <span className="font-bold text-danger"> — nhưng đã xảy ra lại sau đó</span>
                  )}
                </p>
              )}

                </div>

                {/* Nút sang cột phải từ `sm` trở lên: ba mươi thẻ mà mỗi thẻ dành một
                    hàng riêng cho một cái nút thì trang dài thêm ba mươi hàng, trong
                    khi bên phải đang trống.

                    Dưới `sm` phải là `w-full` chứ không chỉ bỏ `shrink-0`: ô chữ ở
                    giữa là `flex-1 min-w-0`, nên nó CO LẠI để nhường chỗ cho nút thay
                    vì đẩy nút xuống dòng — đo ở 390px thấy đường dẫn vỡ thành ba dòng
                    để chừa chỗ cho một cái nút không ai cần thấy trước khi đọc xong. */}
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
                  <ResolveErrorButton id={g.id} resolved={g.resolvedAt !== null} />
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {filter === 'chua-xu-ly' && unresolved > 0 && <ResolveAllErrorsButton count={unresolved} />}

      <Pager
        page={page}
        lastPage={lastPage}
        href={(p) => linkTo(filter, p)}
        testId="error-pager"
        className="mb-12 mt-6"
      />
    </>
  );
}
