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
import { ChildLockButton } from '../admin-controls';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

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
  searchParams: Promise<{ q?: string; trang?: string }>;
}) {
  /* Kiểm quyền ở TỪNG trang, không chỉ ở layout — xem chú thích trong `admin/layout.tsx`. */
  const admin = await getAdmin();
  if (!admin) redirect('/admin/dang-nhap');

  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
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
  const where: Prisma.ParentWhereInput = q
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
    : {};

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
      <form method="get" className="mb-5 flex flex-wrap items-center gap-2" data-testid="tk-form">
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
          <Link href="/admin/tai-khoan" className="min-h-touch inline-flex items-center px-2">
            Xoá tìm kiếm
          </Link>
        )}
      </form>

      <p className="mb-5 text-ink-soft" data-testid="tk-tong">
        {q ? `${total} gia đình khớp "${q}"` : `${total} phụ huynh`} · trang {page}/{soTrang}
      </p>

      {parents.length === 0 ? (
        <EmptyState>
          Không có tài khoản nào khớp. Thử một phần của email, hoặc tên đăng nhập của bé.
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
            </li>
          ))}
        </ul>
      )}

      {soTrang > 1 && (
        <nav className="mt-6 flex flex-wrap items-center gap-3" data-testid="tk-trang">
          {page > 1 && (
            <Link href={`/admin/tai-khoan?q=${encodeURIComponent(q)}&trang=${page - 1}`}>
              ← Trang trước
            </Link>
          )}
          {page < soTrang && (
            <Link href={`/admin/tai-khoan?q=${encodeURIComponent(q)}&trang=${page + 1}`}>
              Trang sau →
            </Link>
          )}
        </nav>
      )}

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
