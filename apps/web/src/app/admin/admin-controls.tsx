'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/button';
import {
  adminDismissReportsAction,
  adminRemoveGameAction,
  adminRestoreGameAction,
  adminSetChildLockedAction,
  adminXoaGiaDinhAction,
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

/**
 * Xoá cả gia đình. Nút DUY NHẤT trong khu quản trị không dùng `ConfirmAction`.
 *
 * Hai nhịp là đủ cho mọi thao tác khác vì tất cả đều đảo lại được: gỡ hẳn còn bảy
 * ngày và một nút "Cho hiện lại" nằm ngay đó, khoá tài khoản thì mở lại được. Cái
 * này thì không — hàng DB đi trong một transaction, và nút này lại nằm trong một
 * DANH SÁCH, nơi người trực bấm nhanh qua nhiều dòng giống hệt nhau. Nhịp thứ hai
 * rơi đúng chỗ ngón tay đang sẵn đà.
 *
 * Nên chốt không phải là bấm thêm lần nữa mà là GÕ LẠI EMAIL: nó bắt mắt rời cái nút
 * và đọc lại chính dòng đang thao tác. Cùng chuỗi ấy được kiểm lại lần thứ hai trong
 * server action, vì một nút chỉ chặn được người bấm nút.
 */
export function DeleteFamilyButton({
  email,
  soBe,
  soGame,
}: {
  email: string;
  soBe: number;
  soGame: number;
}) {
  const [state, formAction, pending] = useActionState(adminXoaGiaDinhAction, null);
  const [armed, setArmed] = useState(false);
  const [goLai, setGoLai] = useState('');

  if (!armed) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setArmed(true)}
        data-testid="admin-xoa-gia-dinh"
      >
        Xoá tài khoản gia đình
      </Button>
    );
  }

  const khop = goLai.trim().toLowerCase() === email.toLowerCase();

  /* `max-w-xl` ở form: ô nhập một địa chỉ email không cần cả bề rộng thẻ. Đo ở 1300px
     thì không giới hạn cho ra một ô 1150px, và một ô dài gấp năm lần chuỗi phải gõ vào
     nó thì đọc như một ô tìm kiếm — thứ gõ vào rồi xem kết quả, đúng ngược với việc nó
     đang làm. Ở 390px thì `max-w` không có tác dụng nào, đã đo. */
  return (
    <form
      action={formAction}
      className="mt-3 max-w-xl space-y-2 rounded-field border border-danger bg-bg p-3.5"
      data-testid="admin-xoa-gia-dinh-form"
    >
      <input type="hidden" name="email" value={email} />
      {/* Nói bằng SỐ chứ không nói "toàn bộ dữ liệu": người trực cần đối chiếu con số
          này với lá thư yêu cầu trước khi gõ email, và "toàn bộ" thì không đối chiếu
          được với cái gì. */}
      <p className="text-sm font-semibold text-danger">
        {soBe + soGame === 0
          ? 'Xoá vĩnh viễn tài khoản này. Chưa có bé hay game nào. Không đảo lại được.'
          : `Xoá vĩnh viễn ${soBe} tài khoản của bé và ${soGame} game. Không đảo lại được.`}
      </p>
      <p className="text-sm text-ink-soft">
        Hồ sơ yêu cầu gỡ bản quyền thì ở lại, không kèm tài khoản nữa. File trên đĩa do{' '}
        <code>storage:prune</code> dọn sau.
      </p>
      <label className="block text-sm">
        Gõ lại <strong>{email}</strong> để xác nhận:
        <input
          name="xacNhanEmail"
          value={goLai}
          onChange={(e) => setGoLai(e.target.value)}
          autoComplete="off"
          className="mt-1 block w-full min-h-touch rounded-field border border-border bg-surface px-3 text-ink"
          data-testid="admin-xoa-gia-dinh-email"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="danger"
          disabled={pending || !khop}
          data-testid="admin-xoa-gia-dinh-confirm"
        >
          {pending ? 'Đang xoá…' : 'Xoá vĩnh viễn'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setArmed(false);
            setGoLai('');
          }}
        >
          Thôi
        </Button>
        {state && 'error' in state && (
          <span className="text-sm text-danger" role="alert">
            {state.error}
          </span>
        )}
      </div>
    </form>
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
