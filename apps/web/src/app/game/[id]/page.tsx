import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { objectUrl } from '@/lib/storage';
import { PlayCounter } from './play-counter';

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

  // Game bị ẩn hoặc gỡ thì coi như không tồn tại với người xem thường.
  if (!game || game.status !== 'PUBLISHED') notFound();

  const warnings = (Array.isArray(game.warnings) ? game.warnings : []) as unknown as Warning[];
  const cloudWarning = warnings.find((w) => w.code === 'CLOUD_VARIABLES');

  return (
    <>
      <h1>{game.title}</h1>
      <p className="muted">
        Của bé {game.child.displayName} · {game.playCount} lượt chơi
      </p>

      <PlayCounter gameId={game.id} />

      {/*
        Game chạy trên origin RIÊNG, trong iframe sandbox.
        - Origin riêng: cookie phiên của app không bao giờ tới được trang này.
        - `allow-same-origin` ở đây là same-origin với PLAYER origin (nơi không
          chứa gì nhạy cảm), cần có để runtime dùng được WebGL và storage.
        - KHÔNG có allow-top-navigation: game không tự điều hướng trang cha được.
      */}
      <iframe
        className="stage-frame"
        src={objectUrl('html', game.htmlSha256)}
        title={game.title}
        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-fullscreen"
        allow="fullscreen; gamepad"
        referrerPolicy="no-referrer"
      />

      {cloudWarning && <p className="notice">⚠️ {cloudWarning.message}</p>}

      {game.description && <p style={{ maxWidth: 680 }}>{game.description}</p>}

      <p style={{ margin: '18px 0 48px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {/* Tải source gốc: văn hoá cốt lõi của Scratch, trẻ học bằng cách mở game của nhau. */}
        <a className="btn btn-ghost" href={objectUrl('sb3', game.sb3Sha256)} download>
          Tải file .sb3 gốc
        </a>
        <Link className="btn btn-ghost" href="/">
          Xem game khác
        </Link>
      </p>
    </>
  );
}
