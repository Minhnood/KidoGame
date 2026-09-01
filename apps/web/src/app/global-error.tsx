'use client';

import { useEffect } from 'react';

/**
 * Error boundary CUỐI CÙNG — bắt lỗi xảy ra trong chính `layout.tsx`.
 *
 * Vì sao cần cả file này khi đã có `error.tsx`: `error.tsx` render BÊN TRONG layout,
 * nên nếu chính layout ném lỗi thì nó không cứu được gì. File này thay thế toàn bộ
 * cây, và vì thế nó PHẢI tự viết `<html>` và `<body>` — layout đã không chạy nữa,
 * không còn ai viết hai thẻ đó.
 *
 * KHÔNG import component nào của site, KHÔNG dùng class Tailwind, KHÔNG dùng token
 * màu. Đây là trang cho lúc mọi thứ khác đã đổ: nếu nó phụ thuộc vào một thứ đang
 * hỏng thì nó hỏng theo, và người dùng nhận được một trang trắng thay vì một câu.
 * Style viết thẳng inline, màu chốt cứng.
 *
 * Trang này hiếm khi xuất hiện, nhưng đúng lúc nó xuất hiện thì mọi cách chẩn đoán
 * khác đều đã tắt — nên `digest` ở đây còn quan trọng hơn ở `error.tsx`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global error boundary]', error);
  }, [error]);

  return (
    <html lang="vi">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#f8f7f3',
          color: '#1b1b32',
          font: '400 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <main style={{ maxWidth: '32rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 12px' }}>
            KidoGame đang bị lỗi
          </h1>
          <p style={{ margin: '0 0 20px' }}>
            Lỗi ở phía chúng tôi, không phải do bạn làm gì sai. Thử tải lại trang nhé.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: '44px',
              padding: '0 24px',
              border: 0,
              borderRadius: '999px',
              background: '#ff8c1a',
              color: '#1b1b32',
              font: '700 16px system-ui, sans-serif',
              cursor: 'pointer',
            }}
          >
            Tải lại
          </button>
          {error.digest && (
            <p style={{ marginTop: '20px', fontSize: '0.9rem', color: '#5b5b6e' }}>
              Mã lỗi để báo cho chúng tôi: <code style={{ fontWeight: 700 }}>{error.digest}</code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
