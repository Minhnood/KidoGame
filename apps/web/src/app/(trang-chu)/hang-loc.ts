/**
 * Lớp của hai hàng bộ lọc trang chủ — dùng chung cho trang thật và khung chờ.
 *
 * Cuộn ngang dưới `sm`, xuống dòng bình thường từ `sm`. Để ở file riêng vì `page.tsx`
 * không được xuất thứ gì ngoài những tên Next quy định, mà hai bản chép tay của cùng
 * một chuỗi lớp là cách chắc nhất để khung chờ lệch khỏi trang thật lúc nào không hay.
 *
 * `-mx-5 px-5`: hàng tràn ra sát mép màn hình, để viên cuối bị MÉP cắt đôi — đó là lời
 * báo "vuốt sang còn nữa". `-my-1.5 py-1.5`: khung cuộn cắt cả vòng focus (3px + lệch
 * 2px); đệm trong và bù ngoài bằng nhau thì vòng focus còn nguyên, bố cục không nhích.
 */
export const HANG_LOC =
  'kg-cuon-ngang -mx-5 -my-1.5 flex gap-2 overflow-x-auto px-5 py-1.5 ' +
  'sm:mx-0 sm:my-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0';
