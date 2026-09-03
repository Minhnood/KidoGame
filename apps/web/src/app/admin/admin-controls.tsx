'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/button';
import {
  adminDismissReportsAction,
  adminRemoveGameAction,
  adminRestoreGameAction,
  adminSetChildLockedAction,
  type FormState,
} from '@/lib/actions';

/**
 * Nút hai nhịp: bấm lần đầu hiện câu hỏi, bấm lần hai mới thật sự chạy.
 *
 * Không dùng `window.confirm`: hộp thoại đó không tạo kiểu được, và trong iframe
 * hay chế độ tự động hoá kiểm thử thì trình duyệt có thể chặn thẳng.
 */
function ConfirmAction({
  action,
  fields,
  label,
  confirmLabel,
  variant,
  testId,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  label: string;
  confirmLabel: string;
  variant: 'primary' | 'ghost' | 'danger';
  testId: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button type="button" variant={variant} onClick={() => setArmed(true)} data-testid={testId}>
        {label}
      </Button>
    );
  }

  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={variant} disabled={pending} data-testid={`${testId}-confirm`}>
        {pending ? 'Đang lưu…' : confirmLabel}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setArmed(false)}>
        Thôi
      </Button>
      {state && 'error' in state && (
        <span className="text-sm text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}

export function RemoveGameButton({ gameId }: { gameId: string }) {
  return (
    <ConfirmAction
      action={adminRemoveGameAction}
      fields={{ gameId }}
      label="Gỡ hẳn"
      confirmLabel="Chắc chắn gỡ hẳn"
      variant="danger"
      testId="admin-remove"
    />
  );
}

export function RestoreGameButton({ gameId }: { gameId: string }) {
  return (
    <ConfirmAction
      action={adminRestoreGameAction}
      fields={{ gameId }}
      label="Cho hiện lại"
      confirmLabel="Chắc chắn cho hiện lại"
      variant="primary"
      testId="admin-restore"
    />
  );
}

/** Dùng cho game VẪN ĐANG HIỆN nhưng dính báo cáo mà admin thấy là sai. */
export function DismissReportsButton({ gameId }: { gameId: string }) {
  return (
    <ConfirmAction
      action={adminDismissReportsAction}
      fields={{ gameId }}
      label="Bỏ qua báo cáo"
      confirmLabel="Chắc chắn bỏ qua"
      variant="ghost"
      testId="admin-dismiss"
    />
  );
}

export function ChildLockButton({ childId, isLocked }: { childId: string; isLocked: boolean }) {
  return (
    <ConfirmAction
      action={adminSetChildLockedAction}
      fields={{ childId, locked: String(!isLocked) }}
      label={isLocked ? 'Mở khoá tài khoản bé' : 'Khoá tài khoản bé'}
      confirmLabel={isLocked ? 'Chắc chắn mở khoá' : 'Chắc chắn khoá'}
      // Ghost chứ không primary: mỗi dòng chỉ nên có MỘT nút cam nổi bật, để mắt
      // biết đâu là hành động chính. Hai nút cam cạnh nhau thì chẳng cái nào nổi.
      variant={isLocked ? 'ghost' : 'danger'}
      testId="admin-child-lock"
    />
  );
}
