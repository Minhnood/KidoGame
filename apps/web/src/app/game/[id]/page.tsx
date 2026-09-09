import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getActor } from '@/lib/session';
import { objectUrl } from '@/lib/storage';
import { gameDangBiKhieuNai } from '@/lib/takedown';
/*
 * Dùng lại đúng nút của trang bố mẹ, KHÔNG chép ra một bản thứ hai. Nút này quyết
 * định nhãn ("Ẩn game" hay "Hiện lại") theo cùng một luật; hai bản song song sẽ lệch
 * ngay lần đầu có người sửa luật ở một bên, và lệch kiểu đó im lặng.
 */
import { GameVisibilityToggle } from '@/app/phu-huynh/child-controls';
import { ButtonAnchor, ButtonLink } from '@/components/button';
import { GameCard } from '@/components/game-card';
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
    include: {
      // `parentId` để biết người đang xem có phải bố mẹ của bé này không.
      child: { select: { displayName: true, parentId: true } },
      tags: { include: { tag: { select: { slug: true, label: true } } } },
    },
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
  /*
   * DỰA VÀO PHIÊN SITE + cờ isAdmin, KHÔNG dùng `getAdmin()` — và đây là một quyết
   * định có chủ ý, không phải chỗ bị bỏ sót khi tách origin.
   *
   * Trang này nằm trên app origin, nên cookie phiên quản trị (host-only trên admin
   * origin) không tới được đây. Dùng `getAdmin()` ở đây thì luôn là null và người
   * kiểm duyệt mất hẳn khả năng NHÌN THẤY nội dung mình đang quyết định — đúng cái
   * mà đoạn trên vừa gọi là kiểm duyệt mù.
   *
   * Phân biệt ĐỌC với GHI, và cái giá của hai bên khác nhau hẳn:
   *
   *  - GHI (ẩn, gỡ hẳn, khoá tài khoản) đòi phiên quản trị. Đó là những việc không
   *    đảo lại được và là những việc một lỗ XSS sẽ muốn gọi tới.
   *  - ĐỌC một game đã bị ẩn thì chỉ cần phiên site có isAdmin. Nếu ai đó khai thác
   *    được XSS trên app origin bằng phiên của một admin, thứ họ thêm được là xem
   *    một game đã bị ẩn — mà nội dung đó chính họ vừa upload cũng xem được. Không
   *    đáng đánh đổi bằng việc làm người kiểm duyệt không thấy gì.
   *
   * Nghĩa là người kiểm duyệt đăng nhập ở HAI cửa: cửa site để xem game, cửa quản
   * trị để bấm nút. Phiên site sống 30 ngày nên trong thực tế đó là một lần.
   */
  const actor = await getActor();
  const isAdmin = actor?.kind === 'parent' && actor.isAdmin;

  /*
   * LIMITED chơi được với MỌI người — đó là toàn bộ ý nghĩa của ẩn mềm. Game chỉ
   * biến mất khỏi trang chủ, tìm kiếm và các danh sách; ai có link vẫn vào được.
   */
  const xemDuoc = game?.status === 'PUBLISHED' || game?.status === 'LIMITED';

  /**
   * Người đang xem có phải bố mẹ của bé làm ra game này không.
   *
   * `parentId` là khoá ngoại thật trong DB, không phải suy ra từ gì cả — nên đây là
   * đúng câu hỏi "game này có phải của nhà mình không", cùng điều kiện mà
   * `setGameHiddenAction` kiểm ở tầng server (`child: { parentId }`). Hai chỗ hỏi
   * cùng một câu là cố ý: nút chỉ hiện ra ở đúng những trang mà bấm vào sẽ chạy.
   */
  const laChuNhan = actor?.kind === 'parent' && game?.child.parentId === actor.id;

  /*
   * Bố mẹ xem được game ĐANG ẨN của con mình. Bàn giao cũ ghi ngược lại điều này,
   * và nó đúng cho tới khi có nút "Ẩn game" trên chính trang này — không nới thì
   * phụ huynh bấm ẩn xong là trang tự trả 404 ngay dưới tay họ, tức một cái nút
   * làm đúng việc của nó mà trông y như vừa làm hỏng cái gì.
   *
   * Chỉ nới tới HIDDEN, KHÔNG nới REMOVED: HIDDEN là quyết định của chính phụ
   * huynh và họ đảo lại được, còn REMOVED là phán quyết của đội kiểm duyệt mà họ
   * không tự lật được — cho xem lại nội dung đó ở đây là mở một cửa mà chính
   * `setGameHiddenAction` đang đóng.
   *
   * Không ảnh hưởng gì tới người lạ: điều kiện đòi đúng `parentId` của bé.
   */
  const chuNhanXemGameAn = laChuNhan && game?.status === 'HIDDEN';

  if (!game || (!xemDuoc && !isAdmin && !chuNhanXemGameAn)) notFound();

  const warnings = (Array.isArray(game.warnings) ? game.warnings : []) as unknown as Warning[];
  const cloudWarning = warnings.find((w) => w.code === 'CLOUD_VARIABLES');

  /*
   * Game khác của cùng một bé.
   *
   * Trước đây hết game là hết đường: chỉ còn nút "Xem game khác" ném về trang chủ.
   * Mà thứ một đứa trẻ vừa chơi xong muốn nhất là xem bạn ấy còn làm gì nữa — đó
   * cũng chính là cách một sân chơi Scratch nuôi được người dùng, chứ không phải
   * bằng danh sách "mới nhất".
   *
   * Chỉ lấy PUBLISHED: game LIMITED cố ý bị rút khỏi MỌI danh sách, kể cả danh sách
   * này. Ai có link vẫn chơi được, nhưng ta không đi phát tán thêm.
   */
  const gameKhac = await prisma.game.findMany({
    where: { childId: game.childId, status: 'PUBLISHED', id: { not: game.id } },
    orderBy: { createdAt: 'desc' },
    take: 4,
    include: { child: { select: { displayName: true } } },
  });

  /*
   * Chỉ hỏi khi người xem đúng là bố mẹ của bé: đây là một truy vấn thêm, mà mọi
   * người lạ mở trang game đều đi qua đây. Người lạ không có nút nào để bày nên
   * câu trả lời cũng chẳng dùng vào việc gì.
   *
   * Cần hỏi vì `setGameHiddenAction` TỪ CHỐI bật lại game đang có khiếu nại bản
   * quyền chờ xử lý. Bày một cái nút chỉ để nó báo lỗi là làm người ta tưởng web
   * hỏng — cùng lý lẽ đã ghi ở trang của bố mẹ.
   */
  const biKhieuNai = laChuNhan ? (await gameDangBiKhieuNai([game.id])).has(game.id) : false;

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
      {/*
        Thứ tự hai dải này quan trọng, và nó đã đỏ một lần trước khi đúng.
        `demo@kidogame.local` vừa là bố mẹ của bé vừa có `isAdmin` — chuyện rất
        thường với người vận hành một sân chơi cho con mình — nên chỉ hỏi `isAdmin`
        là họ vừa bấm ẩn game CỦA CON MÌNH xong thì đọc được câu "Bạn đang xem với
        quyền admin để kiểm duyệt". Câu đó đúng về mặt quyền và sai hẳn về mặt việc:
        dải admin nói về việc soi game của NGƯỜI KHÁC.

        Nên chủ nhân thắng, kể cả khi họ cũng là admin. Nhưng chỉ với HIDDEN: game
        REMOVED thì rơi xuống dải admin, vì lúc đó phán quyết là của đội kiểm duyệt
        và phụ huynh không có nút nào để bấm — mời họ "Hiện lại" là mời hụt.
      */}
      {!xemDuoc && isAdmin && !chuNhanXemGameAn && (
        <div className="mx-auto max-w-180" data-testid="admin-preview-banner">
          <Notice tone="warn" role="status">
            Game này {game.status === 'HIDDEN' ? 'đang bị ẩn' : 'đã bị gỡ'}, người thường vào đây
            sẽ nhận 404. Bạn đang xem với quyền admin để kiểm duyệt — lượt chơi không được tính.
          </Notice>
        </div>
      )}

      {!xemDuoc && chuNhanXemGameAn && (
        <div className="mx-auto max-w-180" data-testid="chu-nhan-an-banner">
          <Notice tone="info" role="status">
            Game này <strong>đang ẩn</strong> — người khác vào đây sẽ không thấy gì. Bạn xem được
            vì đây là game của con bạn. Bấm <strong>Hiện lại</strong> bên dưới là game trở lại
            trang chủ. Lưu ý: ẩn chỉ rút game khỏi trang, ai đang giữ sẵn link tới file game thì
            vẫn mở được.
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

        {/* Tag dẫn ngược về trang chủ đã lọc sẵn — một đứa trẻ thích game giải đố thì
            đường ngắn nhất tới game giải đố tiếp theo là ngay ở đây. */}
        {game.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2" data-testid="game-tags">
            {game.tags.map(({ tag }) => (
              <Link
                key={tag.slug}
                href={`/?tag=${tag.slug}`}
                className="inline-flex items-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink no-underline hover:border-accent"
              >
                {tag.label}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2.5">
          {/*
            Tải source về mở ra xem: văn hoá cốt lõi của Scratch, trẻ học bằng cách
            mở game của nhau.

            KHÔNG có chữ "gốc" trên nút này. `fae16ef` đã bỏ chữ ấy khỏi
            `/dieu-khoan` và hai lá thư vì `validateAndNormalize` RE-ZIP file lúc
            nhận và chỉ giữ asset thực sự được tham chiếu — nên byte người dùng gửi
            lên không còn ở đâu trong hệ thống. Commit đó sửa ba chỗ và sót đúng chỗ
            này, chỗ được bấm nhiều nhất. Giải thích đầy đủ nằm một lần trên
            `/dieu-khoan`, đúng nơi lời hứa tải về được nêu ra.
          */}
          <ButtonAnchor variant="ghost" href={objectUrl('sb3', game.sb3Sha256)} download>
            Tải file .sb3
          </ButtonAnchor>
          <ButtonLink href="/" variant="ghost">
            Xem game khác
          </ButtonLink>
        </div>

        {/*
          Dải điều khiển của bố mẹ. Để RIÊNG, không nhét nút "Ẩn game" vào hàng nút
          bên trên: hàng đó là những việc ai cũng làm được, còn đây là việc chỉ một
          người trên đời làm được với game này. Trộn hai loại vào một hàng thì người
          lạ đọc trang sẽ tưởng mình cũng ẩn được game của con người khác.

          Vì sao cần ở đây chứ không chỉ ở trang của bố mẹ: đường đi tự nhiên khi bố
          mẹ thấy game có gì đó không ổn là đang XEM chính game đó. Bắt họ nhớ đường
          sang trang khác, tìm lại đúng game trong danh sách, rồi mới bấm được — đó
          là ba nhịp cho một việc mà cả cơ chế hậu kiểm đang dựa vào tốc độ của nó.

          Không có nút "Xoá hẳn" ở đây, cố ý: xoá là việc không đảo lại được và nó
          cần ngồi cạnh câu giải thích dài ở trang của bố mẹ — chỗ nói rõ rằng ẩn
          không thu hồi file còn xoá mới thu hồi. Bày một nút xoá lẻ ngay dưới màn
          hình chơi game, không có đoạn chữ ấy, là mời người ta bấm nhầm.

          Điều kiện hiện nút khớp ĐÚNG những gì server cho phép: REMOVED thì phụ
          huynh không tự lật được, và game đang bị khiếu nại bản quyền thì server từ
          chối bật lại.
        */}
        {laChuNhan && game.status !== 'REMOVED' && !biKhieuNai && (
          <div
            className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-field border border-border px-3.5 py-3"
            data-testid="chu-nhan-dieu-khien"
          >
            {/* Câu phải đổi theo trạng thái. Để nguyên "Bạn ẩn nó bất cứ lúc nào"
                cạnh một cái nút ghi "Hiện lại" là hai thứ nói ngược nhau trong cùng
                một khung, và người đọc sẽ tin cái câu chứ không tin cái nút. */}
            <span className="text-sm text-ink-soft">
              {game.status === 'HIDDEN'
                ? 'Game của con bạn, đang ẩn. Bạn cho hiện lại bất cứ lúc nào.'
                : 'Đây là game của con bạn. Bạn ẩn nó bất cứ lúc nào.'}
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <GameVisibilityToggle gameId={game.id} hidden={game.status === 'HIDDEN'} />
              <ButtonLink href="/phu-huynh" variant="ghost">
                Trang của bố mẹ
              </ButtonLink>
            </span>
          </div>
        )}

        {/*
          Đang bị khiếu nại thì nói ra, thay vì im lặng không có nút nào — im lặng ở
          đây đọc như "chức năng biến mất", và phụ huynh sẽ đi tìm xem mình bấm nhầm
          gì. KHÔNG hé ai khiếu nại hay vì lý do gì: người khiếu nại để lại danh
          tính cho đội kiểm duyệt, không phải cho phụ huynh.
        */}
        {laChuNhan && biKhieuNai && (
          <div className="mt-4" data-testid="chu-nhan-bi-khieu-nai">
            <Notice tone="warn" role="status">
              Game này đang tạm ẩn vì có yêu cầu gỡ bản quyền chờ xử lý, nên lúc này bạn chưa đổi
              được trạng thái của nó. Đội kiểm duyệt sẽ xem lại và trả lời.
            </Notice>
          </div>
        )}

        {/*
          Game đã ẩn/gỡ thì không có gì để báo cáo nữa — nút chỉ dẫn tới lỗi.

          Nhưng game LIMITED thì VẪN báo cáo được, cố ý: nó vẫn đang chơi được bằng
          link, và chính nó là loại game cần thêm tín hiệu nhất. Bỏ nút ở đây thì mức
          ẩn mềm thành cái sàn không bao giờ leo lên ẩn hẳn được.
        */}
        <div className="mb-10">{xemDuoc && <ReportForm gameId={game.id} />}</div>

        {gameKhac.length > 0 && (
          <section className="mb-12 border-t border-border pt-7" data-testid="game-khac">
            <h2 className="mb-4 text-xl font-extrabold tracking-tight">
              {/* KHÔNG viết "của bé {tên}": tên hiển thị của trẻ ở đây thường đã mang
                  sẵn chữ "Bé" (seed là "Bé Minh"), thành ra "của bé Bé Minh". */}
              Game khác của {game.child.displayName}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {gameKhac.map((g) => (
                <GameCard
                  key={g.id}
                  game={{
                    id: g.id,
                    title: g.title,
                    authorName: g.child.displayName,
                    thumbUrl: objectUrl('thumb', g.thumbSha256),
                    playCount: g.playCount,
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
