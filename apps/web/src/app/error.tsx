'use client';

import { LinkCho } from '@/components/link-cho';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Notice } from '@/components/notice';
import { PageTitle } from '@/components/page';
import { reportError } from '@/lib/error-report';

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
 * `console.error` một mình thì chỉ vào console của NGƯỜI DÙNG, tức ta không bao giờ
 * thấy. Nên bên cạnh nó là `reportError`, đẩy lỗi về `/api/errors` để nó vào bảng
 * `ErrorLog` và hiện trên `/admin/loi`. Không vendor, không rời VPS — xem
 * `infra/GIAM-SAT.md` mục 4, tầng 2.
 *
 * Giữ luôn `console.error`: khi tự mở DevTools để tìm lỗi thì object lỗi đầy đủ
 * trong console vẫn hơn hẳn một dòng đã cắt trong DB.
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
    reportError('boundary', error);
  }, [error]);

  /* Đường dẫn để điền sẵn vào trang báo lỗi. `usePathname` chứ không `location.href`:
     nó KHÔNG mang query string, và query string là chỗ token xác minh email nằm — một
     link báo lỗi mang token đi là một token rò ra ngoài qua đúng cái form ta vừa mời
     người dùng gửi. `ErrorLog.path` cắt query vì cùng lý do đó. */
  const duongDan = usePathname();

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
        <LinkCho href="/" className="font-bold">
          Hoặc về trang chủ
        </LinkCho>
      </p>

      {/*
        LINK SANG CHỖ BÁO LỖI, mang theo mã và đường dẫn.

        Câu "gửi kèm mã này" đã nằm ở đây từ trước, nhưng nó không nói gửi Ở ĐÂU — và
        cho tới khi có `/bao-loi` thì thật ra không có chỗ nào để gửi. Một trang lỗi
        bảo người dùng làm một việc không làm được là tệ hơn một trang lỗi im lặng.

        Mã và đường dẫn đi theo query string chứ không bắt chép tay: người vừa gặp
        trang lỗi đỏ sẽ không chép một chuỗi hex, nên bắt chép là cách chắc chắn nhất
        để mã lỗi không bao giờ tới tay người sửa.
      */}
      <Notice tone="info">
        {error.digest ? (
          <>
            Kể cho chúng tôi chỗ hỏng này ở{' '}
            <LinkCho href={`/bao-loi?ma=${encodeURIComponent(error.digest)}&tu=${encodeURIComponent(duongDan)}`} className="font-bold">
              trang báo lỗi
            </LinkCho>{' '}
            — mã lỗi đã điền sẵn giúp bạn. Mã đó là{' '}
            <code className="font-bold">{error.digest}</code>, giúp tìm ra nguyên nhân nhanh hơn
            nhiều.
          </>
        ) : (
          <>
            Kể cho chúng tôi chỗ hỏng này ở{' '}
            <LinkCho href={`/bao-loi?tu=${encodeURIComponent(duongDan)}`} className="font-bold">
              trang báo lỗi
            </LinkCho>
            . Lần này không có mã lỗi, nên bạn kể càng cụ thể càng dễ tìm.
          </>
        )}
      </Notice>
    </>
  );
}
