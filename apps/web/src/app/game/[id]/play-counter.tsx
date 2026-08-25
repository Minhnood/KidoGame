'use client';

import { useEffect, useRef } from 'react';

/**
 * Đếm lượt chơi ở client, bắn đúng một lần mỗi lần mở trang.
 *
 * Không đếm ở server component vì Next có thể render lại nhiều lần cho cùng một
 * lượt xem, và prefetch cũng sẽ làm số đếm phồng lên.
 */
export function PlayCounter({ gameId }: { gameId: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void fetch(`/api/games/${gameId}/play`, { method: 'POST' }).catch(() => {
      // Đếm lượt hỏng thì kệ, không làm phiền người chơi.
    });
  }, [gameId]);

  return null;
}
