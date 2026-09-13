import { DauTrangCho, KhungCho, LuoiGameCho } from '@/components/dang-tai';

/**
 * Khung chờ của trang bạn bè.
 *
 * BA thẻ chứ không sáu như trang chủ: danh sách này là những bạn bé tự chọn theo dõi,
 * nên nó ngắn — phần lớn sẽ là một tới ba. Vẽ sáu ô rồi hiện ra hai là một cú tụt dài,
 * và ở trang này cú tụt ấy còn đọc ra một câu không ai muốn nói với đứa trẻ: "tưởng
 * nhiều hơn cơ".
 */
export default function DangTaiBanBe() {
  return (
    <KhungCho cauNoi="Đang tải trang bạn bè…">
      <DauTrangCho />
      <div className="mt-8">
        <LuoiGameCho so={3} />
      </div>
    </KhungCho>
  );
}
