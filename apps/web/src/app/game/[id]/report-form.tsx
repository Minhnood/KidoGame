'use client';

import { useActionState } from 'react';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { reportGameAction, type FormState } from '@/lib/actions';
import { REPORT_REASONS } from '@/lib/report-reasons';

/**
 * Nút báo cáo game.
 *
 * Gấp lại trong <details> có chủ đích: đây là trang chơi game của trẻ con, không nên
 * để một nút đỏ to đùng cạnh nút chơi. Nhưng vẫn phải tìm thấy được — nên nó nằm
 * ngay dưới game chứ không giấu dưới chân trang.
 *
 * <details> là phần tử sẵn có của trình duyệt nên đóng/mở được bằng bàn phím và
 * trình đọc màn hình hiểu đúng, không cần tự viết logic.
 */
export function ReportForm({ gameId }: { gameId: string }) {
  const [state, formAction, pending] = useActionState(reportGameAction, null);

  // Báo cáo trùng cũng rơi vào nhánh này — người báo không cần biết là trùng.
  if (state && 'ok' in state) {
    return (
      <div data-testid="report-done">
        <Notice tone="info" role="status">
          Cảm ơn bạn đã báo. Người lớn sẽ xem lại game này.
        </Notice>
      </div>
    );
  }

  return (
    <details className="mt-4" data-testid="report-box">
      <summary className="min-h-touch inline-flex cursor-pointer items-center text-sm font-semibold text-ink-soft">
        Báo cáo game này
      </summary>

      <form action={formAction} data-testid="report-form" className="mt-2">
        <input type="hidden" name="gameId" value={gameId} />

        <fieldset className="rounded-field border border-border p-4">
          <legend className="px-1 text-sm font-semibold">Có chuyện gì với game này?</legend>

          {REPORT_REASONS.map((reason, i) => (
            <label
              key={reason.value}
              className="min-h-touch flex cursor-pointer items-center gap-2.5 text-[0.95rem]"
            >
              <input
                type="radio"
                name="reason"
                value={reason.value}
                required
                defaultChecked={i === 0}
                className="size-5 shrink-0"
              />
              {reason.label}
            </label>
          ))}

          <Button type="submit" variant="danger" disabled={pending} className="mt-3">
            {pending ? 'Đang gửi…' : 'Gửi báo cáo'}
          </Button>
        </fieldset>

        {state && 'error' in state && (
          <Notice tone="error" role="alert">
            {state.error}
          </Notice>
        )}
      </form>
    </details>
  );
}
