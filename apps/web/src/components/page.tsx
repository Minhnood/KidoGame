import type { ReactNode } from 'react';

/** Giới hạn bề rộng dùng chung cho header và nội dung, để hai bên thẳng lề nhau. */
export function Wrap({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={['mx-auto w-full max-w-5xl px-5', className].filter(Boolean).join(' ')}>
      {children}
    </div>
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
