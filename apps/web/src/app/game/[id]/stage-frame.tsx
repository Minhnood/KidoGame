'use client';

import { useEffect, useState } from 'react';

/**
 * Khung game + nút phóng to cho điện thoại.
 *
 * VÌ SAO PHÓNG TO BẰNG CSS, KHÔNG DÙNG Fullscreen API:
 * `Element.requestFullscreen` không được hỗ trợ cho phần tử thường trên Safari
 * iPhone — ở đó chỉ video mới vào được toàn màn hình. Dùng API ấy thì nút sẽ chết
 * im lặng trên đúng nhóm thiết bị cần nó nhất. Cho iframe `position: fixed; inset: 0`
 * thì chạy ở mọi trình duyệt, và runtime tự canh lại stage khi khung đổi kích thước.
 *
 * VÌ SAO CẦN NÓ: khung game nhúng trên điện thoại chỉ khoảng 350×284 CSS px. Nút
 * cảm ứng nhỏ nhất đã hạ xuống 38px mà vẫn che mất vùng chơi và đè lên nhân vật.
 * Phóng to là cách duy nhất để vừa có chỗ chơi vừa có chỗ đặt nút.
 */
export function StageFrame({ src, title }: { src: string; title: string }) {
  const [expanded, setExpanded] = useState(false);

  // Khoá cuộn trang phía sau, không thì ngón tay trượt trên nút lại kéo cả trang.
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [expanded]);

  // Nút Esc trên bàn phím ngoài (máy tính bảng có bàn phím rời).
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  return (
    <>
      <div className={expanded ? 'fixed inset-0 z-50 bg-ink' : undefined}>
        {/*
          Game chạy trên origin RIÊNG, trong iframe sandbox.
          - Origin riêng: cookie phiên của app không bao giờ tới được trang này.
          - `allow-same-origin` ở đây là same-origin với PLAYER origin (nơi không
            chứa gì nhạy cảm), cần có để runtime dùng được WebGL và storage.
          - KHÔNG có allow-top-navigation: game không tự điều hướng trang cha được.
          - KHÔNG có `allow-fullscreen` trong sandbox: đó KHÔNG phải token sandbox
            hợp lệ (Chrome cảnh báo và bỏ qua). Toàn màn hình do thuộc tính
            `allow="fullscreen"` bên dưới điều khiển.
        */}
        <iframe
          className={
            expanded
              ? 'stage-frame !aspect-auto !h-full !max-w-none !rounded-none !border-0'
              : 'stage-frame'
          }
          src={src}
          title={title}
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          allow="fullscreen; gamepad"
          referrerPolicy="no-referrer"
        />

        {expanded && (
          /* Đặt giữa mép trên: hai đầu thanh điều khiển của packager đã có cờ xanh,
             nút dừng (trái) và nút toàn màn hình (phải) — chen vào là đè lên nhau. */
          <button
            type="button"
            onClick={() => setExpanded(false)}
            data-testid="stage-shrink"
            className="min-h-touch fixed left-1/2 top-2 z-10 -translate-x-1/2 cursor-pointer rounded-full border-0 bg-white/85 px-5 font-bold text-ink shadow"
          >
            Thu nhỏ
          </button>
        )}
      </div>

      {!expanded && (
        /* `touch-only` ẩn nút trên máy có chuột: ở đó khung đã đủ rộng, mà bàn phím
           thật lúc nào cũng tốt hơn nút bấm. Xem globals.css. */
        <div className="touch-only mx-auto mt-3 max-w-180 justify-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            data-testid="stage-expand"
            className="min-h-touch inline-flex cursor-pointer items-center justify-center rounded-full border-0 bg-accent px-6 font-bold text-ink"
          >
            Chơi to hơn
          </button>
        </div>
      )}
    </>
  );
}
