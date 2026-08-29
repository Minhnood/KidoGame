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
  return (
    <div className={`mx-auto w-full ${rong === 'to' ? 'max-w-140' : 'max-w-125'}`}>{children}</div>
  );
}

export function PageTitle({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <div className="mb-5 mt-7">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      {lead && (
        <p className="mt-1 text-ink-soft" data-testid="page-lead">
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
