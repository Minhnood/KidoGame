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

  /*
   * LIMITED chơi được với MỌI người — đó là toàn bộ ý nghĩa của ẩn mềm. Game chỉ
   * biến mất khỏi trang chủ, tìm kiếm và các danh sách; ai có link vẫn vào được.
   */
  const xemDuoc = game?.status === 'PUBLISHED' || game?.status === 'LIMITED';
  if (!game || (!xemDuoc && !isAdmin)) notFound();

  const warnings = (Array.isArray(game.warnings) ? game.warnings : []) as unknown as Warning[];
  const cloudWarning = warnings.find((w) => w.code === 'CLOUD_VARIABLES');

  return (
    <>
      <PageTitle
        title={game.title}
        lead={`Của bé ${game.child.displayName} · ${game.playCount} lượt chơi`}
      />

      {/*
        Banner này CHỈ cho admin, và chỉ cho game người thường không xem được.

        Với LIMITED thì cố ý KHÔNG có banner nào cho người xem thường: game vẫn chơi
        được bình thường, mà dán lên đó dòng "game này đang bị báo cáo" thì mọi người
        bé gửi link cho đều đọc được — biến một biện pháp tạm thời, chưa ai xác minh,
        thành một lời buộc tội công khai nhắm vào đứa trẻ làm ra game.
      */}
      {!xemDuoc && (
        <div className="mx-auto max-w-180" data-testid="admin-preview-banner">
          <Notice tone="warn" role="status">
            Game này {game.status === 'HIDDEN' ? 'đang bị ẩn' : 'đã bị gỡ'}, người thường vào đây
            sẽ nhận 404. Bạn đang xem với quyền admin để kiểm duyệt — lượt chơi không được tính.
          </Notice>
        </div>
      )}

      {isAdmin && game.status === 'LIMITED' && (
        <div className="mx-auto max-w-180" data-testid="admin-limited-banner">
          <Notice tone="warn" role="status">
            Game này đang bị ẩn mềm vì đủ báo cáo: không hiện trên trang chủ và tìm kiếm, nhưng
            link trực tiếp vẫn chơi được. Người xem thường không thấy dòng này.
          </Notice>
        </div>
      )}

      {/* Chỉ đếm lượt chơi thật. Admin vào xem để kiểm duyệt không phải là một lượt chơi.
          LIMITED vẫn đếm: người vào bằng link là người chơi thật. */}
      {xemDuoc && <PlayCounter gameId={game.id} />}

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

        {/*
          Game đã ẩn/gỡ thì không có gì để báo cáo nữa — nút chỉ dẫn tới lỗi.

          Nhưng game LIMITED thì VẪN báo cáo được, cố ý: nó vẫn đang chơi được bằng
          link, và chính nó là loại game cần thêm tín hiệu nhất. Bỏ nút ở đây thì mức
          ẩn mềm thành cái sàn không bao giờ leo lên ẩn hẳn được.
        */}
        <div className="mb-12">{xemDuoc && <ReportForm gameId={game.id} />}</div>
      </div>
    </>
  );
}
