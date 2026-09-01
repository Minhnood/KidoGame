import { Hoa } from './site-decor';

/**
 * MẶT THẺ dùng chung cho mọi thứ hình cái thẻ: thẻ form, thẻ game trên trang chủ,
 * thẻ từng bé ở trang bố mẹ, thẻ game chờ kiểm duyệt ở trang admin.
 *
 * Trước đây mỗi chỗ tự viết lại cùng một chuỗi class và chúng đã bắt đầu lệch nhau.
 * Gom về một dòng để sửa một lần là cả trang web đổi theo.
 *
 * NỀN LÀ DẢI CHUYỂN SẮC `surface` → `bg`, rất nhạt. Cả hai màu này đều đã có cặp
 * trong `contrast-check` (chữ chính và chữ phụ, trên cả hai) nên đặt chữ lên vẫn an
 * toàn ở mọi điểm của dải. Một mảng `surface` phẳng thì thẻ trông như bị dán lên
 * trang; thêm chút chuyển sắc với `shadow-sm` thì nó thành một tấm nằm TRÊN trang.
 *
 * KHÔNG có padding và KHÔNG có bề rộng trong này — hai thứ đó mỗi chỗ một khác, và
 * nhét chúng vào đây là buộc mọi thẻ phải giống nhau ở đúng chỗ chúng cần khác.
 */
export const KHUNG_THE = 'rounded-card border border-border shadow-sm';

/**
 * Mặt thẻ mặc định: dáng thẻ cộng nền `surface` → `bg`.
 *
 * Tách khỏi `KHUNG_THE` vì thẻ game tự chọn nền theo tông riêng của nó, và HAI thứ
 * này không cộng được: `bg-linear-*` đặt `background-image`, `bg-the-3` đặt
 * `background-color` — dùng cả hai thì dải chuyển sắc phủ kín màu tông ở dưới và
 * mọi thẻ game lại trắng như nhau, không một lỗi nào báo ra.
 */
export const MAT_THE = `${KHUNG_THE} bg-linear-to-b from-surface to-bg`;

/**
 * Thẻ FORM: mặt thẻ dùng chung, cộng padding, cộng khoảng cách dưới.
 *
 * Bề rộng KHÔNG nằm trong đây: mỗi form một bề rộng khác nhau là chủ ý — xem ghi chú
 * ở `FormColumn` trong `page.tsx`.
 *
 * `relative` là phần bắt buộc, không phải thừa: bụi cỏ `GocCo` bên dưới đặt chỗ theo
 * góc thẻ, mà thiếu `relative` thì nó tính theo cả trang và rơi xuống đâu không biết.
 */
export const THE_FORM = `relative mb-12 p-6 ${MAT_THE}`;

/**
 * Bụi cỏ nhỏ ở góc DƯỚI BÊN PHẢI thẻ form, nhô lên khỏi mép thẻ một chút.
 *
 * Vì sao góc dưới bên phải, không phải ba góc kia:
 *  - Góc trên: sát ngay tiêu đề trang, chen vào giữa hai thứ đang cần đọc.
 *  - Góc dưới BÊN TRÁI: đúng chỗ nút submit đứng ở cả bốn form. Trang trí mọc trùm
 *    lên nút bấm chính là loại "cho đẹp" đắt nhất.
 *  - Góc dưới bên phải trống ở cả bốn form.
 *
 * `pointer-events-none` vì nó nhô ra ngoài mép thẻ, tức nằm trên vùng bấm được của
 * trang. Nó là hình vẽ, đừng để nó ăn một cú bấm nào.
 *
 * Cỏ vẽ CAO HƠN mép thẻ (`-bottom-2`) chứ không nằm gọn trong thẻ: cỏ mọc từ dưới
 * đất lên, nên nó phải che một khúc mép thẻ mới ra vẻ đứng TRƯỚC tấm thẻ. Nằm gọn
 * bên trong thì nó thành một hình dán trong ô, không phải một bụi cỏ.
 */
export function GocCo() {
  return (
    <svg
      viewBox="0 0 54 26"
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute -bottom-2.5 right-5 h-8.5 w-18"
      fill="none"
    >
      {/* Bốn nhánh cỏ toả ra từ một gốc, cao thấp khác nhau. Cùng độ cao thì thành
          cái lược; toả từ một điểm thì mới ra một bụi. */}
      <g stroke="var(--color-decor-la-dam)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M12 26C11 19 9 13 5 8" />
        <path d="M16 26C15 18 16 12 18 6" />
        <path d="M20 26C21 20 24 15 28 11" />
        <path d="M23 26C26 22 30 19 34 17" />
      </g>
      <Hoa x={40} y={26} mau="var(--color-decor-hoa-hong)" s={0.95} />
      <Hoa x={50} y={26} mau="var(--color-decor-hoa-vang)" s={0.7} />
    </svg>
  );
}
