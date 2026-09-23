import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { normalizeForSearch } from '@/lib/search';
import { objectUrl } from '@/lib/storage';
import { getActor } from '@/lib/session';
import { GameCard } from '@/components/game-card';
import { TextInput } from '@/components/field';
import { Button, ButtonLink } from '@/components/button';
import { EmptyState, PageTitle } from '@/components/page';
import { Pager } from '@/components/pager';
import { demPhanUngNhieuGame } from '@/lib/phan-ung';
import { gameMoiCuaBanBe } from '@/lib/theo-doi';
import { NutDangCho } from '@/components/nut-dang-cho';
import { HANG_LOC, LE_DUOI_LOAI, LE_DUOI_TUOI } from './hang-loc';

export const dynamic = 'force-dynamic';

/**
 * 24 game một trang, không phải 60.
 *
 * Lưới chạy 2 cột trên điện thoại, 3 cột từ `sm`, 4 cột từ `lg` — 24 chia hết cho cả
 * ba, nên hàng cuối luôn đầy ở mọi bề rộng thay vì bỏ lại một hai thẻ lẻ trông như
 * danh sách bị cắt giữa chừng.
 *
 * 60 là con số của thời chưa có phân trang: nó không phải một trang, nó là chỗ mà
 * danh sách im lặng dừng lại. Ở 60 thẻ, trẻ phải cuộn qua mười lăm hàng mới tới được
 * thanh phân trang, tức là thứ duy nhất nói cho bé biết còn game nữa nằm ở chỗ bé
 * ít có khả năng tới nhất.
 */
const PAGE_SIZE = 24;

/**
 * Lọc theo tuổi của BÉ LÀM RA GAME, không phải độ tuổi phù hợp để chơi.
 *
 * Nhãn phải nói rõ điều đó. Nếu để chữ chung chung như "độ tuổi", phụ huynh sẽ đọc
 * thành "game này hợp cho trẻ mấy tuổi" — một lời hứa mà hệ thống hoàn toàn không
 * có cơ sở để đưa ra, vì không ai chấm nội dung game cả.
 */
