'use client';

import { useActionState } from 'react';
import { Button } from '@/components/button';
import {
  adminDatBaoLoiDaXuLyAction,
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

/**
 * Đánh dấu một báo lỗi CỦA NGƯỜI DÙNG đã xử lý. Một nhịp, cùng lý do với nút trên.
 *
 * Nhãn khác nút của lỗi tự động, cố ý: ở đó "đã xử lý" nghĩa là đã sửa hoặc đã bỏ
 * qua, còn ở đây có một người đang chờ, nên câu đúng là "đã trả lời". Một hàng đợi mà
 * hai loại việc dùng chung một từ thì người trực không phân biệt được mình vừa làm gì.
 */
export function ResolveBugReportButton({ id, resolved }: { id: string; resolved: boolean }) {
  const [state, formAction, pending] = useActionState(adminDatBaoLoiDaXuLyAction, null);

  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="daXuLy" value={String(!resolved)} />
      <Button
        type="submit"
        variant="ghost"
        disabled={pending}
        data-testid={resolved ? 'bug-reopen' : 'bug-resolve'}
      >
        {pending ? 'Đang lưu…' : resolved ? 'Mở lại' : 'Đã trả lời'}
      </Button>
      {state && 'error' in state && (
        <span className="text-sm text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
