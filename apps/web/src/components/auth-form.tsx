'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './button';
import { Notice } from './notice';
import type { FormState } from '@/lib/actions';

/**
 * Form dùng chung cho đăng ký / đăng nhập / tạo tài khoản con.
 *
 * useActionState giữ được thông báo lỗi từ server action mà không cần state thủ
 * công, và form vẫn submit được khi JS chưa tải xong (progressive enhancement) —
 * đáng kể với mạng chậm ở nhà.
 */
export function AuthForm({
  action,
  submitLabel,
  busyLabel,
  children,
  successMessage,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  busyLabel: string;
  children: ReactNode;
  /** Hiện khi action thành công mà không điều hướng đi đâu. */
  successMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form
      data-testid="auth-form"
      action={formAction}
      className="mb-12 max-w-125 rounded-card border border-border bg-surface p-6"
    >
      {children}

      {state && 'error' in state && (
        <Notice tone="error" role="alert">
          {state.error}
        </Notice>
      )}
      {state && 'ok' in state && successMessage && (
        <Notice tone="info" role="status">
          {successMessage}
        </Notice>
      )}

      <div className="mt-7">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? busyLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
