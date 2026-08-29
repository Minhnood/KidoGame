/**
 * Tranh trang trí ở hai bên lề: cây, cỏ, mặt trời.
 *
 * Nội dung của KidoGame rộng tối đa 1024px, nên trên màn hình to hai bên bỏ trống
 * một khoảng lớn. Đây là trang cho trẻ em, và một dải trắng trơn hai bên là thứ
 * người lớn quen mắt chứ trẻ con thì không.
 *
 * BỐN RÀNG BUỘC, đừng gỡ cái nào:
 *
 * 1. `aria-hidden` + không có phần tử nào focus được. Đây là hình thuần trang trí,
 *    không mang thông tin gì; để trình đọc màn hình đọc nó là bắt người mù nghe
 *    mô tả một cái cây trước khi tới được nội dung. `infra/a11y-check.mjs` đếm số
 *    điểm tab của mỗi trang — thêm một điểm tab vào đây là sai.
 *
 * 2. `pointer-events-none`. Nó phủ toàn khung nhìn; thiếu dòng này là nó nuốt mọi
 *    cú bấm của cả trang.
 *
 * 3. `overflow-hidden` trên khung ngoài. Không có nó, một cái cây thò ra ngoài mép
 *    là trang phải vuốt ngang — đúng loại lỗi mà bộ kiểm tràn ngang mới thêm hôm
 *    nay tồn tại để bắt.
 *
 * 4. `hidden xl:block` — chỉ hiện từ 1280px. Dưới mức đó KHÔNG có lề nào để vẽ:
 *    cây sẽ nằm đè lên nội dung. Đây là trang trí cho chỗ thừa, không phải một
 *    thành phần của giao diện.
 *
 * Màu lấy từ nhóm token `--color-decor-*`, tách hẳn khỏi bảng màu giao diện và tự
 * dịu lại ở giao diện tối.
 */
export function SiteDecor() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden xl:block"
    >
      {/* Mặt trời, góc trên bên phải. */}
      <svg
        viewBox="0 0 100 100"
        className="absolute right-6 top-28 h-24 w-24"
        fill="none"
        focusable="false"
      >
        <circle cx="50" cy="50" r="22" fill="var(--color-decor-troi)" />
        <g
          stroke="var(--color-decor-troi)"
          strokeWidth="7"
          strokeLinecap="round"
          opacity="0.85"
        >
          <path d="M50 6v12M50 82v12M6 50h12M82 50h12" />
          <path d="M19 19l8.5 8.5M72.5 72.5L81 81M81 19l-8.5 8.5M27.5 72.5L19 81" />
        </g>
      </svg>

      {/* Cây to, lề trái. Đứng chạm đáy khung nhìn nên cuộn trang thì nó ở nguyên. */}
      <svg
        viewBox="0 0 140 230"
        className="absolute bottom-0 left-3 h-60 w-36"
        fill="none"
        focusable="false"
      >
        <rect x="63" y="128" width="16" height="102" rx="8" fill="var(--color-decor-than)" />
        {/* Một cành, để cái cây không thành cây kẹo mút. */}
        <path
          d="M71 158c-14 0-24-8-30-18"
          stroke="var(--color-decor-than)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <circle cx="46" cy="128" r="15" fill="var(--color-decor-la-dam)" />
        <circle cx="96" cy="118" r="26" fill="var(--color-decor-la-dam)" />
        <circle cx="48" cy="106" r="30" fill="var(--color-decor-la)" />
        <circle cx="72" cy="72" r="38" fill="var(--color-decor-la)" />
        {/* Bụi cỏ dưới gốc. */}
        <circle cx="24" cy="212" r="18" fill="var(--color-decor-co)" />
        <circle cx="110" cy="218" r="14" fill="var(--color-decor-co)" />
      </svg>

      {/* Cây nhỏ hơn, lề phải — lệch cỡ và lệch dáng để hai bên không thành ảnh soi gương. */}
      <svg
        viewBox="0 0 120 190"
        className="absolute bottom-0 right-4 h-48 w-28"
        fill="none"
        focusable="false"
      >
        <rect x="54" y="104" width="13" height="86" rx="6.5" fill="var(--color-decor-than)" />
        <circle cx="84" cy="98" r="20" fill="var(--color-decor-la-dam)" />
        <circle cx="38" cy="92" r="24" fill="var(--color-decor-la)" />
        <circle cx="62" cy="62" r="30" fill="var(--color-decor-la)" />
        <circle cx="96" cy="176" r="15" fill="var(--color-decor-co)" />
        <circle cx="22" cy="182" r="12" fill="var(--color-decor-co)" />
      </svg>
    </div>
  );
}
