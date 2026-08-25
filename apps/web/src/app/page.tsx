import Link from 'next/link';
import { prisma } from '@/lib/db';
import { objectUrl } from '@/lib/storage';

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
      <h1>Game mới nhất</h1>
      <p className="muted">Các game do chính các bé làm bằng Scratch.</p>

      {games.length === 0 ? (
        <div className="empty">
          Chưa có game nào cả. <Link href="/upload">Đăng game đầu tiên</Link> nhé!
        </div>
      ) : (
        <div className="grid">
          {games.map((game) => (
            <Link key={game.id} href={`/game/${game.id}`} className="card">
              {/* Thumbnail nằm trên player origin — app origin không serve file người dùng. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={objectUrl('thumb', game.thumbSha256)} alt="" loading="lazy" />
              <div className="body">
                <p className="title">{game.title}</p>
                <p className="by">
                  {game.child.displayName} · {game.playCount} lượt chơi
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
