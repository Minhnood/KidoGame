'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Notice } from '@/components/notice';
import { PageTitle } from '@/components/page';

/**
 * Error boundary cho mọi trang.
 *
 * Trước đây file này KHÔNG tồn tại. Một server component ném lỗi ở production thì
 * Next trả trang lỗi mặc định của nó: chữ tiếng Anh, không thanh điều hướng, không
 * đường về, và không có gì để người dùng báo lại cho ta.
 *
 * `digest` LÀ THỨ QUAN TRỌNG NHẤT trên trang này.
 *
 * Ở production Next cố tình KHÔNG gửi thông điệp lỗi thật xuống trình duyệt — thông
 * điệp lỗi rò cấu trúc bên trong, đôi khi rò cả dữ liệu. Thay vào đó nó băm lỗi
 * thành một `digest` và in cùng một `digest` ấy vào log server. Nên mã đó là sợi
 * dây DUY NHẤT nối "phụ huynh nói web hỏng" với đúng một dòng trong log. Không hiện
 * nó ra thì cách duy nhất còn lại là đoán.
 *
 * `console.error` ở đây là chỗ CẮM error tracking sau này (Sentry hoặc thứ tương
 * đương): chính hàm này là nơi mọi lỗi phía client đi qua. Hiện tại nó chỉ vào
 * console của trình duyệt, tức là chỉ ta thấy khi tự mở DevTools — KHÔNG ai theo dõi
 * được lỗi của người dùng thật. Xem `infra/GIAM-SAT.md`.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error boundary]', error);
  }, [error]);

  return (
    <>
      <PageTitle
        title="Trang này đang bị lỗi"
        lead="Lỗi ở phía chúng tôi, không phải do bạn làm gì sai."
      />

      <p className="mt-4">
        <button
          type="button"
          onClick={reset}
          className="min-h-touch cursor-pointer rounded-full border-0 bg-accent px-6 font-bold text-chrome"
        >
          Thử lại
        </button>
      </p>

      <p className="mt-4">
        <Link href="/" className="font-bold">
          Hoặc về trang chủ
        </Link>
      </p>

      {error.digest && (
        <Notice tone="info">
          Nếu báo lỗi cho chúng tôi, gửi kèm mã này giúp tìm ra nguyên nhân nhanh hơn nhiều:{' '}
          <code className="font-bold">{error.digest}</code>
        </Notice>
      )}
    </>
  );
}
