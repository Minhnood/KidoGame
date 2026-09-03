import type { Metadata } from 'next';
import Link from 'next/link';
import { PageTitle } from '@/components/page';

export const metadata: Metadata = {
  title: 'Không tìm thấy trang — KidoGame',
};

/**
 * Trang 404.
 *
 * Trước đây file này KHÔNG tồn tại, nên mọi đường dẫn sai rơi vào trang 404 mặc
 * định của Next: một dòng "404 | This page could not be found" bằng tiếng Anh,
 * không có thanh điều hướng, không có đường về. Với một trang cho trẻ em Việt Nam
 * thì đó là một cái ngõ cụt bằng tiếng nước ngoài.
 *
 * Đường dẫn sai KHÔNG phải chuyện hiếm ở đây: link game được chia cho nhau qua
 * tin nhắn, mà game bị ẩn hoặc bị gỡ thì link cũ vẫn còn trong máy bạn bè.
 *
 * KHÔNG nói "lỗi". 404 không phải lỗi của đứa trẻ đang đọc, và với trẻ con thì
 * chữ "lỗi" đọc ra là "mình vừa làm hỏng cái gì".
 */
export default function NotFound() {
  return (
    <>
      <PageTitle
        title="Không có trang này"
        lead="Có thể link bị gõ sai, hoặc game đã được bố mẹ ẩn đi rồi."
      />
      <p className="mt-6">
        <Link href="/" className="font-bold">
          Về trang chủ xem game khác
        </Link>
      </p>
    </>
  );
}
