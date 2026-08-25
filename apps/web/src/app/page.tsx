import Link from 'next/link';
import { prisma } from '@/lib/db';
import { objectUrl } from '@/lib/storage';
import { GameCard } from '@/components/game-card';
import { EmptyState, PageTitle } from '@/components/page';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const games = await prisma.game.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: { child: { select: { displayName: true } } },
  });

  return (
    <>
      <PageTitle title="Game mới nhất" lead="Các game do chính các bé làm bằng Scratch." />

      {/*
        Grid khai báo cột tường minh thay vì auto-fill: auto-fill với
        minmax(220px) cho ra ĐÚNG MỘT cột to đùng trên điện thoại, mỗi màn chỉ
        thấy được 1,5 game. Hai cột trên mobile vẫn đủ to để bấm mà thấy được
        nhiều game hơn.
      */}
      {games.length === 0 ? (
        <EmptyState>
          Chưa có game nào cả.{' '}
          <Link href="/upload" className="font-bold text-accent-dark">
            Đăng game đầu tiên
          </Link>{' '}
          nhé!
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
