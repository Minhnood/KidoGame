import { LinkCho } from '@/components/link-cho';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getAdmin } from '@/lib/session';
import {
  actionLabel,
  NGAY_GIU_GAME_DA_GO,
  REPORT_AUTO_HIDE_THRESHOLD,
  REPORT_HARD_HIDE_THRESHOLD,
  hanXoaHan,
} from '@/lib/moderation';
import { reasonLabel } from '@/lib/report-reasons';
import { objectUrl } from '@/lib/storage';
import { EmptyState, PageTitle } from '@/components/page';
import { AnhBia } from '@/components/anh-bia';
import { Notice } from '@/components/notice';
import { MAT_THE } from '@/components/card';
import { slaDueAt } from '@/lib/operator';
import {
  ChildLockButton,
  DismissReportsButton,
  RemoveGameButton,
  RestoreGameButton,
} from './admin-controls';
import { TakedownControls } from './takedown-controls';
import { Pager } from '@/components/pager';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'đang hiện',
  LIMITED: 'ẩn mềm — chỉ vào được bằng link',
  HIDDEN: 'đang ẩn',
  REMOVED: 'đã gỡ hẳn',
};

/**
 * Bộ lọc. `can-xem` là mặc định vì phần lớn thời gian admin chỉ quan tâm việc cần làm,
 * nhưng vẫn phải duyệt được toàn bộ game khi muốn đi soát chủ động.
 */
