'use client';

import { useActionState } from 'react';
import { Button } from '@/components/button';
import {
  adminResolveAllErrorsAction,
  adminSetErrorResolvedAction,
  type FormState,
} from '@/lib/actions';

/**
 * Một nhịp, KHÔNG hai nhịp như các nút trên `/admin`.
 *
 * Nút hai nhịp ở trang kiểm duyệt tồn tại vì gỡ game hay khoá tài khoản của một đứa
 * trẻ là việc khó đảo và có người thật gánh hậu quả. Đánh dấu một lỗi đã xử lý thì
 * đảo lại bằng đúng một cú bấm và không ảnh hưởng tới ai — bắt xác nhận ở đây chỉ
 * làm người dùng học cách bấm qua hộp xác nhận mà không đọc, rồi mang thói quen đó
 * sang những nút thật sự cần đọc.
 */
export function ResolveErrorButton({ id, resolved }: { id: string; resolved: boolean }) {
  const [state, formAction, pending] = useActionState(adminSetErrorResolvedAction, null);

  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="resolved" value={String(!resolved)} />
      <Button
        type="submit"
        variant="ghost"
        disabled={pending}
        data-testid={resolved ? 'error-reopen' : 'error-resolve'}
      >
        {pending ? 'Đang lưu…' : resolved ? 'Mở lại' : 'Đã xử lý'}
      </Button>
      {state && 'error' in state && (
        <span className="text-sm text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}

export function ResolveAllErrorsButton({ count }: { count: number }) {
  const [state, formAction, pending] = useActionState(adminResolveAllErrorsAction, null);

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-center gap-2">
      <Button type="submit" variant="primary" disabled={pending} data-testid="error-resolve-all">
        {pending ? 'Đang lưu…' : `Đánh dấu cả ${count} nhóm là đã xử lý`}
      </Button>
      {state && 'error' in state && (
        <span className="text-sm text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
