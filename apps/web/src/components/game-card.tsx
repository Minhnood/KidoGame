import Link from 'next/link';

export interface GameCardData {
  id: string;
  title: string;
  authorName: string;
  thumbUrl: string;
  playCount: number;
}

/**
 * Thẻ game trên trang chủ.
 *
 * Cả thẻ là một link chứ không phải chỉ tiêu đề — vùng bấm to hơn nhiều,
 * quan trọng với trẻ dùng điện thoại.
 */
export function GameCard({ game }: { game: GameCardData }) {
  return (
    <Link
      href={`/game/${game.id}`}
      data-testid="game-card"
      className="group block overflow-hidden rounded-card border border-border bg-surface no-underline transition-transform hover:-translate-y-0.5"
    >
      {/*
        Ảnh nằm trên player origin nên dùng <img> thường thay vì next/image:
        next/image sẽ đòi cấu hình remotePatterns, mà ảnh đã đúng kích thước và
        đã là webp rồi, không cần tối ưu thêm.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={game.thumbUrl}
        alt=""
        loading="lazy"
        width={480}
        height={360}
        className="block aspect-4/3 w-full bg-bg object-cover"
      />
      <div className="px-3.5 pb-3.5 pt-3">
        {/* 2 dòng thay vì cắt cụt: tên game bị cắt thì trẻ không biết game gì. */}
        <p className="mb-0.5 line-clamp-2 font-bold group-hover:text-accent-dark">{game.title}</p>
        <p className="text-sm text-ink-soft">
          {game.authorName} · {game.playCount} lượt chơi
        </p>
      </div>
    </Link>
  );
}
