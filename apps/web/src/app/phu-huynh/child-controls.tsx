'use client';

import { useActionState } from 'react';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { TextInput } from '@/components/field';
import {
  resetChildPasswordAction,
  setChildLockedAction,
  setGameHiddenAction,
  type FormState,
} from '@/lib/actions';

/** Nút đổi trạng thái, gói trong form riêng để mỗi nút có state lỗi độc lập. */
function ToggleForm({
  action,
  fields,
  label,
  variant = 'ghost',
  testId,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  label: string;
  variant?: 'primary' | 'ghost' | 'danger';
  /** Để e2e khoanh đúng nút. Nhãn nút đổi theo trạng thái nên không bám vào chữ được. */
  testId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="inline" data-testid={testId}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? 'Đang lưu…' : label}
      </Button>
      {state && 'error' in state && (
        <span className="ml-2 text-sm text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}

export function LockToggle({ childId, isLocked }: { childId: string; isLocked: boolean }) {
  return (
    <ToggleForm
      action={setChildLockedAction}
      fields={{ childId, locked: String(!isLocked) }}
      label={isLocked ? 'Mở khoá tài khoản' : 'Tạm khoá tài khoản'}
      variant={isLocked ? 'primary' : 'ghost'}
    />
  );
}

export function GameVisibilityToggle({ gameId, hidden }: { gameId: string; hidden: boolean }) {
  return (
    <ToggleForm
      action={setGameHiddenAction}
      fields={{ gameId, hidden: String(!hidden) }}
      label={hidden ? 'Hiện lại' : 'Ẩn game'}
      /*
       * `ghost` chứ KHÔNG phải `danger`, và điều này nhất quán chứ không phải nhẹ tay.
       *
       * Ngay bên trên, "Tạm khoá tài khoản" — việc NẶNG hơn hẳn, cắt bé khỏi cả trang —
       * đã là `ghost`. Để việc nhẹ hơn và đảo lại được bằng một cú bấm mang màu đỏ là
       * xếp hạng ngược. Hệ quả nhìn thấy được: mỗi bé có bao nhiêu game thì trang của
       * bố mẹ có bấy nhiêu nút đỏ xếp thành một cột, và một trang toàn màu cảnh báo thì
       * chẳng cảnh báo được gì nữa — lúc có chuyện thật, màu đỏ không còn nghĩa.
       */
      variant={hidden ? 'primary' : 'ghost'}
      testId="game-visibility"
    />
  );
}

export function ResetPasswordForm({ childId }: { childId: string }) {
  const [state, formAction, pending] = useActionState(resetChildPasswordAction, null);

  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="childId" value={childId} />
      <div className="flex flex-wrap items-start gap-2">
        <TextInput
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="Mật khẩu mới cho bé"
          className="max-w-64"
          aria-label="Mật khẩu mới cho bé"
        />
        <Button type="submit" variant="ghost" disabled={pending}>
          {pending ? 'Đang đổi…' : 'Đổi mật khẩu'}
        </Button>
      </div>
      {state && 'error' in state && (
        <Notice tone="error" role="alert">
          {state.error}
        </Notice>
      )}
      {state && 'ok' in state && (
        <Notice tone="info" role="status">
          Đã đổi mật khẩu. Bé sẽ phải đăng nhập lại trên mọi thiết bị.
        </Notice>
      )}
    </form>
  );
}
