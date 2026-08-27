'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/button';
import { TextArea } from '@/components/field';
import { adminResolveTakedownAction } from '@/lib/actions';

/**
 * Phán xử một yêu cầu gỡ bản quyền.
 *
 * Không dùng `ConfirmAction` như các nút admin khác vì ở đây có một ô nhập: lời nhắn
 * này được GỬI THẲNG vào email cho người khiếu nại khi yêu cầu bị bác bỏ, nên nó phải
 * gõ được trước khi bấm, không phải một chuỗi viết cứng trong code.
 *
 * Vẫn giữ nhịp bấm-hai-lần của các nút admin khác: cả hai lựa chọn ở đây đều không
 * hoàn tác được bằng một nút nào trên giao diện.
 */
export function TakedownControls({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(adminResolveTakedownAction, null);
  const [armed, setArmed] = useState<'accept' | 'reject' | null>(null);

  return (
    <div className="mt-4">
      {armed === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="danger"
            onClick={() => setArmed('accept')}
            data-testid="takedown-accept"
          >
            Đúng — gỡ hẳn game
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setArmed('reject')}
            data-testid="takedown-reject"
          >
            Không đủ căn cứ
          </Button>
        </div>
      ) : (
        <form action={formAction} data-testid="takedown-resolve-form">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="accept" value={String(armed === 'accept')} />

          <label
            htmlFor={`note-${requestId}`}
            className="mb-1.5 block text-[0.95rem] font-semibold"
          >
            {armed === 'accept'
              ? 'Ghi chú nội bộ (không gửi cho ai)'
              : 'Lời nhắn gửi cho người khiếu nại'}
          </label>
          <p className="mb-2 text-sm text-ink-soft">
            {armed === 'accept'
              ? 'Game sẽ chuyển sang trạng thái đã gỡ hẳn. Phụ huynh KHÔNG tự bật lại được.'
              : 'Để trống thì họ nhận câu mặc định mời gửi thêm bằng chứng. Game hiện lại nếu chính yêu cầu này là thứ đã ẩn nó.'}
          </p>
          <TextArea id={`note-${requestId}`} name="note" rows={3} className="max-w-150" />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant={armed === 'accept' ? 'danger' : 'primary'}
              disabled={pending}
              data-testid={`takedown-${armed}-confirm`}
            >
              {pending
                ? 'Đang lưu…'
                : armed === 'accept'
                  ? 'Chắc chắn gỡ hẳn'
                  : 'Chắc chắn bác bỏ'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setArmed(null)}>
              Thôi
            </Button>
            {state && 'error' in state && (
              <span className="text-sm text-danger" role="alert">
                {state.error}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
