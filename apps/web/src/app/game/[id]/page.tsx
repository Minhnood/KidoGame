import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getActor } from '@/lib/session';
import { objectUrl } from '@/lib/storage';
import { ButtonAnchor, ButtonLink } from '@/components/button';
import { Notice } from '@/components/notice';
import { PageTitle } from '@/components/page';
import { PlayCounter } from './play-counter';
import { ReportForm } from './report-form';
import { StageFrame } from './stage-frame';

export const dynamic = 'force-dynamic';

interface Warning {
  code: string;
  message: string;
}

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const game = await prisma.game.findUnique({
    where: { id },
    include: { child: { select: { displayName: true } } },
  });

  /*
   * Game bị ẩn hoặc gỡ thì coi như không tồn tại với người xem thường.
   *
   * Ngoại lệ DUY NHẤT là admin: nếu không có ngoại lệ này thì admin phải quyết định
   * gỡ hẳn hay cho hiện lại mà không hề nhìn thấy nội dung game — bấm vào tên game
   * từ trang /admin cũng nhận 404. Kiểm duyệt mù như vậy còn tệ hơn không kiểm duyệt.
   *
   * Lưu ý phạm vi: đây CHỈ nới cho admin. Phụ huynh vẫn không xem được game đã ẩn
   * của con mình qua đường này.
   */
  const actor = await getActor();
  const isAdmin = actor?.kind === 'parent' && actor.isAdmin;
  if (!game || (game.status !== 'PUBLISHED' && !isAdmin)) notFound();

  const warnings = (Array.isArray(game.warnings) ? game.warnings : []) as unknown as Warning[];
  const cloudWarning = warnings.find((w) => w.code === 'CLOUD_VARIABLES');

  return (
    <>
      <PageTitle
        title={game.title}
        lead={`Của bé ${game.child.displayName} · ${game.playCount} lượt chơi`}
      />

      {game.status !== 'PUBLISHED' && (
        <div className="mx-auto max-w-180" data-testid="admin-preview-banner">
          <Notice tone="warn" role="status">
            Game này {game.status === 'HIDDEN' ? 'đang bị ẩn' : 'đã bị gỡ'}, người thường vào đây
            sẽ nhận 404. Bạn đang xem với quyền admin để kiểm duyệt — lượt chơi không được tính.
          </Notice>
        </div>
      )}

      {/* Chỉ đếm lượt chơi thật. Admin vào xem để kiểm duyệt không phải là một lượt chơi. */}
      {game.status === 'PUBLISHED' && <PlayCounter gameId={game.id} />}

      {/* Mọi thuộc tính bảo mật của iframe nằm trong StageFrame — sửa ở đó. */}
      <StageFrame src={objectUrl('html', game.htmlSha256)} title={game.title} />

      <div className="mx-auto max-w-180">
        {cloudWarning && <Notice tone="warn">{cloudWarning.message}</Notice>}

        {game.description && <p className="mt-4">{game.description}</p>}

        <div className="mt-5 flex flex-wrap gap-2.5">
          {/* Tải source gốc: văn hoá cốt lõi của Scratch, trẻ học bằng cách mở game của nhau. */}
          <ButtonAnchor variant="ghost" href={objectUrl('sb3', game.sb3Sha256)} download>
            Tải file .sb3 gốc
          </ButtonAnchor>
          <ButtonLink href="/" variant="ghost">
            Xem game khác
          </ButtonLink>
        </div>

        {/* Game đã ẩn/gỡ thì không có gì để báo cáo nữa — nút chỉ dẫn tới lỗi. */}
        <div className="mb-12">
          {game.status === 'PUBLISHED' && <ReportForm gameId={game.id} />}
        </div>
      </div>
    </>
  );
}
