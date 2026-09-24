import type { Metadata } from 'next';
import { LinkCho } from '@/components/link-cho';
import { PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { TAKEDOWN_SLA_WORKING_DAYS } from '@/lib/operator';
import { TakedownForm } from './takedown-form';

export const metadata: Metadata = {
  title: 'Yêu cầu gỡ nội dung vi phạm bản quyền — KidoGame',
  description: 'Báo cho chúng tôi khi game của bạn bị đăng lại trên KidoGame mà không được phép.',
};

/**
 * Trang gửi yêu cầu gỡ vì bản quyền.
 *
 * Cho phép điền sẵn game qua `?game=<link hoặc mã>` để trang chơi game trỏ thẳng
 * sang đây. Người đang bực vì thấy bài của mình bị đăng lại sẽ không muốn đi tìm
 * lại đường link mà một phút trước họ vừa đóng.
 */
export default async function TakedownPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const sp = await searchParams;

  return (
    <>
      <PageTitle
        title="Yêu cầu gỡ nội dung vi phạm bản quyền"
        lead="Dành cho người làm ra bản gốc. Bạn không cần có tài khoản ở đây."
      />

      <div className="max-w-150">
        <Notice tone="warn">
          Game sẽ bị <strong>ẩn ngay</strong> khi bạn bấm gửi, trước khi có ai kịp đọc. Chúng tôi
          xem lại và trả lời vào email của bạn trong {TAKEDOWN_SLA_WORKING_DAYS} ngày làm việc.
          Người đăng game là trẻ em, nên xin bạn chỉ gửi khi thật sự là người có quyền với bản gốc.
        </Notice>

        <p className="mt-4 text-ink-soft">
          Nếu vấn đề không phải bản quyền — nội dung không phù hợp với trẻ em, hình ảnh đáng sợ,
          lời lẽ thô tục — thì dùng nút <strong>Báo cáo game này</strong> ngay dưới game, nhanh hơn
          nhiều. Biểu mẫu này chỉ dành cho việc bản gốc của bạn bị đăng lại.
        </p>
      </div>

      <div className="mt-6">
        <TakedownForm defaultGameRef={sp.game ?? ''} />
      </div>

      <p className="mb-12 text-sm text-ink-soft">
        Quy trình đầy đủ nằm trong{' '}
        <LinkCho href="/dieu-khoan#quy-trinh-go" className="font-semibold underline">
          điều khoản sử dụng
        </LinkCho>
        .
      </p>
    </>
  );
}
