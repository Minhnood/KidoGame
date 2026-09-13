import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getAdmin } from '@/lib/session';
import { EmptyState, PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { MAT_THE } from '@/components/card';
import { Button } from '@/components/button';
import { TextInput } from '@/components/field';
import { ChildLockButton, DeleteFamilyButton } from '../admin-controls';
import { Pager } from '@/components/pager';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

/*
 * BỘ LỌC — bốn câu hỏi mà người trực thật sự hỏi, không phải bốn lát cắt cho đủ bộ.
 *
 * KHÁC HẲN bộ lọc của tab Kiểm duyệt ở một điểm phải nói rõ, không thì có ngày ai đó
 * "sửa cho nhất quán": bốn bộ lọc trạng thái bên kia là một PHÂN HOẠCH — rời nhau và
 * cộng lại đúng bằng "Tất cả", có phép kiểm canh bằng phép cộng. Bốn cái ở đây thì
 * KHÔNG, và cố ý không: một phụ huynh chưa xác minh email gần như chắc chắn cũng chưa
 * có bé nào (chưa xác minh thì không tạo được tài khoản cho con), nên hai nhóm chồng
 * lên nhau gần hết. Ép chúng rời nhau là bịa ra ranh giới không có thật, còn cộng
 * chúng lại rồi so với tổng là so một phép tính vô nghĩa.
 *
 * `co-be-khoa` lọc theo GIA ĐÌNH có ít nhất một bé đang khoá, không lọc ra từng bé:
 * đơn vị của cả trang này là gia đình, và một dòng bé hiện lên mà không có phụ huynh
 * đứng cạnh thì thiếu đúng người phải liên lạc khi cần giải thích việc khoá.
 */
const FILTERS = [
  { key: 'tat-ca', label: 'Tất cả' },
  { key: 'chua-xac-minh', label: 'Chưa xác minh email' },
  { key: 'co-be-khoa', label: 'Có bé đang khoá' },
  { key: 'chua-co-be', label: 'Chưa có bé nào' },
  { key: 'quan-tri', label: 'Có quyền quản trị' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function whereFor(filter: FilterKey): Prisma.ParentWhereInput {
  switch (filter) {
    case 'chua-xac-minh':
      return { emailVerifiedAt: null };
    case 'co-be-khoa':
      return { children: { some: { isLocked: true } } };
    case 'chua-co-be':
      return { children: { none: {} } };
    case 'quan-tri':
      return { isAdmin: true };
    case 'tat-ca':
    default:
      return {};
  }
}

/**
 * Tra cứu tài khoản.
 *
 * VÌ SAO CẦN, và đây là một lỗ hổng chức năng thật chứ không phải chuyện tiện tay:
 * trước trang này, nút khoá tài khoản của một đứa trẻ CHỈ tồn tại trên dòng game
 * trong hàng đợi kiểm duyệt. Nghĩa là một đứa trẻ chưa đăng game nào — hoặc game của
 * nó đều sạch — thì không có đường nào khoá được, dù lý do khoá thường đến từ chỗ
 * khác hẳn: phụ huynh viết thư báo con bị người lạ mượn tài khoản, hay chính phụ
 * huynh xin khoá. Người trực lúc đó chỉ còn cách vào thẳng database.
 *
 * Và chiều ngược lại cũng vậy: khi một phụ huynh gửi thư hỏi "game của con tôi đâu
 * rồi", thứ họ đưa là ĐỊA CHỈ EMAIL của họ. Không có ô tìm theo email thì người trực
 * phải lật từng trang hàng đợi để đoán xem gia đình nào là gia đình đó.
 *
 * CỐ Ý KHÔNG tìm theo tên game ở đây: đó là việc của tab Kiểm duyệt, và một ô tìm
 * kiếm trả về hai loại kết quả khác nhau là ô tìm kiếm mà người ta phải đọc kỹ mới
 * biết mình đang nhìn cái gì.
 */
export default async function AdminTaiKhoanPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; loc?: string; trang?: string }>;
}) {
  /* Kiểm quyền ở TỪNG trang, không chỉ ở layout — xem chú thích trong `admin/layout.tsx`. */
  const admin = await getAdmin();
  if (!admin) redirect('/admin/dang-nhap');

  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  /* `loc`, cùng tên tham số với hai tab kia. Gõ tên khác ở trang thứ ba là để dành sẵn
     một lần gõ nhầm cho chính mình về sau, mà gõ nhầm thì Next im lặng bỏ qua và trang
     lặng lẽ về bộ lọc mặc định. */
  const filter = (FILTERS.find((f) => f.key === sp.loc)?.key ?? 'tat-ca') as FilterKey;
  const page = Math.max(1, Number(sp.trang ?? '1') || 1);

  /*
   * Tìm ở CẢ HAI phía của một gia đình rồi trả về phụ huynh.
   *
   * Người trực gõ vào đây một trong hai thứ: email của phụ huynh (lấy từ thư họ gửi
   * tới), hoặc tên đăng nhập của bé (lấy từ trang game). Trả về hai loại kết quả
   * khác nhau tuỳ chuỗi gõ vào thì danh sách không so sánh được với nhau; trả về
   * luôn là GIA ĐÌNH thì cả hai đường đều dẫn tới cùng một thứ, và tài khoản bé nào
   * cũng hiện ra kèm người chịu trách nhiệm cho nó.
   *
   * `insensitive` vì email người ta gõ hoa hay thường tuỳ lúc, mà một ô tìm kiếm
   * không tìm ra kết quả trông hệt như "không có tài khoản này" — kết luận sai đúng
   * vào lúc đang cần trả lời một phụ huynh.
   */
  const timKiem: Prisma.ParentWhereInput | null = q
    ? {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          {
            children: {
              some: {
                OR: [
                  { username: { contains: q, mode: 'insensitive' } },
                  { displayName: { contains: q, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      }
    : null;

  /*
   * Ô tìm kiếm và bộ lọc phải AND với nhau, không thay thế nhau.
   *
   * Đây là chỗ dễ làm sai theo hướng im lặng: nếu bộ lọc ghi đè ô tìm kiếm thì gõ một
   * email rồi bấm "Có bé đang khoá" sẽ ra CẢ những gia đình khác, và trông vẫn hợp lý
   * — một danh sách có kết quả. Người trực sẽ đọc dòng đầu tiên tưởng là nhà mình vừa
   * tìm, rồi bấm khoá tài khoản một đứa trẻ không liên quan.
   */
  const loc = whereFor(filter);
  const where: Prisma.ParentWhereInput = timKiem ? { AND: [timKiem, loc] } : loc;

  const [total, parents] = await Promise.all([
    prisma.parent.count({ where }),
    prisma.parent.findMany({
      where,
      /* Mới nhất lên đầu khi không tìm gì: ô rỗng thì câu hỏi ngầm là "ai vừa vào",
         không phải "ai vào sớm nhất". */
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        isAdmin: true,
        createdAt: true,
        children: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            username: true,
            displayName: true,
            isLocked: true,
            createdAt: true,
            /* Đếm game bằng `_count` chứ không kéo cả danh sách: trang này liệt kê
               20 gia đình, mỗi gia đình vài bé — kéo game của từng bé là hàng chục
               truy vấn cho một con số. */
            _count: { select: { games: true } },
          },
        },
      },
    }),
  ]);

  const soTrang = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /* Mọi link rời trang này đều phải mang theo CẢ HAI: bộ lọc và chuỗi tìm kiếm. Rơi
     một cái là danh sách đổi mà người dùng không ra lệnh gì — và đổi im lặng, vì cả
     hai đều nằm trong URL chứ không có gì trên màn hình kêu lên. */
  const linkTo = (f: FilterKey, chuoi: string, p = 1) => {
    const params = new URLSearchParams();
    if (f !== 'tat-ca') params.set('loc', f);
    if (chuoi) params.set('q', chuoi);
    if (p > 1) params.set('trang', String(p));
    const s = params.toString();
    return `/admin/tai-khoan${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <PageTitle
        title="Tài khoản"
        lead="Tìm một gia đình theo email của phụ huynh, hoặc theo tên đăng nhập của bé."
      />

      {/*
        Form GET, không phải server action.
        Kết quả tìm kiếm phải nằm trong URL: người trực cần gửi được đường dẫn ấy cho
        người khác, cần bấm nút back, và cần tải lại trang sau khi khoá một tài khoản
        mà vẫn đang ở đúng chỗ vừa tìm.
      */}
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2" data-testid="tk-form">
        {/* Bộ lọc đang chọn phải đi theo lần tìm kiếm mới. Không có dòng này thì gõ
            một email rồi bấm Tìm là bộ lọc lặng lẽ nhảy về "Tất cả", và danh sách đổi
            vì một lý do người dùng không hề ra lệnh. */}
        {filter !== 'tat-ca' && <input type="hidden" name="loc" value={filter} />}
        <label htmlFor="q" className="sr-only">
          Email phụ huynh hoặc tên đăng nhập của bé
        </label>
        <TextInput
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="email@vidu.com hoặc tenbe"
          className="min-w-0 flex-1"
        />
        <Button type="submit" data-testid="tk-tim">
          Tìm
        </Button>
        {q && (
          <Link href={linkTo(filter, '')} className="min-h-touch inline-flex items-center px-2">
            Xoá tìm kiếm
          </Link>
        )}
      </form>

      <nav className="mb-5 flex flex-wrap gap-2" data-testid="tk-filters">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={linkTo(f.key, q)}
            data-testid={`tk-filter-${f.key}`}
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

      <p className="mb-5 text-ink-soft" data-testid="tk-tong">
        {q ? `${total} gia đình khớp "${q}"` : `${total} phụ huynh`}
        {filter !== 'tat-ca' && ` · lọc: ${FILTERS.find((f) => f.key === filter)?.label}`} · trang{' '}
        {page}/{soTrang}
      </p>

      {parents.length === 0 ? (
        <EmptyState>
          Không có tài khoản nào khớp. Thử một phần của email, hoặc tên đăng nhập của bé.
          {filter !== 'tat-ca' && (
            <>
              {' '}
              Đang lọc <strong>{FILTERS.find((f) => f.key === filter)?.label}</strong> —{' '}
              <Link href={linkTo('tat-ca', q)}>bỏ lọc</Link> thì có thể ra.
            </>
          )}
        </EmptyState>
      ) : (
        <ul className="list-none space-y-4 p-0">
          {parents.map((parent) => (
            <li key={parent.id} className={`p-5 ${MAT_THE}`} data-testid="tk-gia-dinh">
              <p className="text-lg font-bold" data-testid="tk-email">
                {parent.email}{' '}
                {parent.isAdmin && (
                  <span className="align-middle text-sm font-bold text-accent-text">· admin</span>
                )}
              </p>
              <p className="text-sm text-ink-soft">
                {/*
                  Trạng thái xác minh phải hiện ở đây, vì nó giải thích trước hai câu
                  hỏi mà người trực sẽ hỏi ngay sau đó: vì sao nhà này chưa có bé nào
                  (chưa xác minh thì không tạo được tài khoản cho con), và vì sao báo
                  cáo của họ không làm game nào bị ẩn (chỉ báo cáo của phụ huynh đã
                  xác minh mới tính vào ngưỡng).
                */}
                {parent.emailVerifiedAt ? (
                  <>Đã xác minh email {parent.emailVerifiedAt.toLocaleDateString('vi-VN')}</>
                ) : (
                  <span className="font-semibold text-danger">Chưa xác minh email</span>
                )}{' '}
                · tạo ngày {parent.createdAt.toLocaleDateString('vi-VN')} ·{' '}
                {parent.children.length} bé
              </p>

              {parent.children.length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">Chưa tạo tài khoản cho bé nào.</p>
              ) : (
                <ul className="mt-3 list-none space-y-2 p-0">
                  {parent.children.map((child) => (
                    <li
                      key={child.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-field border border-border bg-bg px-3.5 py-3"
                      data-testid="tk-be"
                      data-child-id={child.id}
                    >
                      <span className="font-bold">
                        {child.displayName}{' '}
                        <span className="font-semibold text-ink-soft">({child.username})</span>
                      </span>
                      {child.isLocked && (
                        <span className="font-semibold text-danger" data-testid="tk-be-khoa">
                          đang khoá
                        </span>
                      )}
                      {/*
                        Số game dẫn thẳng sang hàng đợi ĐÃ LỌC theo đúng bé này. Không
                        có đường đó thì người trực đọc "3 game" rồi phải tự đi tìm ba
                        game ấy giữa cả danh sách — và tìm bằng mắt theo tên bé là chỗ
                        rất dễ bấm nhầm sang game của một đứa trẻ khác trùng tên hiển
                        thị, mà nút bên cạnh là "Gỡ hẳn".
                      */}
                      <Link href={`/admin?loc=tat-ca&be=${child.id}`} className="text-sm">
                        {child._count.games} game
                      </Link>
                      <span className="ml-auto">
                        <ChildLockButton childId={child.id} isLocked={child.isLocked} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/*
                Quyền xoá tài khoản mà `/dieu-khoan` đã hứa công khai. Trước khi có nút
                này, lời hứa ấy chỉ thực hiện được bằng SQL gõ tay vào production.

                KHÔNG hiện nút cho tài khoản admin, thay bằng một câu nói vì sao. Lõi
                `xoaGiaDinh` vẫn từ chối, nhưng để nút hiện rồi mới báo đỏ thì người
                trực đã gõ xong cả email trước khi biết là không được — và ở đây, gõ
                xong email nghĩa là họ vừa quyết định xoá một gia đình.
              */}
              <div className="mt-4 border-t border-border pt-3">
                {parent.isAdmin ? (
                  <p className="text-sm text-ink-soft">
                    Không xoá được tài khoản đang có quyền quản trị: mọi vết kiểm duyệt
                    người này từng ghi trên game nhà khác sẽ mất chỗ tra ra tên. Gỡ quyền
                    admin trước.
                  </p>
                ) : (
                  <DeleteFamilyButton
                    email={parent.email}
                    soBe={parent.children.length}
                    soGame={parent.children.reduce((t, c) => t + c._count.games, 0)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager
        page={page}
        lastPage={soTrang}
        href={(p) => linkTo(filter, q, p)}
        testId="tk-trang"
        className="mt-6"
      />

      <Notice tone="info">
        Khoá tài khoản bé thì bé không đăng nhập được nữa, và mọi phiên đang mở của bé
        mất hiệu lực ngay — kể cả phiên trên máy khác. Game của bé{' '}
        <strong>không bị ẩn</strong> theo: khoá là chuyện của tài khoản, ẩn game là
        chuyện của nội dung, và trộn hai việc vào một nút thì không nút nào đảo lại được
        đúng thứ nó vừa làm.
      </Notice>
    </>
  );
}
