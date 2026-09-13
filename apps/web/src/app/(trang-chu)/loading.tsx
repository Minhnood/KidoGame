import { DauTrangCho, KhungCho, LuoiGameCho, O, Vien } from '@/components/dang-tai';
import { HANG_LOC, LE_DUOI_LOAI, LE_DUOI_TUOI } from './hang-loc';

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
        DẢI MỜI ở đầu trang — cùng lớp với khối `home-hero`: `mt-5 px-4 py-5` trên điện
        thoại, `sm:mt-7 sm:px-8 sm:py-7` từ `sm`. Nó chiếm gần một phần tư màn hình đầu,
        nên bỏ nó khỏi khung chờ là mọi thứ bên dưới nằm cao hơn chỗ thật rồi tụt xuống
        một cái khi trang tới.

      */}
      <div
        className="mt-5 rounded-card border border-border px-4 py-5 sm:mt-7 sm:px-8 sm:py-7"
        aria-hidden="true"
      >
        {/*
          Câu chào: CHÍNH CÂU CHỮ THẬT, tàng hình, với gạch xám đè lên.

          Không dựng bằng chiều cao cố định như các dòng khác, vì câu này gãy dòng tuỳ
          bề rộng: một dòng ở 390px, hai dòng ở 360px. Dựng cứng một dòng thì ở 360px
          cả trang tụt 27px khi trang thật tới. Để trình duyệt gãy dòng hộ thì khung
          chờ khớp ở mọi cỡ mà không phải biết phông chữ rộng bao nhiêu.
        */}
        {/* `<div>`, KHÔNG phải `<p>` như trang thật: `O` là một `<div>`, và `<div>` trong
            `<p>` thì trình phân tích HTML tự đóng `<p>` sớm — đo ra dải chờ cao dư 20px. */}
        <div className="relative text-xl font-extrabold leading-snug sm:text-3xl">
          <span className="invisible">Chào bé, hôm nay chơi game gì?</span>
          <span className="absolute inset-0 flex items-center">
            <O className="h-5 w-64 max-w-full sm:h-7 sm:w-80" />
          </span>
        </div>
        {/* Đoạn giới thiệu chỉ có từ `sm`: `mt-2 max-w-2xl` hai dòng, 48px. */}
        <div className="mt-2 hidden max-w-2xl sm:block">
          <div className="flex h-6 items-center">
            <O className="h-4 w-full" />
          </div>
          <div className="flex h-6 items-center">
            <O className="h-4 w-4/5" />
          </div>
        </div>
        {/* HÀNG NÚT — nút cỡ `lg-tu-sm`: 48px trên điện thoại, 56px từ `sm`. Bản đầu
            tiên bỏ sót hẳn hàng này, và một mình nó là 76 trong 89px mà dải mời bị hụt. */}
        <div className="mt-3 flex flex-wrap gap-2 sm:mt-5 sm:gap-3">
          <O className="h-12 w-33 rounded-full sm:h-14 sm:w-44" />
          <O className="h-12 w-36 rounded-full sm:h-14 sm:w-40" />
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
      <div className={`${LE_DUOI_LOAI} ${HANG_LOC}`} aria-hidden="true">
        {['w-20', 'w-24', 'w-28', 'w-20', 'w-32', 'w-24'].map((w, i) => (
          <Vien key={i} className={`shrink-0 ${w}`} />
        ))}
      </div>
      <div className={`${LE_DUOI_TUOI} items-center ${HANG_LOC}`} aria-hidden="true">
        <O className="h-3.5 w-32 shrink-0" />
        {['w-40', 'w-24', 'w-24', 'w-24'].map((w, i) => (
          <Vien key={i} className={`shrink-0 ${w}`} />
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
