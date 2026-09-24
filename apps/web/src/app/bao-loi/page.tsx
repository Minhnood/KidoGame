import type { Metadata } from 'next';
import { LinkCho } from '@/components/link-cho';
import { PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { isOperatorConfigured, operator } from '@/lib/operator';
import { BaoLoiForm } from './bao-loi-form';

export const metadata: Metadata = {
  title: 'Báo lỗi — KidoGame',
  description: 'Gặp chỗ nào hỏng trên KidoGame thì kể cho chúng tôi ở đây.',
};

/**
 * Trang báo lỗi cho người dùng.
 *
 * VÌ SAO TỒN TẠI. `app/error.tsx` đã nói với người gặp lỗi "gửi kèm mã này giúp tìm ra
 * nguyên nhân nhanh hơn nhiều" mà không nói gửi ở đâu, và `/admin/loi` viết như thể
 * luồng ấy có sẵn. Trang này là chỗ để gửi.
 *
 * Nhận `?ma=` và `?tu=` để trang lỗi trỏ thẳng sang đây với mã và đường dẫn điền sẵn.
 * Người vừa gặp một trang lỗi đỏ sẽ không chép tay một chuỗi hex, và bắt họ chép là
 * cách chắc chắn nhất để mã lỗi không bao giờ tới tay người sửa.
 *
 * KHÔNG đòi đăng nhập: xem chú thích ở `guiBaoLoiAction`.
 */
export default async function BaoLoiPage({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string; tu?: string }>;
}) {
  const sp = await searchParams;

  return (
    <>
      <PageTitle
        title="Báo lỗi"
        lead="Có chỗ nào không chạy đúng? Kể cho chúng tôi, càng cụ thể càng dễ sửa."
      />

      <div className="max-w-150">
        {/*
          Nói rõ đây KHÔNG phải chỗ báo cáo nội dung xấu, và chỉ đường sang đúng nơi.
          Ba luồng dễ lẫn nhau với người dùng — lỗi kỹ thuật, nội dung không phù hợp,
          vi phạm bản quyền — và một báo cáo gửi sai cửa thì tới một hàng đợi mà người
          đọc nó không có thẩm quyền làm gì.
        */}
        <Notice tone="info">
          Chỗ này dành cho <strong>lỗi kỹ thuật</strong>: trang trắng, bấm không được, game không
          mở, thư không tới. Nếu là <strong>nội dung không phù hợp với trẻ em</strong> thì dùng nút{' '}
          <em>Báo cáo game này</em> ngay dưới game. Nếu là{' '}
          <LinkCho href="/bao-cao-ban-quyen" className="font-semibold underline">
            bản gốc của bạn bị đăng lại
          </LinkCho>
          , dùng biểu mẫu riêng cho việc đó.
        </Notice>
      </div>

      <div className="mt-6">
        <BaoLoiForm maLoiSan={sp.ma ?? ''} duongDanSan={sp.tu ?? ''} />
      </div>

      {/*
        Nêu email vận hành như một đường thứ hai, và CHỈ khi nó đã được cấu hình.
        Chưa cấu hình thì `operator()` trả về một địa chỉ `.local` — in nó ra là mời
        người dùng gửi thư vào hư không, tệ hơn là không nói gì.
      */}
      {isOperatorConfigured() && (
        <p className="mb-12 max-w-150 text-sm text-ink-soft">
          Không gửi được biểu mẫu này? Email cho chúng tôi ở{' '}
          <a href={`mailto:${operator().email}`} className="font-semibold underline">
            {operator().email}
          </a>
          .
        </p>
      )}
    </>
  );
}
