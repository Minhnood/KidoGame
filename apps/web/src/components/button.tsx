import type { ComponentProps, ReactNode } from 'react';
import { LinkCho } from './link-cho';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'md' | 'lg' | 'lg-tu-sm';

/**
 * Nút bấm. Mọi biến thể đều cao tối thiểu `--spacing-touch` (48px) vì ngón tay
 * trẻ em kém chính xác hơn người lớn — đừng thu nhỏ để cho "gọn".
 */
/*
 * `whitespace-nowrap`: nhãn nút KHÔNG được ngắt dòng.
 *
 * Nút nằm trong thanh điều hướng chật trên điện thoại, và khi ngắt dòng thì
 * "Bé đăng nhập" thành hai dòng, đẩy cả thanh cao lên gần gấp rưỡi. Nút thà chật
 * còn hơn thành một khối chữ hai dòng — chữ trên nút là một mệnh lệnh ngắn, đọc
 * theo hàng ngang.
 */
const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold ' +
  'no-underline cursor-pointer transition-colors ' +
  'disabled:opacity-55 disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-chrome hover:bg-accent-dark border-0',
  ghost: 'bg-transparent text-ink border border-border hover:bg-surface',
  /*
   * `hover:text-surface` chứ không phải `hover:text-white`: khi hover, nền thành
   * `danger` — đỏ ĐẬM ở giao diện sáng nhưng đỏ NHẠT ở giao diện tối. Chữ trắng cố
   * định sẽ chìm hẳn trên nền đỏ nhạt. `surface` là màu đối của chữ (trắng ở giao
   * diện sáng, tối ở giao diện tối) nên nó tự lật đúng chiều.
   */
  danger:
    'bg-danger-bg text-danger border border-danger-border hover:bg-danger hover:text-surface',
};

/*
 * Padding ngang hẹp hơn trên máy nhỏ, rộng ra từ `sm`.
 *
 * Chiều CAO không đổi (vẫn `min-h-touch` = 48px) — đó mới là chiều quyết định ngón
 * tay trẻ có bấm trúng không. Bề ngang thì trên màn 360px phải nhường, không thì
 * thanh điều hướng đẩy cả trang tràn ngang; đã đo và thấy tràn thật 11px.
 */
const sizes: Record<Size, string> = {
  md: 'min-h-touch px-4 text-base sm:px-5',
  lg: 'min-h-14 px-6 text-lg sm:px-7',
  /*
   * `md` trên điện thoại, `lg` từ `sm` — cho nút MỜI CHÍNH ở đầu trang chủ.
   *
   * Hai nút `lg` ở 390px không đứng chung một hàng được, xếp chồng thành 120px, đẩy
   * game đầu tiên xuống dưới màn hình đầu. Ở cỡ `md` cùng `px-3` thì hai nút vừa một
   * hàng tới tận 360px. Chiều cao vẫn 48px — thứ ngón tay cần không bị đụng tới.
   */
  'lg-tu-sm': 'min-h-touch px-3 text-base sm:min-h-14 sm:px-7 sm:text-lg',
};

function classesFor(variant: Variant, size: Size, extra?: string) {
  return [base, variants[variant], sizes[size], extra].filter(Boolean).join(' ');
}

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: CommonProps & ComponentProps<'button'>) {
  return (
    <button className={classesFor(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

/**
 * Nút nhưng là thẻ <a> thường. Dùng cho link tải file hoặc link ra ngoài —
 * next/link là để điều hướng trong app, không hợp với `download`.
 */
export function ButtonAnchor({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: CommonProps & ComponentProps<'a'>) {
  return (
    <a className={classesFor(variant, size, className)} {...rest}>
      {children}
    </a>
  );
}

/**
 * Nút nhưng là link. Dùng khi hành động là điều hướng, không phải submit.
 *
 * Mang sẵn vòng xoay lúc trang sau đang dựng (`LinkCho`). `nen="toi"` khi nút nằm trên
 * thanh tối mà bản thân nút trong suốt — lý do ở `NutDangCho`.
 */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  children,
  nen,
  ...rest
}: CommonProps & ComponentProps<typeof LinkCho>) {
  return (
    <LinkCho
      className={classesFor(variant, size, className)}
      nen={nen ?? (variant === 'primary' ? 'cam' : 'sang')}
      {...rest}
    >
      {children}
    </LinkCho>
  );
}
