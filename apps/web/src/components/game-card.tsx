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
      /*
       * Ảnh nằm LỌT TRONG thẻ (thẻ có padding, ảnh tự bo góc) chứ không dán sát mép.
       * Bản cũ để ảnh chạm ba cạnh nên chỗ ảnh gặp phần chữ thành một đường cắt
       * ngang, và thẻ trông như hai mảnh dán lại. Một khung đệm quanh ảnh làm cả thẻ
       * thành một mặt liền.
       *
       * Hover nhấc 4px chứ không phải 2px: 2px là thứ người lớn ngồi gần màn hình
       * mới nhận ra. Trẻ cần phản hồi rõ ràng để biết cái này bấm được.
       */
      className="group block rounded-card border border-border bg-surface p-2 no-underline shadow-sm transition duration-150 hover:-translate-y-1 hover:border-accent hover:shadow-lg"
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
        className="block aspect-4/3 w-full rounded-xl bg-bg object-cover"
      />
      <div className="px-1.5 pb-1 pt-2.5">
        {/* 2 dòng thay vì cắt cụt: tên game bị cắt thì trẻ không biết game gì. */}
        <p className="mb-0.5 line-clamp-2 text-lg font-bold leading-snug group-hover:text-accent-text">
          {game.title}
        </p>
        <p className="text-sm text-ink-soft">
          {game.authorName} · {game.playCount} lượt chơi
        </p>
      </div>
    </Link>
  );
}
