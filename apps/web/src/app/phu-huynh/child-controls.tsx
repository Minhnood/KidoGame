'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { TextInput } from '@/components/field';
import {
  parentRemoveGameAction,
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

/**
 * Xoá hẳn một game — đường DUY NHẤT thu hồi được nội dung khỏi mạng.
 *
 * Nút "Ẩn game" ngay cạnh chỉ rút game khỏi trang: file HTML và `.sb3` vẫn được player
 * origin phục vụ theo hash cho bất cứ ai còn URL, và với game đang ẩn thì là vĩnh viễn.
 * Nên hai nút này KHÔNG phải hai mức của cùng một việc, và câu chữ phải nói ra điều đó
 * trước khi bấm — người bấm ẩn vì game để lộ gì đó về con mình đang tưởng mình vừa thu
 * hồi nội dung.
 *
 * Hai nhịp, không đòi gõ lại tên như nút xoá cả gia đình: đây là MỘT game, thư gửi ngay
 * sau đó kèm link tải bản gốc, và còn bảy ngày trước khi file mất. Bắt gõ lại tên game
 * cho một việc còn cửa sửa là làm nặng sai chỗ — chỗ nặng thật là câu giải thích.
 *
 * Câu ở đây nói GỌN hơn `/dieu-khoan`, và cố ý không "sửa cho khớp": trang điều khoản
 * phải mang mệnh đề "nếu không còn game nào khác dùng đúng file đó" vì nó mô tả cơ chế
 * (storage địa chỉ hoá theo nội dung, hai game từ cùng một .sb3 chia nhau một file).
 * Hộp xác nhận thì cảnh báo, và nó lệch về phía MẠNH hơn thực tế — hướng đúng để lệch.
 * Việc phụ huynh cần làm cũng không đổi theo mệnh đề đó: tải bản gốc về trước ngày ấy.
 */
/*
 * `soNgayGiu` là PROP, không import từ `lib/moderation`.
 *
 * File này là `'use client'`, và `NGAY_GIU_GAME_DA_GO` sống cùng module với `sendMail`
 * — import nó ở đây kéo cả nodemailer vào client bundle, và Next đổ ngay lúc build
 * trang: `Module not found: Can't resolve 'fs'`, phát ra ở `/dieu-khoan` chứ không ở
 * trang này, tức triệu chứng chỉ vào một file không liên quan. Đã trả giá để biết.
 *
 * Kể cả bundle được thì vẫn sai: hằng số ấy đọc `process.env.REMOVED_KEEP_DAYS`, thứ
 * không tồn tại ở trình duyệt — con số hiện ra sẽ là mặc định 7 bất kể cấu hình thật.
 */
export function DeleteGameButton({
  gameId,
  title,
  soNgayGiu,
}: {
  gameId: string;
  title: string;
  soNgayGiu: number;
}) {
  const [state, formAction, pending] = useActionState(parentRemoveGameAction, null);
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setArmed(true)}
        data-testid="game-delete"
      >
        Xoá hẳn
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-2 w-full rounded-field border border-danger bg-bg p-3"
      data-testid="game-delete-form"
    >
      <input type="hidden" name="gameId" value={gameId} />
      <p className="text-sm font-semibold text-danger">
        Xoá hẳn “{title}”? Game biến khỏi trang ngay, và file gốc bị xoá sau {soNgayGiu} ngày.
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        Chúng tôi gửi bạn một email kèm link tải bản <code>.sb3</code> của bé để lấy trước
        ngày đó. Bạn <strong>không tự bật lại được</strong>.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="danger" disabled={pending} data-testid="game-delete-confirm">
          {pending ? 'Đang xoá…' : 'Chắc chắn xoá hẳn'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setArmed(false)}>
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