const FILTERS = [
  { key: 'can-xem', label: 'Cần xem' },
  { key: 'tat-ca', label: 'Tất cả' },
  { key: 'dang-hien', label: 'Đang hiện' },
  { key: 'an-mem', label: 'Ẩn mềm' },
  { key: 'da-an', label: 'Đang ẩn' },
  { key: 'da-go', label: 'Đã gỡ' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

/*
 * Bốn bộ lọc theo trạng thái phải RỜI NHAU và phủ hết, tức cộng lại đúng bằng
 * "Tất cả". Thêm LIMITED mà quên thêm tab cho nó thì có một nhóm game không bộ lọc
 * nào nhìn thấy — và đó lại đúng là nhóm đang chờ người xem. e2e-moderation canh
 * bất biến này bằng phép cộng.
 */
function whereFor(filter: FilterKey): Prisma.GameWhereInput {
  switch (filter) {
    case 'tat-ca':
      return {};
    case 'dang-hien':
      return { status: 'PUBLISHED' };
    case 'an-mem':
      return { status: 'LIMITED' };
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
  searchParams: Promise<{ loc?: string; trang?: string; be?: string }>;
}) {
  const admin = await getAdmin();
  /*
   * `getAdmin()` đã bao gồm cả việc kiểm lại `isAdmin`, nên ở đây không còn phép
   * kiểm quyền riêng nữa. Việc "người không có quyền thấy 404 chứ không thấy 403"
   * giờ do middleware lo, và ở tầng cao hơn: trên app origin thì `/admin` KHÔNG
   * TỒN TẠI, không phải bị từ chối. Báo 403 là xác nhận trang có thật và đáng dò
   * tiếp; 404 thì không nói gì cả.
   *
   * Vẫn kiểm ở TRANG chứ không chỉ ở layout, cố ý lặp: layout của Next không chạy
   * lại trên mọi lần điều hướng phía client, nên một layout đóng vai người giữ cửa
   * duy nhất là một người giữ cửa có lúc ngủ.
   */
  if (!admin) redirect('/admin/dang-nhap');

  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.loc)?.key ?? 'can-xem') as FilterKey;
  const page = Math.max(1, Number(sp.trang ?? '1') || 1);

  /*
   * `be` — lọc thêm theo MỘT đứa trẻ, dùng khi đi từ trang Tài khoản sang.
   *
   * VUÔNG GÓC với `loc`, không phải một giá trị nữa của nó: bốn bộ lọc trạng thái
   * phải rời nhau và cộng lại đúng bằng "Tất cả" (e2e-moderation canh bất biến này
   * bằng phép cộng), nên nhét "theo bé" vào cùng danh sách đó là phá đúng thứ đang
   * được canh. Ở đây nó AND vào sau, tức "game của bé này, trong nhóm đang xem".
   *
   * Không kiểm id có tồn tại: id sai chỉ ra danh sách rỗng, và một trang rỗng kèm
   * dòng chữ "đang lọc theo bé" đã tự nói ra chuyện gì xảy ra.
   */
  const be = (sp.be ?? '').trim();
  const loc = whereFor(filter);
  const where: Prisma.GameWhereInput = be ? { AND: [loc, { childId: be }] } : loc;

  /* Tên bé để hiện trên dòng "đang lọc" — không có tên thì người trực chỉ thấy một
     cuid trong URL và không biết mình đang xem con của nhà nào. */
  const beDangLoc = be
    ? await prisma.child.findUnique({
        where: { id: be },
        select: { displayName: true, username: true },
      })
    : null;

  const [total, games, takedowns] = await Promise.all([
    prisma.game.count({ where }),
    prisma.game.findMany({
      where,
      /*
       * `trustedReportCount` lên trước `reportCount`: game mà HỆ THỐNG đã tự siết
       * là game đang bị hạn chế ngay lúc này mà chưa người nào xem nội dung, nên nó
       * phải nằm trên một game mới chỉ ồn ào vì nhiều khách vãng lai bấm nút. Xếp
       * theo tổng số báo cáo thôi thì một game bị vùi oan có thể trôi xuống dưới
       * hàng chục game chưa ai làm gì cả.
       */
      orderBy: [{ trustedReportCount: 'desc' }, { reportCount: 'desc' }, { updatedAt: 'desc' }],
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
      /*
        `clear-left` vì trên khổ điện thoại ảnh bìa là một float trái. `<summary>` là
        inline-flex, tức một BFC, nên nó KHÔNG chảy quanh float — nó bị ép hẹp lại nằm
        cạnh ảnh. Chỉ xảy ra với thẻ ít chữ nhất (ba dòng, ~84px, so với ảnh ~80px) nên
        đây là mép sát chứ không phải chuyện xa xôi. Ở khổ rộng không có float nào nên
        luật này không làm gì cả.
      */
      <details className="mt-2 clear-left text-sm" data-testid={testId}>
        <summary className="min-h-touch inline-flex cursor-pointer items-center font-semibold text-ink-soft">
          {label} ({logs.length})
        </summary>
        <ul className="mt-1 list-none space-y-1 p-0 text-ink-soft">
          {logs.map((log) => (
            <li key={log.id}>
              — {actionLabel(log.action)} · {actorName(log.actorId)} ·{' '}
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
  /* `be` phải đi theo MỌI link đổi bộ lọc và đổi trang: rơi mất nó thì bấm sang tab
     khác là lặng lẽ nhảy về toàn bộ game, trong khi dòng "đang lọc theo bé" vừa biến
     mất cũng lặng lẽ như vậy. */
  const linkTo = (f: FilterKey, p: number) =>
    `/admin?loc=${f}${p > 1 ? `&trang=${p}` : ''}${be ? `&be=${encodeURIComponent(be)}` : ''}`;

  return (
    <>
      {/* Email người đang đăng nhập từng ở trong dòng này, đã bỏ: thanh của khu quản
          trị hiện nó ở mọi trang. Còn lại đúng thứ chỉ trang này cần nói — hai ngưỡng
          tự ẩn, vì mọi con số trên trang phải đọc theo chúng. */}
      <PageTitle
        title="Kiểm duyệt"
        lead={`${REPORT_AUTO_HIDE_THRESHOLD} báo cáo đã xác minh thì ẩn mềm, ${REPORT_HARD_HIDE_THRESHOLD} thì ẩn hẳn`}
      />

      {/*
        Dòng dẫn sang trang lỗi từng nằm ở đây, đã BỎ: thanh tab của khu quản trị
        (`app/admin/admin-nav.tsx`) mang số nhóm lỗi chưa xử lý, và mang nó ở MỌI
        trang trong khu chứ không riêng trang này. Giữ cả hai là hai chỗ nói cùng một
        con số, rồi sớm muộn một chỗ nói sai.
      */}

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
                  /* Cả hàng đợi này đã nằm trên nền cảnh báo, nên vạch trái ở đây chỉ
                     phân biệt QUÁ HẠN với chưa: đỏ là hạn đã hứa công khai bị vỡ, cam
                     là đang trong hạn. Cùng thứ tiếng với ba tab kia. */
                  className={`rounded-card border border-warn-border bg-warn-bg p-5 border-l-4 ${
                    overdue ? 'border-l-danger' : 'border-l-accent'
                  }`}
                >
                  {/*
                    `req.game` CÓ THỂ NULL, và đó là trạng thái bình thường chứ không
                    phải dữ liệu hỏng: game gỡ hẳn bị xoá khỏi DB sau hạn giữ
                    (`NGAY_GIU_GAME_DA_GO`), khoá ngoại là `SetNull`, còn hàng yêu cầu
                    thì phải sống vì nó là hồ sơ pháp lý. Lúc đó chỉ còn `gameTitle`
                    đã chụp sẵn, và KHÔNG được render link — link tới một game không
                    tồn tại là gửi người kiểm duyệt vào trang 404.
                  */}
                  <p className="text-lg font-bold">
                    {req.game ? (
                      <>
                        <LinkCho href={`/game/${req.game.id}`}>{req.game.title}</LinkCho>{' '}
                        <span className="align-middle text-sm font-semibold text-ink-soft">
                          ({STATUS_LABEL[req.game.status] ?? req.game.status})
                        </span>
                      </>
                    ) : (
                      <>
                        {req.gameTitle || '(không còn tên)'}{' '}
                        <span className="align-middle text-sm font-semibold text-ink-soft">
                          (đã xoá hẳn khỏi hệ thống)
                        </span>
                      </>
                    )}
                  </p>
                  {req.game && (
                    <p className="text-sm text-ink-soft">
                      Của bé {req.game.child.displayName} ({req.game.child.username})
                    </p>
                  )}

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

      {be && (
        <Notice tone="info" role="status">
          <span data-testid="admin-loc-be">
            Đang lọc theo bé{' '}
            <strong>
              {beDangLoc ? `${beDangLoc.displayName} (${beDangLoc.username})` : 'không tìm thấy'}
            </strong>
            .
          </span>{' '}
          <LinkCho href={`/admin?loc=${filter}`}>Bỏ lọc, xem tất cả</LinkCho>
        </Notice>
      )}

      <nav className="mb-5 flex flex-wrap gap-2" data-testid="admin-filters">
        {FILTERS.map((f) => (
          <LinkCho
            key={f.key}
            href={linkTo(f.key, 1)}
            data-testid={`admin-filter-${f.key}`}
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
        Cho hiện lại và Bỏ qua báo cáo đều đưa số đếm báo cáo về 0. Không đưa về 0 thì chỉ thêm
        một báo cáo nữa là game bị ẩn lại ngay, và quyết định của bạn bị lật mà không rõ vì sao.
      </Notice>

      <p className="mt-4 text-sm text-ink-soft" data-testid="admin-total">
        {total} game · trang {page}/{lastPage}
      </p>

      {games.length === 0 ? (
        <EmptyState>
          Không có game nào trong mục này. <LinkCho href="/">Về trang chủ</LinkCho>
        </EmptyState>
      ) : (
        <ul className="mb-8 mt-3 list-none space-y-4 p-0" data-testid="admin-list">
          {games.map((game) => {
            /*
             * VẠCH TRẠNG THÁI, cùng thứ tiếng đã dùng ở Tổng quan và ở tab Lỗi: đỏ =
             * có hạn hoặc mất vĩnh viễn, cam = có việc chờ người, xám = không có gì.
             *
             * Ở đây "đỏ" là game ĐÃ GỠ, vì chỉ nhóm đó có đồng hồ chạy: bảy ngày nữa
             * hàng DB, bản đóng gói, ảnh bìa và `.sb3` gốc của bé đi hẳn, và nút "Cho
             * hiện lại" trên chính thẻ này hết tác dụng. Mọi trạng thái khác đều đảo
             * lại được, nên không cái nào đáng tranh màu đỏ với nó.
             *
             * Game đang hiện mà có báo cáo cũng lên cam: nó là việc chờ người xem, dù
             * hệ thống chưa siết gì cả.
             */
            const vach =
              game.status === 'REMOVED'
                ? 'border-l-danger'
                : game.status !== 'PUBLISHED' || game.reportCount > 0
                  ? 'border-l-accent'
                  : 'border-l-border';
            return (
            <li
              key={game.id}
              /*
                Từ `xl` trở lên thì thẻ thành HAI CỘT: thông tin bên trái, cụm nút bên
                phải. Khu quản trị rộng 1600px, nên xếp dọc như trước để lại một dải
                trống gần một nghìn pixel bên phải mỗi thẻ, trong khi cụm nút thì nằm
                dưới ảnh và đẩy thẻ cao lên.
              */
              className={`border-l-4 p-5 ${MAT_THE} ${vach} xl:flex xl:items-start xl:gap-6`}
              data-testid="admin-game"
              data-game-id={game.id}
            >
              <div className="sm:flex sm:flex-wrap sm:items-start sm:gap-4 xl:min-w-0 xl:flex-1">
                {/*
                  Ảnh nằm trên player origin nên dùng <img> thường, giống game-card:
                  next/image sẽ đòi cấu hình remotePatterns mà chẳng được lợi gì thêm.

                  DƯỚI `sm` LÀ FLOAT, KHÔNG PHẢI Ô FLEX. Ảnh 160px cạnh một ô flex ở
                  màn 390px để lại đúng 132px cho chữ: tên game xuống 7 dòng và thẻ cao
                  608px, mà dưới ảnh thì trống một cột 120px không ai dùng. Ô flex
                  không chảy được xuống dưới ảnh — float thì có, nên mấy dòng sau nhận
                  cả 308px. Đo ở 390px: cột chữ 132 -> 308, thẻ dài nhất 608 -> 433,
                  cả trang 4138 -> 3501.

                  Thu ảnh còn `w-24` là bước đầu và MỘT MÌNH NÓ KHÔNG ĐỦ: nó chỉ đưa
                  cột chữ lên 196px, thẻ thường 320 -> 300, vì cái tốn chỗ không phải
                  ảnh mà là mọi dòng chữ đều bị bó trong phần bề ngang còn lại.

                  Không xếp ảnh thành một hàng riêng phía trên: đo ra không hơn gì (ảnh
                  chiếm trọn một dòng cao bằng đúng chỗ nó vừa nhường), mà lại mất luôn
                  việc nhìn bìa và tên game trong cùng một tia mắt — việc chính của
                  người trực khi lướt hàng chờ.
                */}
                <AnhBia
                  src={objectUrl('thumb', game.thumbSha256)}
                  ten={game.title}
                  loading="lazy"
                  width={160}
                  height={120}
                  className="float-left mr-3 mb-2 aspect-4/3 w-24 rounded-field bg-bg object-cover sm:float-none sm:m-0 sm:block sm:w-40 sm:shrink-0"
                />

                <div className="sm:min-w-0 sm:flex-1">
                  <p className="text-lg font-bold">
                    {/* Admin xem được cả game đã ẩn — xem ngoại lệ trong /game/[id]/page.tsx */}
                    <LinkCho href={`/game/${game.id}`}>{game.title}</LinkCho>{' '}
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
                  {/*
                    Hiện cả hai con số, vì chỉ một mình `reportCount` thì gây hiểu sai
                    theo đúng hướng nguy hiểm: admin thấy "5 báo cáo" mà game vẫn đang
                    hiện sẽ tưởng cơ chế tự động bị hỏng, trong khi thật ra cả 5 đều
                    của khách vãng lai nên không cái nào tính vào ngưỡng. Số trong
                    ngoặc mới là số quyết định trạng thái.
                  */}
                  <p className="text-sm text-ink-soft" data-testid="admin-report-count">
                    {game.reportCount} báo cáo ({game.trustedReportCount} đã xác minh) ·{' '}
                    {game.playCount} lượt chơi
                  </p>

                  {/*
                    HẠN XOÁ HẲN, chỉ hiện với game đã gỡ.
                    
                    Phải nằm ngay đây, cạnh nút "Cho hiện lại", vì sau hạn này chính
                    cái nút ấy không còn gì để hiện lại: hàng trong DB, file `.sb3`
                    của bé, HTML và ảnh bìa đều đi hẳn. Người trực cần biết mình còn
                    mấy ngày để đổi ý, chứ không phải phát hiện ra bằng cách bấm một
                    cái nút không làm gì cả.
                  */}
                  {game.status === 'REMOVED' && (
                    <p className="text-sm font-semibold" data-testid="admin-han-xoa">
                      {(() => {
                        const han = hanXoaHan(game.removedAt);
                        if (!han) {
                          return (
                            <span className="text-ink-soft">
                              Chưa có mốc thời gian gỡ — đồng hồ {NGAY_GIU_GAME_DA_GO} ngày bắt
                              đầu ở lần dọn kế tiếp.
                            </span>
                          );
                        }
                        const conMs = han.getTime() - Date.now();
                        const conNgay = Math.ceil(conMs / 86400_000);
                        return conMs <= 0 ? (
                          <span className="text-danger">
                            Đã quá hạn giữ — sẽ bị XOÁ HẲN ở lần dọn kế tiếp, không hoàn tác được.
                          </span>
                        ) : (
                          <span className="text-danger">
                            Sẽ bị xoá hẳn{' '}
                            <time dateTime={han.toISOString()}>{han.toLocaleDateString('vi-VN')}</time>{' '}
                            — còn {conNgay} ngày để cho hiện lại.
                          </span>
                        );
                      })()}
                    </p>
                  )}

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
                DƯỚI `xl`: nút xuống hàng riêng chứ không xếp cạnh phần chữ. Ba nút
                cạnh nhau chiếm gần nửa bề ngang, ép cột thông tin hẹp lại tới mức
                email và trạng thái tài khoản gãy dòng lung tung.

                TỪ `xl`: thành một cột dọc bên phải, bề rộng chốt cứng. Chốt cứng để
                cụm nút của mọi thẻ thẳng lề nhau — nút "Gỡ hẳn" nhảy trái phải theo
                độ dài tiêu đề game là kiểu bố cục làm người ta bấm nhầm.
              */}
              <div className="mt-4 clear-left flex flex-wrap items-center gap-2 xl:mt-0 xl:w-56 xl:shrink-0 xl:flex-col xl:items-stretch">
                {game.status !== 'PUBLISHED' && <RestoreGameButton gameId={game.id} />}
                {/* Game vẫn đang hiện mà dính báo cáo sai: dọn báo cáo, giữ nguyên game. */}
                {game.status === 'PUBLISHED' && game.reportCount > 0 && (
                  <DismissReportsButton gameId={game.id} />
                )}
                {game.status !== 'REMOVED' && <RemoveGameButton gameId={game.id} />}
                <ChildLockButton childId={game.child.id} isLocked={game.child.isLocked} />
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {/* `Pager` tự trả null khi chỉ có một trang — không bọc thêm điều kiện ở đây,
          hai chỗ cùng quyết định một việc thì sớm muộn lệch nhau. */}
      <Pager
        page={page}
        lastPage={lastPage}
        href={(p) => linkTo(filter, p)}
        testId="admin-pager"
        className="mb-12"
      />
    </>
  );
}
