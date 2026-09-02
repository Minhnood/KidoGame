'use client';

import { useActionState } from 'react';
import { Button } from '@/components/button';
import { xoaHopThuDevAction, type FormState } from '@/lib/actions';

/**
 * Dọn hộp thư trước khi quay lại từ đầu.
 *
 * Một nhịp, không hai nhịp: thư ở đây đã là thứ mất khi restart server, nên xoá nhầm
 * không mất gì đáng kể. Nút hai nhịp trên `/admin` tồn tại vì ở đó hành động khó đảo
 * và có người thật gánh hậu quả.
 */
export function XoaHopThuButton({ count }: { count: number }) {
  const [state, formAction, pending] = useActionState(xoaHopThuDevAction, null);

  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <Button type="submit" variant="ghost" disabled={pending} data-testid="dev-mail-clear">
        {pending ? 'Đang xoá…' : `Xoá cả ${count} thư`}
      </Button>
      {state && 'error' in state && (
        <span className="text-sm text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
