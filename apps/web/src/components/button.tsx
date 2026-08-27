import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

/**
 * Nút bấm. Mọi biến thể đều cao tối thiểu `--spacing-touch` (48px) vì ngón tay
 * trẻ em kém chính xác hơn người lớn — đừng thu nhỏ để cho "gọn".
 */
const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-bold ' +
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

const sizes: Record<Size, string> = {
  md: 'min-h-touch px-5 text-base',
  lg: 'min-h-14 px-7 text-lg',
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

/** Nút nhưng là link. Dùng khi hành động là điều hướng, không phải submit. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={classesFor(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
