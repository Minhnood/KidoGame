import { LinkCho } from '@/components/link-cho';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
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
import { docGameDuocXem } from './quyen-xem';
import { HangIcon } from '@/components/hang-icon';
import { demPhanUngNhieuGame, docPhanUng } from '@/lib/phan-ung';
import { LoiNhan } from '@/components/loi-nhan';
import { docLoiNhan } from '@/lib/loi-nhan';
import { NutTheoDoi } from '@/components/nut-theo-doi';
import { dangTheoDoi } from '@/lib/theo-doi';

export const dynamic = 'force-dynamic';

interface Warning {
  code: string;
  message: string;
}

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  /* Luật "ai được xem" nằm ở `quyen-xem.ts`, và `layout.tsx` đã gọi nó rồi `notFound()`
     TRƯỚC khung chờ — lý do ở đầu file đó. Gọi lại ở đây chỉ để lấy dữ liệu; `cache()`
     trả về đúng kết quả layout vừa có, không hỏi DB lần hai. `notFound()` giữ lại
     phòng khi ai đó xoá layout: thà một 404 sai mã còn hơn render một game đã ẩn. */
  const duocXem = await docGameDuocXem(id);
  if (!duocXem) notFound();
  const { game, actor, isAdmin, laChuNhan, chuNhanXemGameAn, xemDuoc } = duocXem;

  /*
   * Icon: đọc SAU `notFound()` để không tốn một truy vấn cho trang 404, và truyền
   * `childId` chỉ khi người xem là bé — phụ huynh với khách thấy số nhưng không có
   * `cuaToi` để tô sáng.
   */
  const beDangXem = actor?.kind === 'child' ? actor : null;

  /* Icon và lời nhắn đọc song song: hai truy vấn độc lập, không việc nào chờ việc
     nào, và cả hai chỉ chạy SAU `notFound()` để trang 404 không tốn gì. */
  /* Bé khác chủ game mới có nút theo dõi, nên chỉ hỏi khi đúng vai đó — người lạ mở
     trang game không có nút nào để bày, và câu trả lời cũng chẳng dùng vào việc gì. */
  const hoiTheoDoi = !!beDangXem && beDangXem.id !== game.childId;

  const [phanUng, loiNhan, daTheoDoi] = await Promise.all([
    docPhanUng(game.id, beDangXem?.id ?? null),
    docLoiNhan(game.id, beDangXem?.id ?? null),
    hoiTheoDoi ? dangTheoDoi(beDangXem.id, game.childId) : Promise.resolve(false),
  ]);

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

  /* Số icon cho dãy "game khác của bé" — một truy vấn cho cả bốn thẻ. */
  const soIconKhac = await demPhanUngNhieuGame(gameKhac.map((g) => g.id));

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

        {/*
          Hàng icon đặt NGAY dưới khung game, trên cả thẻ và các nút.

          Đây là chỗ tay đang ở sau khi chơi xong, và là thứ đứa trẻ muốn làm trước
          tiên. Đẩy xuống dưới hàng nút "Tải .sb3 / Báo cáo" thì nó nằm lẫn giữa
          những việc mang tính thủ tục, và phải cuộn mới thấy.

          Chỉ hiện khi game còn xem được bình thường: trên bản xem trước của admin
          hay trang game đã ẩn của con mình, một hàng nút thả tim là lạc chỗ.
        */}
        {xemDuoc && (
          <div className="mt-5">
            <HangIcon
              gameId={game.id}
              banDau={phanUng}
              thaDuoc={actor?.kind === 'child'}
            />
          </div>
        )}

        {/*
          Nút theo dõi ngay dưới hàng icon, cùng một cụm "phản ứng với game này".

          Đặt được ở đây là vì nó KHÔNG có con số nào đi kèm — nếu có thì nó sẽ đọc
          như một chỉ số nữa cạnh số icon, và đó đúng là thứ `model Follow` quyết
          định không tạo ra.
        */}
        {xemDuoc && hoiTheoDoi && (
          <div className="mt-4">
            <NutTheoDoi
              authorId={game.childId}
              tenBan={game.child.displayName}
              banDau={daTheoDoi}
            />
          </div>
        )}

        {/* Tag dẫn ngược về trang chủ đã lọc sẵn — một đứa trẻ thích game giải đố thì
            đường ngắn nhất tới game giải đố tiếp theo là ngay ở đây. */}
        {game.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2" data-testid="game-tags">
            {game.tags.map(({ tag }) => (
              <LinkCho
                key={tag.slug}
                href={`/?tag=${tag.slug}`}
                className="inline-flex items-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink no-underline hover:border-accent"
              >
                {tag.label}
              </LinkCho>
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
          {/*
            Đường tải về nằm trên APP, không phải player origin: chỉ app biết tên game,
            và tên file phải là tên game chứ không phải sha256. Xem `tai-ve/route.ts`.
          */}
          <ButtonAnchor variant="ghost" href={`/game/${game.id}/tai-ve`} download>
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
        {/*
          Lời nhắn nằm SAU hàng nút, TRƯỚC ô báo cáo — và cả hai vị trí đều có lý do.

          Không đặt cạnh hàng icon ngay dưới khung game: icon là một cú chạm, còn
          đây là một khối chữ đọc mất vài giây. Dán chúng vào nhau thì phần dưới
          khung game phình ra và cái nút "Tải .sb3" bị đẩy khuất.

          Nhưng vẫn phải ở TRÊN ô báo cáo. Thứ tự trên trang nói cho đứa trẻ biết
          việc gì là việc thường làm: khen bạn trước, báo cáo sau — không phải ngược
          lại.
        */}
        {xemDuoc && (
          <div className="mt-8 border-t border-border pt-6">
            <LoiNhan
              gameId={game.id}
              banDau={loiNhan}
              /* Chủ game đọc được nhưng không nhắn được — lý do ở `nhanLoi`. */
              nhanDuoc={!!beDangXem && beDangXem.id !== game.childId}
              laGameCuaToi={!!beDangXem && beDangXem.id === game.childId}
              tenToi={beDangXem?.displayName ?? null}
              childIdToi={beDangXem?.id ?? null}
            />
          </div>
        )}

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
                    reactionCount: soIconKhac[g.id]?.tong ?? 0,
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
