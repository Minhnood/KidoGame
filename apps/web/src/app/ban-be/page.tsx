import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageTitle, EmptyState } from '@/components/page';
import { Notice } from '@/components/notice';
import { getActorTrongLuotRender as getActor } from '@/lib/session';
import { docDangTheoDoi } from '@/lib/theo-doi';
import { NutBoTheoDoi } from './nut-bo-theo-doi';

export const dynamic = 'force-dynamic';

/**
 * Các bạn bé đang theo dõi.
 *
 * Trang này tồn tại vì một lý do hẹp: nút theo dõi nằm trên TRANG GAME, nên bỏ theo
 * dõi mà không có trang này thì bé phải tìm lại một game của bạn ấy mới bỏ được —
 * một việc đơn giản bị khoá sau việc nhớ đường.
 *
 * ═══ TRANG NÀY CHỈ CÓ MỘT CHIỀU ═══
 *
 * Đây là danh sách "tôi đang theo dõi ai". KHÔNG có danh sách "ai đang theo dõi
 * tôi", và không phải vì chưa làm kịp — chiều đó không tồn tại trong sản phẩm, kể
 * cả dưới dạng một con số. Lý do đầy đủ ở `model Follow` và `src/lib/theo-doi.ts`.
 *
 * Nên trang chỉ bé đọc được danh sách của chính mình: không có route `/ban-be/[id]`
 * cho phép xem danh sách của bé khác, và `docDangTheoDoi` luôn được gọi bằng id của
 * chính người đang đăng nhập, không bao giờ bằng một id đến từ URL.
 */
export default async function BanBePage() {
  const actor = await getActor();

  if (!actor) redirect('/be-dang-nhap');

  if (actor.kind !== 'child') {
    return (
      <>
        <PageTitle title="Bạn bè" />
        <Notice tone="info">
          Danh sách bạn bè nằm trong tài khoản của bé. Bé đăng nhập rồi mở lại trang này
          nhé.
        </Notice>
      </>
    );
  }

  const ds = await docDangTheoDoi(actor.id);

  return (
    <>
      <PageTitle
        title="Các bạn bé đang theo dõi"
        lead="Game mới của những bạn này sẽ hiện ở trang chủ của bé."
      />

      {ds.length === 0 ? (
        <EmptyState>
          Bé chưa theo dõi bạn nào.{' '}
          <Link href="/" className="font-bold text-accent-text underline">
            Tìm một game hay
          </Link>{' '}
          rồi bấm “Theo dõi” dưới game đó nhé!
        </EmptyState>
      ) : (
        <ul className="mb-12 space-y-3" data-testid="danh-sach-ban">
          {ds.map((b) => (
            <li
              key={b.authorId}
              data-testid="ban-dang-theo-doi"
              data-child={b.authorId}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-border bg-surface px-4 py-3"
            >
              <span>
                <span className="font-semibold text-ink">{b.ten}</span>
                {/* Số game của BẠN ẤY hiện được, vì nó công khai với mọi người trên
                    trang chủ. Con số bị giấu là số người theo dõi, không phải cái này. */}
                <span className="ml-2 text-sm text-ink-soft">
                  {b.soGame > 0 ? `${b.soGame} game` : 'chưa có game nào'}
                </span>
              </span>
              <NutBoTheoDoi authorId={b.authorId} tenBan={b.ten} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
