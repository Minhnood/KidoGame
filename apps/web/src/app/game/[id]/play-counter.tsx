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
    const url = `/api/games/${gameId}/play`;

    /*
     * `sendBeacon` chứ KHÔNG phải `fetch`, và đây là kết quả của hai lần thử sai.
     *
     * Triệu chứng: `fetch` ở đây làm trình duyệt ghi `net::ERR_ABORTED` cho request
     * này ở MỌI lần mở trang game, cả dev lẫn production. Số lượt chơi vẫn tăng đúng
     * (đo nhiều lần, luôn +1, response 204 vẫn về) nên đây thuần là tiếng ồn — nhưng
     * là dòng đỏ DUY NHẤT còn lại trên trang này, và một lỗi đỏ xuất hiện ở mọi lần
     * chơi chính là thứ che mất lỗi thật về sau.
     *
     * Đã thử và KHÔNG khỏi: (1) đoán là React StrictMode gọi effect hai lần — sai, vì
     * bản production không có StrictMode mà vẫn báo; (2) thêm `keepalive: true` — sai,
     * đo lại vẫn ERR_ABORTED y nguyên.
     *
     * Nguyên nhân thật: đây là một request KHÔNG ai đọc response. `fetch` vẫn tạo ra
     * một luồng response, và luồng bị bỏ không đọc thì trình duyệt kể lại là "aborted".
     * `sendBeacon` là API dựng riêng cho đúng việc này — gửi một POST rồi thôi, không
     * có response để mà bỏ, nên không có gì để báo lỗi. Nó cũng được trình duyệt bảo
     * đảm gửi xong kể cả khi trẻ đóng tab ngay sau khi bấm chơi.
     *
     * Route `/play` bỏ qua body hoàn toàn (tham số `_request`), nên `sendBeacon` không
     * kèm body là đúng, không phải thiếu sót.
     */
    const beacon = navigator.sendBeacon?.bind(navigator);
    if (beacon?.(url)) return;

    // Trình duyệt không có sendBeacon, hoặc nó từ chối xếp hàng (hàng đợi đầy).
    void fetch(url, { method: 'POST', keepalive: true }).catch(() => {
      // Đếm lượt hỏng thì kệ, không làm phiền người chơi.
    });
  }, [gameId]);

  return null;
}
