'use client';

import { useLinkStatus } from 'next/link';

/**
 * Vòng xoay phủ lên chính cái NÚT vừa bấm, trong lúc trang sau đang được dựng.
 *
 * ═══ VÌ SAO CẦN, KHI ĐÃ CÓ `loading.tsx` ═══
 *
 * Đo trên máy dev ngày 23/9, bấm rồi xem DOM có đổi gì trong 400ms đầu không:
 *
 *     bấm trang 2 (phân trang) : 2,9 GIÂY · y nguyên suốt 400ms đầu — không gì cả
 *     bấm nhãn lọc             : 1,2 giây · chỉ đổi ở 200ms, và là style :focus
 *     bấm thẻ game             : 1,5 giây · đổi ngay 80ms — `TheDangMo` đang làm việc
 *
 * Ba giây không một dấu hiệu nào là cái mà fen mô tả đúng là "bị đơ": người dùng không
 * phân biệt được máy đang nghĩ với máy đã chết, nên thứ họ làm là bấm lại — mà bấm lại
 * giữa chừng thì hoặc không có tác dụng gì, hoặc nhảy sang trang khác.
 *
 * `loading.tsx` không cứu được chỗ này. Nó chỉ hiện SAU khi router đã chuyển xong sang
 * route mới, mà phần lâu nhất lại nằm TRƯỚC mốc đó. Với phân trang thì càng rõ: ta ở lại
 * đúng route `(trang-chu)`, chỉ đổi query, nên `loading.tsx` của route đó không hề chạy.
 *
 * ═══ PHẢI NẰM TRONG `<Link>` ═══
 *
 * `useLinkStatus` đọc trạng thái của chính cái `<Link>` bọc ngoài nó (Next ≥ 15.3). Đặt
 * ở chỗ khác thì nó KHÔNG lỗi gì cả, chỉ là `pending` mãi mãi `false` — hỏng im lặng,
 * y như cái bẫy đã ghi trong `the-dang-mo.tsx`. Vì vậy `e2e-dang-tai` bấm thật rồi soi
 * DOM, chứ không kiểm bằng việc component có tồn tại hay không.
 *
 * ═══ KHÔNG ĐƯỢC LÀM XÊ DỊCH CÁI NÚT ═══
 *
 * Vòng xoay là `absolute` phủ lên, và chữ chỉ MỜ ĐI chứ không bị gỡ khỏi DOM. Chèn thêm
 * một phần tử vào trong viên thuốc là viên thuốc rộng ra, hàng lọc dài ra, và những
 * viên bên cạnh nhảy chỗ — ngay lúc ngón tay trẻ còn đang ở đó, tức mời bấm nhầm. Nút
 * bọc ngoài phải có `relative`.
 *
 * Chữ giữ nguyên chỗ còn vì một lẽ nữa: bé phải đọc được mình vừa chọn cái gì trong
 * suốt lúc chờ, không thì ba giây ấy là ba giây nhìn một nút trống không biết của ai.
 */
/*
 * `nen="toi"` cho link nằm trên thanh tối (`chrome`): thanh điều hướng, logo, tab quản
 * trị. Chữ ở đó là `chrome-ink` gần trắng, nên vòng xoay (ăn `currentColor`) cũng gần
 * trắng — mà lớp phủ mặc định `surface` ở giao diện sáng lại là trắng. Trắng trên trắng:
 * nút phủ kín một viên thuốc trống, vòng xoay có mặt trong DOM mà mắt không thấy gì.
 *
 * `nen="cam"` cho nút cam (`ButtonLink` biến thể primary tự chọn). Chữ trên nút cam là
 * `chrome` — tối ở CẢ HAI giao diện — còn `surface` thì tối ở giao diện tối: vòng xoay
 * tối trên lớp phủ tối.
 */
export type NenCho = 'sang' | 'toi' | 'cam';
const LOP_PHU: Record<NenCho, string> = {
  sang: 'bg-surface/70',
  toi: 'bg-chrome/70',
  cam: 'bg-accent/70',
};

export function NutDangCho({ nen = 'sang' }: { nen?: NenCho }) {
  const { pending } = useLinkStatus();

  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="nut-dang-cho"
      className={`pointer-events-none absolute inset-0 grid place-items-center rounded-[inherit] ${LOP_PHU[nen]}`}
    >
      {/*
        Vòng xoay vẽ bằng viền chứ không phải ảnh hay emoji: nó nhận màu từ `currentColor`
        nên tự đúng tông trên cả viên thuốc trắng lẫn viên thuốc cam đang chọn, và ở giao
        diện tối cũng vậy — không phải khai màu lần nữa ở đâu.

        `kg-xoay` chứ không phải `animate-spin` của Tailwind, và lý do nằm ở khối
        `prefers-reduced-motion` cuối `globals.css`: ở đó `kg-xoay` được MIỄN TRỪ khỏi
        danh sách tắt, cố ý — nó chỉ chậm lại còn 2 giây một vòng thay vì bị tắt hẳn,
        vì với người xin ít chuyển động thì vòng xoay là thứ duy nhất phân biệt "đang
        tải" với "đã chết". Dùng `animate-spin` là rơi ra ngoài cái miễn trừ ấy: hoặc
        quay tít không ai hãm, hoặc bị khối chung tắt sạch tuỳ Tailwind sinh ra gì.
      */}
      <span className="kg-xoay block size-4 rounded-full border-2 border-current border-t-transparent opacity-70" />
    </span>
  );
}
