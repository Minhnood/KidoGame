'use client';

import { useLinkStatus } from 'next/link';

/**
 * Vòng xoay phủ lên thẻ game mà bé VỪA BẤM.
 *
 * ═══ VÌ SAO CẦN CẢ CÁI NÀY KHI ĐÃ CÓ `loading.tsx` ═══
 *
 * Hai thứ trả lời hai câu hỏi khác nhau, và chỉ có một cái trả lời được câu đầu:
 *
 *     "máy có nghe thấy cú chạm của mình không?"   -> cái này, ngay lập tức
 *     "trang sắp tới trông thế nào?"               -> `loading.tsx`
 *
 * `loading.tsx` chỉ hiện sau khi router chuyển xong sang route mới. Cái này chạy ngay
 * trong khung hình đầu sau cú chạm, không cần một byte nào từ mạng — mà đúng khoảnh
 * khắc đó mới là lúc đứa trẻ đang tự hỏi có phải mình bấm hụt không.
 *
 * ═══ NÓ PHẢI NẰM TRONG `<Link>` ═══
 *
 * `useLinkStatus` đọc trạng thái từ chính cái `<Link>` bọc ngoài nó (Next ≥ 15.3), nên
 * component này vô dụng nếu đặt ở chỗ khác — nó sẽ luôn báo `pending: false` mà không
 * lỗi gì cả. Đó là kiểu hỏng im lặng, nên `e2e-dang-tai` bấm thật rồi soi DOM chứ
 * không kiểm bằng việc thẻ có tồn tại hay không.
 *
 * ═══ PHỦ LÊN ẢNH, KHÔNG THAY ẢNH ═══
 *
 * Ảnh game vẫn nhìn thấy dưới lớp phủ. Thay hẳn ảnh bằng một ô xám là lấy mất thứ duy
 * nhất cho bé biết nó đang mở đúng game mình muốn — và nếu bé bấm nhầm thẻ thì đây là
 * khoảnh khắc duy nhất nó còn kịp nhận ra.
 */
export function TheDangMo() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      data-testid="the-dang-mo"
      aria-hidden="true"
      /*
       * `bg-chrome/60`: đủ tối để vòng xoay trắng nổi lên trên một tấm ảnh bất kỳ —
       * ảnh game của các bé phần lớn là nền pastel rất sáng, nên vòng xoay trắng đặt
       * thẳng lên ảnh sẽ vô hình đúng ở đa số thẻ.
       *
       * `rounded-xl` khớp khung ảnh; thiếu nó thì bốn góc lớp phủ nhô ra khỏi ảnh.
       */
      className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-chrome/60"
    >
      {/*
        VÒNG XOAY BỌC QUANH HÌNH TAM GIÁC CHƠI — dùng lại đúng dấu hiệu đã có sẵn trên
        mọi thẻ game, không vẽ ra một biểu tượng "đang tải" thứ hai.

        Mỗi thẻ đều đeo một nút tròn cam mang hình tam giác này ở góc ảnh, và nó mang
        đúng một nghĩa: bấm vào là game chạy. Nên lúc bé vừa bấm, thứ hợp lý nhất để
        hiện lên là chính hình đó, đang được một vòng quay bao lấy — đọc ra là "cái
        vừa bấm đang chạy" chứ không phải một bánh xe lạ mượn từ trang khác.

        MÀU SÁNG, KHÔNG PHẢI CAM, và đó là phép đo chốt chứ không phải ý thích: cam
        thương hiệu trên lớp phủ 60% chỉ đạt 1.92:1, dưới xa ngưỡng 3:1 của WCAG
        1.4.11 cho thành phần không phải chữ. Cam quá gần độ sáng của nền tối. Sáng
        thì 4.14:1. Cách trang này dùng cam tối trên viên thuốc `chrome` ở ngay cái
        thẻ bên dưới cũng đúng là sáng-trên-tối, nên đây vẫn là cùng một ngôn ngữ.
      */}
      <span className="relative grid size-12 place-items-center text-chrome-ink">
        <svg viewBox="0 0 24 24" className="kg-xoay absolute size-12" fill="none">
          {/* Vòng nền mờ + cung sáng: chỉ vẽ mỗi cung thì lúc nó quay qua chỗ ảnh
              sáng, người ta thấy một nét trắng bơi lơ lửng chứ không thấy một vòng
              đang quay. */}
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.4" />
          <path
            d="M22 12a10 10 0 0 0-10-10"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
        {/* Cùng đường vẽ với `TamGiac` trong `game-card.tsx`. Chép hình chứ không
            import: `game-card` là component server, còn đây là 'use client'. */}
        <svg viewBox="0 0 24 24" className="size-5" focusable="false" aria-hidden="true">
          <path
            d="M9 6.8 18.2 12 9 17.2Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </span>
  );
}
