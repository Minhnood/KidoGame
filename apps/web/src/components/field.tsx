import type { ComponentProps, ReactNode } from 'react';

const control =
  'w-full rounded-field border border-border bg-surface px-3.5 py-3 ' +
  'text-base text-ink placeholder:text-ink-faint ' +
  'min-h-touch';

interface FieldProps {
  id: string;
  label: string;
  /** Gợi ý đặt dưới nhãn. Viết cho trẻ đọc: ngắn, cụ thể, không thuật ngữ. */
  hint?: ReactNode;
  children: ReactNode;
}

/**
 * Bọc nhãn + gợi ý quanh một control.
 *
 * Nhãn luôn hiện, không dùng placeholder thay nhãn: trẻ gõ vào là placeholder
 * biến mất, và các em hay quên ô đó hỏi gì.
 */
export function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div className="mt-5 first:mt-0">
      <label htmlFor={id} className="mb-1.5 block text-[0.95rem] font-semibold">
        {label}
      </label>
      {hint && <p className="mb-2 text-sm text-ink-soft">{hint}</p>}
      {children}
    </div>
  );
}

export function TextInput({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={[control, className].filter(Boolean).join(' ')} {...rest} />;
}

export function TextArea({ className, ...rest }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={[control, 'min-h-24 resize-y', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