const AGE_BRACKETS = [
  { key: '5-7', label: '5–7 tuổi', min: 5, max: 7 },
  { key: '8-10', label: '8–10 tuổi', min: 8, max: 10 },
  { key: '11-13', label: '11–13 tuổi', min: 11, max: 13 },
  { key: '14+', label: '14 tuổi trở lên', min: 14, max: 120 },
] as const;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; tuoi?: string; trang?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? '').trim().slice(0, 80);
  const tagSlug = sp.tag ?? '';
  const ageKey = sp.tuoi ?? '';
  /* Kẹp dưới, KHÔNG kẹp trên — giống ba danh sách của khu quản trị. `?trang=999` đi
     qua được tới tận truy vấn, và `Pager` là chỗ nói ra "không có trang đó"; kẹp im
     lặng về trang cuối thì URL trên thanh địa chỉ nói một đằng, màn hình một nẻo. */
  const page = Math.max(1, Number(sp.trang) || 1);

  const bracket = AGE_BRACKETS.find((b) => b.key === ageKey);
  const thisYear = new Date().getFullYear();

  const where: Prisma.GameWhereInput = { status: 'PUBLISHED' };

  if (query) {
    // So trên cột đã bỏ dấu, và cũng bỏ dấu chuỗi người dùng gõ vào — nhờ vậy
    // "meo" khớp "Mèo", và "Mèo" cũng khớp "meo".
    where.titleSearch = { contains: normalizeForSearch(query) };
  }
  if (tagSlug) {
    where.tags = { some: { tag: { slug: tagSlug } } };
  }
  if (bracket) {
    where.child = {
      birthYear: { gte: thisYear - bracket.max, lte: thisYear - bracket.min },
    };
  }

  const [actor, tags, total, games] = await Promise.all([
    getActor(),
    prisma.tag.findMany({ orderBy: { label: 'asc' }, select: { slug: true, label: true } }),
    /* Đếm cùng `where` với danh sách. Đây là truy vấn thứ hai trên mọi lần tải trang
       chủ, và nó mua đúng một thứ: con số tổng, thứ duy nhất biến "60 game đầu tiên"
       thành một câu nói được còn bao nhiêu game nữa. */
    prisma.game.count({ where }),
    prisma.game.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        child: { select: { displayName: true } },
        // Nhãn loại để hiện trên thẻ game. `take: 1` vì thẻ chỉ hiện nhãn đầu
        // tiên — xem `NhanLoai` trong `game-card.tsx`; lấy cả hai rồi bỏ một cái
        // là bắt Postgres làm việc không ai dùng, trên mọi lần tải trang chủ.
        tags: { take: 1, include: { tag: { select: { label: true } } } },
      },
    }),
  ]);

  /*
   * Số icon cho CẢ trang game trong MỘT truy vấn, chạy sau vì nó cần danh sách id.
   *
   * Không gộp được vào `Promise.all` ở trên: `where` của trang chủ có tìm kiếm, lọc
   * thẻ và lọc tuổi, nên tập game chỉ biết được sau khi truy vấn kia trả về. Một
   * lượt `groupBy` cho 20 game vẫn rẻ hơn hẳn `_count` lồng trong `include` — cái
   * đó sinh một truy vấn con cho mỗi hàng.
   */
  const filtering = Boolean(query || tagSlug || bracket);
  const beXem = actor?.kind === 'child' ? actor : null;

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  /* Trang vượt quá cuối danh sách KHÔNG phải danh sách rỗng, và không được hiện ra
     như danh sách rỗng. `?trang=999` cho một danh sách 2 trang thì truy vấn trả về
     không có gì, và màn hình sẽ nói "Chưa có game nào cả. Đăng game đầu tiên nhé!" —
     một câu sai hoàn toàn, ngay trên một trang chủ đầy game. `Pager` có sẵn câu đúng
     kèm đường quay về; ở đây chỉ cần nhường chỗ cho nó. */
  const vuotTrang = page > lastPage;

  /* Dải chào và dải bạn bè chỉ ở TRANG ĐẦU, đúng lý do đã khiến chúng biến mất khi
     lọc: người đã đi tới trang 2 không cần được mời chào lại, họ đang ở trong trang
     rồi. Giữ lại thì mỗi lần sang trang là một màn hình đầu bị chiếm bởi thứ vừa đọc
     xong ở trang trước. */
  const trangDau = page === 1;

  /*
   * Game mới của những bạn bé đang theo dõi — phần thưởng duy nhất của việc theo
   * dõi, nên nó phải nằm ở đây chứ không trong một trang riêng phải nhớ đường tới.
   *
   * KHÔNG hiện khi đang lọc hay tìm kiếm: lúc đó bé đang đi tìm một game cụ thể, và
   * chen một dải game khác vào giữa kết quả là đẩy thứ bé vừa gõ ra khỏi màn hình.
   */
  const gameBanBe = !filtering && trangDau && beXem ? await gameMoiCuaBanBe(beXem.id, 4) : [];

  // Một lượt `groupBy` cho CẢ hai dải. Hỏi riêng từng dải là hai truy vấn cho cùng
  // một câu hỏi, trên mọi lần tải trang chủ của một bé có theo dõi ai đó.
  const soIcon = await demPhanUngNhieuGame([...games, ...gameBanBe].map((g) => g.id));

  /**
   * Giữ nguyên các bộ lọc khác khi bấm đổi một cái.
   *
   * ĐỔI BỘ LỌC LÀ VỀ TRANG 1, luôn luôn. Đang đứng ở trang 3 của "tất cả game" rồi
   * bấm một thẻ loại: tập kết quả mới thường chỉ có một trang, nên mang số 3 theo là
   * rơi thẳng vào một màn hình trống ngay lúc vừa chọn xong bộ lọc — bé sẽ đọc ra
   * "loại này không có game nào", chứ không ai nghĩ tới cái số trang còn sót lại
   * trong URL. Hàm này cố ý KHÔNG chép `trang` sang.
   */
  const linkWith = (patch: { tag?: string; tuoi?: string }) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    const nextTag = patch.tag !== undefined ? patch.tag : tagSlug;
    const nextAge = patch.tuoi !== undefined ? patch.tuoi : ageKey;
    if (nextTag) params.set('tag', nextTag);
    if (nextAge) params.set('tuoi', nextAge);
    const qs = params.toString();
    return qs ? `/?${qs}` : '/';
  };

  /**
   * Ngược lại: sang trang thì GIỮ HẾT bộ lọc.
   *
   * Rơi một tham số ở đây là lỗi im lặng đúng nghĩa — danh sách đổi hẳn nội dung mà
   * không có gì trên màn hình nói vì sao, và mấy cái chip lọc vẫn sáng như cũ.
   */
  const hrefTrang = (p: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (tagSlug) params.set('tag', tagSlug);
    if (ageKey) params.set('tuoi', ageKey);
    if (p > 1) params.set('trang', String(p));
    const qs = params.toString();
    return qs ? `/?${qs}` : '/';
  };

  const chip = (active: boolean) =>
    [
      /* `relative` là để `NutDangCho` phủ đúng viên thuốc này — vòng xoay của nó là
         `absolute inset-0`, thiếu mốc thì nó bám ra tận thẻ tổ tiên gần nhất. */
      'relative min-h-touch inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-4 font-semibold no-underline',
      active
        ? 'border-transparent bg-accent text-chrome'
        : 'border-border bg-surface text-ink hover:bg-bg',
    ].join(' ');

  return (
    <>
      {/*
        Dải chào chỉ hiện khi KHÔNG lọc.

        Người đang tìm một game cụ thể không cần được mời chào lại — họ đã ở trong
        trang rồi. Giữ nó ở màn hình đầu tiên của trang chủ trần thì mới đúng việc:
        nói cho một đứa trẻ lần đầu vào biết đây là chỗ làm gì, và rằng chính bé
        cũng đăng game được. Trước đây trang chủ chỉ liệt kê, không mời ai cả.

        KHÔNG dùng thẻ heading ở đây: <h1> của trang là tiêu đề danh sách bên dưới,
        và hai h1 làm trình đọc màn hình mất mốc "trang này nói về gì" —
        `infra/a11y-check.mjs` canh đúng điều đó.
      */}
      {!filtering && trangDau && (
        /*
          GỌN HƠN TRÊN ĐIỆN THOẠI, và đó là việc chính của trang chủ ở cỡ đó.

          Đo ở 390×800 trước khi sửa: thẻ game đầu tiên nằm ở 1001px. Bé mở web ra
          trên điện thoại thấy lời chào, ô tìm, năm hàng viên thuốc lọc — và KHÔNG MỘT
          game nào. Dải chào bốn dòng chữ + hai nút `lg` xếp chồng ăn mất 390px trong số
          đó. Dưới `sm` bỏ hẳn đoạn giới thiệu — dòng phụ của "Game mới nhất" ngay bên
          dưới đã nói "do chính các bé làm bằng Scratch". Đoạn đầy đủ vẫn ở máy tính, nơi
          nó đứng cạnh lưới game chứ không thay chỗ lưới game.
        */
        <section
          data-testid="home-hero"
          className="mt-5 rounded-card border border-accent/30 bg-accent/12 px-4 py-5 sm:mt-7 sm:px-8 sm:py-7"
        >
          <p className="text-xl font-extrabold leading-snug sm:text-3xl">
            Chào bé, hôm nay chơi game gì?
          </p>
          <p className="mt-2 hidden max-w-2xl text-ink-soft sm:block">
            Tất cả game ở đây đều do các bạn nhỏ tự làm bằng Scratch. Chơi thử đã, rồi đăng
            game của bé lên cho các bạn khác cùng chơi nhé.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 sm:mt-5 sm:gap-3">
            {actor?.kind === 'child' ? (
              <ButtonLink href="/upload" size="lg-tu-sm">
                Đăng game của bé
              </ButtonLink>
            ) : actor?.kind === 'parent' ? (
              <ButtonLink href="/phu-huynh" size="lg-tu-sm">
                Trang của bố mẹ
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/be-dang-nhap" size="lg-tu-sm">
                  Bé đăng nhập
                </ButtonLink>
                {/*
                  Đường thứ hai cho phụ huynh, cố ý đứng cạnh: trẻ không tự tạo được
                  tài khoản, nên nếu chỉ có nút "Bé đăng nhập" thì đứa trẻ chưa có tài
                  khoản đi vào ngõ cụt ngay ở màn hình đầu.
                */}
                <ButtonLink href="/dang-ky" size="lg-tu-sm" variant="ghost">
                  {/* Nhãn ngắn dưới `sm` để hai nút vừa một hàng ở 360px — xem `lg-tu-sm`. */}
                  <span className="sm:hidden">Bố mẹ đăng ký</span>
                  <span className="hidden sm:inline">Bố mẹ tạo tài khoản</span>
                </ButtonLink>
              </>
            )}
          </div>
        </section>
      )}

      {/*
        Dải bạn bè đứng TRÊN "Game mới nhất", và chỗ đứng đó là cả điểm của nó: nếu
        nằm dưới danh sách chung thì bé phải cuộn qua hai chục game lạ mới thấy game
        của bạn mình, tức là theo dõi chẳng đổi được gì so với không theo dõi.

        Chỉ hiện khi có game thật. Một dải rỗng mang tên "Game mới của bạn bè" đọc
        lên là "các bạn của con chẳng làm gì cả", mà sự thật chỉ là bé mới theo dõi
        một bạn chưa đăng game nào.
      */}
      {gameBanBe.length > 0 && (
        <section className="mt-8" data-testid="game-ban-be">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-xl font-extrabold tracking-tight">Game mới của bạn bè</h2>
            <Link href="/ban-be" className="text-sm font-semibold text-accent-text">
              Các bạn bé đang theo dõi
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {gameBanBe.map((game) => (
              <GameCard
                key={game.id}
                game={{
                  id: game.id,
                  title: game.title,
                  authorName: game.child.displayName,
                  thumbUrl: objectUrl('thumb', game.thumbSha256),
                  playCount: game.playCount,
                  reactionCount: soIcon[game.id]?.tong ?? 0,
                  tagLabels: game.tags.map((t) => t.tag.label),
                }}
              />
            ))}
          </div>
        </section>
      )}

      <PageTitle
        title={filtering ? 'Kết quả tìm' : 'Game mới nhất'}
        lead="Các game do chính các bé làm bằng Scratch."
      />

      {/*
        Form GET thường, không phải client component: tìm kiếm vẫn dùng được khi
        JS chưa tải xong, và kết quả nằm trong URL nên chia sẻ hay bấm back đều đúng.
      */}
      <form method="get" role="search" data-testid="search-form" className="mb-4 flex gap-2">
        <TextInput
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Tìm game theo tên…"
          aria-label="Tìm game theo tên"
          className="max-w-100"
        />
        {/* Giữ bộ lọc đang chọn khi submit form tìm kiếm.

            KHÔNG có hidden `trang` ở đây, và đó là chủ ý: gõ một từ khoá mới là một
            tập kết quả mới, mang số trang cũ sang thì lần tìm đầu tiên của bé rơi vào
            màn hình trống. Cùng một luật với `linkWith`. */}
        {tagSlug && <input type="hidden" name="tag" value={tagSlug} />}
        {ageKey && <input type="hidden" name="tuoi" value={ageKey} />}
        <Button type="submit">Tìm</Button>
      </form>

      {/*
        HAI HÀNG CUỘN NGANG dưới `sm`, xuống dòng bình thường từ `sm` trở lên.

        Ở 390px sáu viên loại game gãy thành 2 hàng và năm viên tuổi gãy thành 3 — năm
        hàng viên thuốc, ~270px, đứng giữa ô tìm và game đầu tiên. Cuộn ngang giữ đủ
        mọi lựa chọn trong đúng hai hàng. Lớp và lý do từng lớp: `hang-loc.ts`.
      */}
      <div className={`${LE_DUOI_LOAI} ${HANG_LOC}`} data-testid="tag-filters">
        <Link href={linkWith({ tag: '' })} className={chip(!tagSlug)}>
          Tất cả
          <NutDangCho />
        </Link>
        {tags.map((tag) => (
          <Link
            key={tag.slug}
            href={linkWith({ tag: tag.slug })}
            data-testid={`tag-${tag.slug}`}
            className={chip(tagSlug === tag.slug)}
          >
            {tag.label}
            <NutDangCho />
          </Link>
        ))}
      </div>

      <div className={`${LE_DUOI_TUOI} items-center ${HANG_LOC}`} data-testid="age-filters">
        <span className="shrink-0 whitespace-nowrap text-sm text-ink-soft">Bé mấy tuổi làm?</span>
        <Link href={linkWith({ tuoi: '' })} className={chip(!bracket)}>
          Tuổi nào cũng được
          <NutDangCho />
        </Link>
        {AGE_BRACKETS.map((b) => (
          <Link
            key={b.key}
            href={linkWith({ tuoi: b.key })}
            data-testid={`tuoi-${b.key}`}
            className={chip(ageKey === b.key)}
          >
            {b.label}
            <NutDangCho />
          </Link>
        ))}
      </div>

      {/*
        Đếm TỔNG, không đếm số thẻ đang bày ra.

        Câu cũ là "60 game" kèm chữ "đầu tiên" — nó nói được rằng còn nữa, nhưng không
        nói còn bao nhiêu, và cũng chẳng có đường nào đi tới chỗ ấy. Giờ con số là
        toàn bộ tập kết quả, và phần "trang x/y" chỉ hiện khi thật sự có hơn một
        trang: trên một trang chủ đúng một trang, "trang 1/1" là chữ thừa.
      */}
      <p className="mb-4 text-sm text-ink-soft" data-testid="result-count">
        {total} game
        {lastPage > 1 ? ` · trang ${Math.min(page, lastPage)}/${lastPage}` : ''}
      </p>

      {/*
        Grid khai báo cột tường minh thay vì auto-fill: auto-fill với
        minmax(220px) cho ra ĐÚNG MỘT cột to đùng trên điện thoại, mỗi màn chỉ
        thấy được 1,5 game. Hai cột trên mobile vẫn đủ to để bấm mà thấy được
        nhiều game hơn.
      */}
      {games.length === 0 && vuotTrang ? null : games.length === 0 ? (
        <EmptyState>
          {filtering ? (
            <>
              Không tìm thấy game nào khớp.{' '}
              <Link href="/" className="font-bold text-accent-text underline">
                Xem tất cả game
              </Link>
            </>
          ) : (
            <>
              Chưa có game nào cả.{' '}
              <Link href="/upload" className="font-bold text-accent-text underline">
                Đăng game đầu tiên
              </Link>{' '}
              nhé!
            </>
          )}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={{
                id: game.id,
                title: game.title,
                authorName: game.child.displayName,
                thumbUrl: objectUrl('thumb', game.thumbSha256),
                playCount: game.playCount,
                reactionCount: soIcon[game.id]?.tong ?? 0,
                tagLabels: game.tags.map((t) => t.tag.label),
              }}
            />
          ))}
        </div>
      )}

      {/*
        Cùng thanh phân trang với khu quản trị, không phải một bản riêng cho trẻ.

        `mb-12` chuyển từ lưới xuống đây: nó vốn là khoảng thở cuối trang, và nếu để
        nguyên trên lưới thì thanh phân trang dính vào đáy màn hình mà thẻ game cuối
        lại cách nó một quãng rộng — trông như thanh ấy thuộc về thứ gì khác chứ không
        phải danh sách vừa đọc.
      */}
      <Pager page={page} lastPage={lastPage} href={hrefTrang} testId="pager" className="mb-12 mt-6" />
    </>
  );
}
