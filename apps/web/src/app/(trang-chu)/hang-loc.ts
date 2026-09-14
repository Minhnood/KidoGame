/**
 * Lớp của hai hàng bộ lọc trang chủ — dùng chung cho trang thật và khung chờ.
 *
 * Cuộn ngang dưới `sm`, xuống dòng bình thường từ `sm`. Để ở file riêng vì `page.tsx`
 * không được xuất thứ gì ngoài những tên Next quy định, mà hai bản chép tay của cùng
 * một chuỗi lớp là cách chắc nhất để khung chờ lệch khỏi trang thật lúc nào không hay.
 *
 * `-mx-5 px-5`: hàng tràn ra sát mép màn hình, để viên cuối bị MÉP cắt đôi — đó là lời
 * báo "vuốt sang còn nữa". `py-1.5`: khung cuộn cắt cả vòng focus (3px + lệch 2px).
 *
 * CHỈ BÙ LỀ TRÊN (`-mt-1.5`), KHÔNG `-my-1.5`. Lề dưới do từng hàng tự khai theo
 * `LE_DUOI_*` bên dưới. Bản đầu dùng `-my-1.5 … sm:my-0` đặt chung thẻ với `mb-2` /
 * `mb-5`: cùng một thuộc tính `margin-bottom`, và `sm:my-0` nằm trong media query nên
 * thắng — từ 640px hai hàng lọc và dòng đếm dính sát nhau, lề 0px thay vì 8 và 20.
 * Fen thấy bằng mắt; không phép kiểm nào đỏ vì khung chờ mắc đúng lỗi y hệt.
 */
export const HANG_LOC =
  'kg-cuon-ngang -mx-5 -mt-1.5 flex gap-2 overflow-x-auto px-5 py-1.5 ' +
  'sm:mx-0 sm:mt-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0';

/*
 * Lề dưới của hai hàng: 8px và 20px giữa các viên thuốc, ở mọi cỡ màn.
 * Dưới `sm` trừ đi 6px của `py-1.5`, vì đệm ấy đã nằm giữa viên thuốc và hàng kế.
 */
export const LE_DUOI_LOAI = 'mb-0.5 sm:mb-2';
export const LE_DUOI_TUOI = 'mb-3.5 sm:mb-5';
