'use client';

import { useActionState } from 'react';
import { Button } from '@/components/button';
import { resendVerificationAction } from '@/lib/actions';

/**
 * Nút gửi lại mail xác minh.
 *
 * Nằm ngay trong hộp cảnh báo "chưa xác minh" chứ không đẩy xuống cuối trang:
 * lúc người dùng đọc được lý do cũng chính là lúc họ sẵn sàng bấm.
 */
export function VerifyEmailButton() {
  const [state, formAction, pending] = useActionState(resendVerificationAction, null);

  if (state && 'ok' in state) {
    return (
      <p className="mt-2 font-semibold" role="status" data-testid="verify-sent">
        Đã gửi. Kiểm tra hòm thư nhé — link có hiệu lực 24 giờ.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-2">
      <Button type="submit" variant="ghost" disabled={pending} data-testid="verify-resend">
        {pending ? 'Đang gửi…' : 'Gửi link xác minh'}
      </Button>
      {state && 'error' in state && (
        <span className="ml-2 text-sm text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
