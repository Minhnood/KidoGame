import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { objectUrl } from '@/lib/storage';
import { ButtonAnchor, ButtonLink } from '@/components/button';
import { Notice } from '@/components/notice';
import { PageTitle } from '@/components/page';
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
      <PageTitle
        title={game.title}
        lead={`Của bé ${game.child.displayName} · ${game.playCount} lượt chơi`}
      />

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

      <div className="mx-auto max-w-180">
        {cloudWarning && <Notice tone="warn">{cloudWarning.message}</Notice>}

        {game.description && <p className="mt-4">{game.description}</p>}

        <div className="mb-12 mt-5 flex flex-wrap gap-2.5">
          {/* Tải source gốc: văn hoá cốt lõi của Scratch, trẻ học bằng cách mở game của nhau. */}
          <ButtonAnchor variant="ghost" href={objectUrl('sb3', game.sb3Sha256)} download>
            Tải file .sb3 gốc
          </ButtonAnchor>
          <ButtonLink href="/" variant="ghost">
            Xem game khác
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
