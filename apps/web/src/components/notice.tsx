import type { ReactNode } from 'react';

type Tone = 'warn' | 'error' | 'info';

const tones: Record<Tone, { box: string; icon: string }> = {
  warn: { box: 'bg-warn-bg border-warn-border text-warn-ink', icon: '⚠️' },
  error: { box: 'bg-danger-bg border-danger-border text-danger', icon: '😕' },
  info: { box: 'bg-surface border-border text-ink-soft', icon: 'ℹ️' },
};

/**
 * Hộp thông báo.
 *
 * Icon là phần tử trang trí nên bị ẩn khỏi trình đọc màn hình — nội dung chữ
 * phải tự nó nói đủ nghĩa, không được dựa vào biểu tượng.
 */
export function Notice({
  tone = 'info',
  children,
  role,
}: {
  tone?: Tone;
  children: ReactNode;
  role?: 'alert' | 'status';
}) {
  const t = tones[tone];
  return (
    <div
      role={role}
      className={`my-3 flex gap-2.5 rounded-field border px-3.5 py-3 text-[0.95rem] ${t.box}`}
    >
      <span aria-hidden="true">{t.icon}</span>
      <div>{children}</div>
    </div>
  );
}
