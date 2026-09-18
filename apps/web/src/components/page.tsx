import type { ReactNode } from 'react';

/** Giới hạn bề rộng dùng chung cho header và nội dung, để hai bên thẳng lề nhau. */
export function Wrap({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={['mx-auto w-full max-w-5xl px-5', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

/**
 * Cột hẹp canh giữa, cho những trang chỉ có MỘT cái form.
 *
 * Không có nó thì tiêu đề và thẻ form đứng nép sát mép trái của khung 1024px,
 * bỏ trống nguyên nửa phải màn hình — trang trông như bị bỏ dở chứ không phải
 * được sắp. Canh giữa CẢ tiêu đề lẫn form, không chỉ riêng form: canh mỗi form
 * thì nó lệch khỏi tiêu đề, và hai thứ lệch nhau còn khó nhìn hơn lệch cả cụm.
 *
 * `rong` chỉ có hai mức, cố ý: form đăng nhập (500px) và form đăng game (560px).
 * Thêm mức thứ ba là mở đường cho mỗi trang một bề rộng khác nhau.
 */
export function FormColumn({
  rong = 'vua',
  children,
}: {
  rong?: 'vua' | 'to';
  children: ReactNode;
}) {
  /*
   * Khai bề rộng cột cho tranh trang trí hai bên (xem `--kg-cot` ở `site-decor`): cột
   * form + 48px hở mỗi bên. Không khai thì cành bám theo khung 1024px và dừng cách thẻ
   * form 262px ở 1280px, để hở một mảng tối giữa tranh và nội dung.
   *
   * Thẻ <style> đặt ở đây chứ không phải ở từng trang: bảy trang dùng `FormColumn`, khai
   * tay ở từng trang là bảy chỗ để quên, và trang thêm sau sẽ lặng lẽ không có.
   */
  const cot = rong === 'to' ? '41rem' : '37.25rem';
  return (
    <>
      <style>{`:root{--kg-cot:${cot}}`}</style>
      <div className={`mx-auto w-full ${rong === 'to' ? 'max-w-140' : 'max-w-125'}`}>{children}</div>
    </>
  );
}

/**
 * Nét gạch tay dưới tiêu đề trang.
 *
 * Hai nét, không phải một, và nét thứ hai ngắn hơn lệch sang phải: một nét đơn kẻ
 * thẳng thì thành cái gạch chân của trình xử lý văn bản. Hai nét lệch nhau là cách
 * người ta gạch dưới một chữ bằng bút thật — nhấc bút rồi gạch thêm một lần.
 *
 * `w-16` chốt cứng, KHÔNG chạy theo bề rộng chữ. Gạch hết chiều dài tiêu đề thì nó
 * thành đường kẻ ngăn trang, mà tiêu đề dài ngắn khác nhau (từ "Đăng ký" tới "Yêu
 * cầu gỡ bản quyền") sẽ cho ra những nét dài ngắn hẳn khác nhau — nhìn ra là do máy
 * kéo chứ không phải do tay vẽ. Một nét ngắn cố định thì đọc ra là dấu nhấn.
 *
 * Màu `accent` chứ không phải `accent-text`: đây là hình trang trí, không có chữ nào
 * nằm trên nó, nên nó không phải qua ngưỡng tương phản của chữ.
 */
function GachTieuDe({ canhGiua = false }: { canhGiua?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 10"
      aria-hidden="true"
      focusable="false"
      /* Bề rộng chốt cứng nên `text-center` của thẻ cha không chạm tới nó — phải
         `mx-auto`. Đặt ở đây thay vì bọc thêm một <div>, để tám trang còn lại không
         phải cõng một thẻ rỗng chỉ vì một trang cần canh giữa. */
      className={`mt-1.5 h-2.5 w-16 text-accent ${canhGiua ? 'mx-auto' : ''}`}
      fill="none"
    >
      <path
        d="M1 6C14 3 34 2.5 62 4"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M24 9C34 7.5 44 7 56 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

/**
 * `canhGiua` chỉ dành cho trang KHÔNG có nội dung trải rộng bên dưới.
 *
 * Mọi trang của site căn lề trái, và phải giữ như vậy: tiêu đề căn giữa trên một
 * trang mà bên dưới là danh sách hay bảng thì tiêu đề không còn thẳng lề với thứ nó
 * đang gọi tên, và mắt phải nhảy hai lần cho một cụm. Bật cờ này chỉ khi cả cột nội
 * dung bên dưới cũng hẹp và cũng canh giữa — hiện tại là `/dev/thu`.
 */
export function PageTitle({
  title,
  lead,
  canhGiua = false,
}: {
  title: string;
  lead?: ReactNode;
  canhGiua?: boolean;
}) {
  return (
    <div className={`mb-5 mt-7 ${canhGiua ? 'text-center' : ''}`}>
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <GachTieuDe canhGiua={canhGiua} />
      {lead && (
        <p
          className={`mt-2 text-ink-soft ${canhGiua ? 'mx-auto max-w-160 text-lg' : ''}`}
          data-testid="page-lead"
        >
          {lead}
        </p>
      )}
    </div>
  );
}

/** Trạng thái rỗng. Luôn kèm một lối đi tiếp, đừng để trẻ đứng trước ngõ cụt. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 rounded-card border border-dashed border-border bg-surface px-5 py-11 text-center text-ink-soft">
      {children}
    </div>
  );
}
