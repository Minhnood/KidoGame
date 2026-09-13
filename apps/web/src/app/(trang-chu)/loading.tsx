import { DauTrangCho, KhungCho, LuoiGameCho, O, Vien } from '@/components/dang-tai';

/**
 * Khung chờ của trang chủ.
 *
 * FILE NÀY PHẢI NẰM TRONG NHÓM `(trang-chu)`, KHÔNG ĐƯỢC ĐƯA VỀ `app/loading.tsx`.
 *
 * Nó từng nằm ở gốc app, và `loading.tsx` ở gốc không bọc riêng trang chủ — nó bọc
 * MỌI TRANG. Có khung chờ thì Next gửi dòng trạng thái 200 đi ngay để kịp vẽ khung,
 * nên mọi `redirect()` và `notFound()` ở bất cứ đâu bên dưới đều chạy SAU khi mã
 * trạng thái đã rời máy chủ. Đo được khi còn ở gốc:
 *
 *   admin.localhost/admin, không cookie   -> 200 (đúng ra 307 sang đăng nhập)
 *   /game/<id> đã bị phụ huynh ẩn         -> 200 (đúng ra 404)
 *
 * Nội dung không lộ — body chỉ có khung chờ và một `NEXT_REDIRECT` để JavaScript chuyển
 * hướng hộ. Nhưng việc chặn cửa khu quản trị thành ra do trình duyệt tự nguyện làm, và
 * game đã ẩn trả 200 cho mọi bot, bộ nhớ đệm, phần mềm kiểm link. Sáu bộ kiểm đỏ cùng
 * lúc vì đúng một file này.
 *
 * Nhóm route không đổi URL — trang vẫn là `/` — nhưng giới hạn khung chờ về đúng một
 * trang, và trang chủ không có `redirect` hay `notFound` nào để làm hỏng.
 *
 * Trang chủ là chỗ trẻ quay về sau mỗi game, nên nó được mở nhiều lần trong một buổi
 * — và mỗi lần quay về là một lần chờ.
 *
 * KHÔNG dựng ô chờ cho dải "Game mới của bạn bè". Dải đó **ẩn hẳn khi rỗng** (lý do ở
 * `theo-doi.ts`), và phần lớn bé chưa theo dõi ai. Vẽ sẵn một dải rồi để nó biến mất
 * là tự tay tạo ra đúng cú nhảy mà cả file này sinh ra để xoá — và tệ hơn, nó nhá lên
 * một dải "bạn bè" cho đứa trẻ chưa có người bạn nào trên trang.
 */
export default function DangTaiTrangChu() {
  return (
    <KhungCho cauNoi="Đang tải trang chủ…">
      {/*
        DẢI MỜI ở đầu trang — `mt-7 rounded-card px-6 py-7`, đúng khối `home-hero`.
        Nó chiếm gần một phần tư màn hình đầu, nên bỏ nó khỏi khung chờ là mọi thứ
        bên dưới nằm cao hơn chỗ thật rồi tụt xuống một cái khi trang tới.
      */}
      <div className="mt-7 rounded-card border border-border px-6 py-7 sm:px-8" aria-hidden="true">
        {/* Câu chào `text-2xl sm:text-3xl leading-snug` — hộp dòng đo được 41px. */}
        <div className="flex h-10.25 items-center">
          <O className="h-7 w-80 max-w-full" />
        </div>
        {/* Đoạn giới thiệu `mt-2 max-w-2xl`, hai dòng, đo được 48px. */}
        <div className="mt-2 max-w-2xl">
          <div className="flex h-6 items-center">
            <O className="h-4 w-full" />
          </div>
          <div className="flex h-6 items-center">
            <O className="h-4 w-4/5" />
          </div>
        </div>
        {/* HÀNG NÚT `mt-5 flex gap-3`, cao 56px — bản trước bỏ sót hẳn hàng này, và
            một mình nó là 76 trong 89px mà dải mời bị hụt so với dải thật. */}
        <div className="mt-5 flex flex-wrap gap-3">
          <O className="h-14 w-44 rounded-full" />
          <O className="h-14 w-40 rounded-full" />
        </div>
      </div>

      <DauTrangCho />

      {/*
        Hàng tìm kiếm: ô nhập `max-w-100 rounded-field` + nút "Tìm".

        CAO 54px, KHÔNG phải 48. `min-h-touch` là 48, nhưng ô nhập còn `py-3` cộng
        chiều cao dòng chữ nên nó nở ra 54 — đo trên trang thật mới biết. Lấy 48 vì
        thấy `min-h-touch` trong mã nguồn là hụt 6px, và 6px đó cộng với 6px của dòng
        đếm kết quả bên dưới thành đúng 12px mà cả lưới thẻ bị tụt.
      */}
      <div className="mb-4 flex gap-2" aria-hidden="true">
        <O className="h-13.5 w-full max-w-100 rounded-field" />
        <O className="h-13.5 w-20 shrink-0 rounded-full" />
      </div>

      {/* Hai hàng bộ lọc: theo loại game, rồi theo tuổi. Bề rộng các viên thuốc lệch
          nhau vì nhãn thật dài ngắn khác nhau — năm viên bằng chằn chặn đọc ra như
          một thanh điều khiển, không như một hàng nhãn chữ. */}
      <div className="mb-2 flex flex-wrap gap-2" aria-hidden="true">
        {['w-20', 'w-24', 'w-28', 'w-20', 'w-32', 'w-24'].map((w, i) => (
          <Vien key={i} className={w} />
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2" aria-hidden="true">
        <O className="h-3.5 w-32" />
        {['w-40', 'w-24', 'w-24', 'w-24'].map((w, i) => (
          <Vien key={i} className={w} />
        ))}
      </div>

      {/* Dòng "N game" — hộp dòng `text-sm` cao 20px, gạch bên trong 14px. */}
      <div className="mb-4 flex h-5 items-center" aria-hidden="true">
        <O className="h-3.5 w-20" />
      </div>

      <div className="mb-12">
        <LuoiGameCho />
      </div>
    </KhungCho>
  );
}
