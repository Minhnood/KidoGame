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

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;

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
  searchParams: Promise<{ q?: string; tag?: string; tuoi?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? '').trim().slice(0, 80);
  const tagSlug = sp.tag ?? '';
  const ageKey = sp.tuoi ?? '';

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

  const [actor, tags, games] = await Promise.all([
    getActor(),
    prisma.tag.findMany({ orderBy: { label: 'asc' }, select: { slug: true, label: true } }),
    prisma.game.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      include: { child: { select: { displayName: true } } },
    }),
  ]);

  /** Giữ nguyên các bộ lọc khác khi bấm đổi một cái. */
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

  const chip = (active: boolean) =>
    [
      'min-h-touch inline-flex items-center rounded-full border px-4 font-semibold no-underline',
      active
        ? 'border-transparent bg-accent text-chrome'
        : 'border-border bg-surface text-ink hover:bg-bg',
    ].join(' ');

  const filtering = Boolean(query || tagSlug || bracket);

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
      {!filtering && (
        <section
          data-testid="home-hero"
          className="mt-7 rounded-card border border-accent/30 bg-accent/12 px-6 py-7 sm:px-8"
        >
          <p className="text-2xl font-extrabold leading-snug sm:text-3xl">
            Chào bé, hôm nay chơi game gì?
          </p>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Tất cả game ở đây đều do các bạn nhỏ tự làm bằng Scratch. Chơi thử đã, rồi đăng
            game của bé lên cho các bạn khác cùng chơi nhé.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {actor?.kind === 'child' ? (
              <ButtonLink href="/upload" size="lg">
                Đăng game của bé
              </ButtonLink>
            ) : actor?.kind === 'parent' ? (
              <ButtonLink href="/phu-huynh" size="lg">
                Trang của bố mẹ
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/be-dang-nhap" size="lg">
                  Bé đăng nhập
                </ButtonLink>
                {/*
                  Đường thứ hai cho phụ huynh, cố ý đứng cạnh: trẻ không tự tạo được
                  tài khoản, nên nếu chỉ có nút "Bé đăng nhập" thì đứa trẻ chưa có tài
                  khoản đi vào ngõ cụt ngay ở màn hình đầu.
                */}
                <ButtonLink href="/dang-ky" size="lg" variant="ghost">
                  Bố mẹ tạo tài khoản
                </ButtonLink>
              </>
            )}
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
        {/* Giữ bộ lọc đang chọn khi submit form tìm kiếm. */}
        {tagSlug && <input type="hidden" name="tag" value={tagSlug} />}
        {ageKey && <input type="hidden" name="tuoi" value={ageKey} />}
        <Button type="submit">Tìm</Button>
      </form>

      <div className="mb-2 flex flex-wrap gap-2" data-testid="tag-filters">
        <Link href={linkWith({ tag: '' })} className={chip(!tagSlug)}>
          Tất cả
        </Link>
        {tags.map((tag) => (
          <Link
            key={tag.slug}
            href={linkWith({ tag: tag.slug })}
            data-testid={`tag-${tag.slug}`}
            className={chip(tagSlug === tag.slug)}
          >
            {tag.label}
          </Link>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2" data-testid="age-filters">
        <span className="text-sm text-ink-soft">Bé mấy tuổi làm?</span>
        <Link href={linkWith({ tuoi: '' })} className={chip(!bracket)}>
          Tuổi nào cũng được
        </Link>
        {AGE_BRACKETS.map((b) => (
          <Link
            key={b.key}
            href={linkWith({ tuoi: b.key })}
            data-testid={`tuoi-${b.key}`}
            className={chip(ageKey === b.key)}
          >
            {b.label}
          </Link>
        ))}
      </div>

      <p className="mb-4 text-sm text-ink-soft" data-testid="result-count">
        {games.length} game
        {games.length === PAGE_SIZE ? ' đầu tiên' : ''}
      </p>

      {/*
        Grid khai báo cột tường minh thay vì auto-fill: auto-fill với
        minmax(220px) cho ra ĐÚNG MỘT cột to đùng trên điện thoại, mỗi màn chỉ
        thấy được 1,5 game. Hai cột trên mobile vẫn đủ to để bấm mà thấy được
        nhiều game hơn.
      */}
      {games.length === 0 ? (
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
        <div className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={{
                id: game.id,
                title: game.title,
                authorName: game.child.displayName,
                thumbUrl: objectUrl('thumb', game.thumbSha256),
                playCount: game.playCount,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
