'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './button';
import { Notice } from './notice';
import type { FormState } from '@/lib/actions';

/*
 * React 19 RESET form sau khi một action chạy xong — kể cả khi action trả về lỗi.
 * Không làm gì thì người dùng bị báo "điền sai" trên một cái form trắng trơn và
 * phải gõ lại từ đầu, đúng vào lúc họ đang bối rối nhất. Với trang đăng nhập của
 * bé thì đây là chỗ trẻ bỏ cuộc: gõ sai mật khẩu một lần là mất luôn cả tên
 * đăng nhập vừa gõ.
 *
 * Cách chữa dưới đây cố ý KHÁC takedown-form, nơi mọi ô là input controlled:
 *
 *  - AuthForm nhận ô nhập qua `children` từ SÁU trang khác nhau. Muốn controlled
 *    thì phải sửa cả sáu và mỗi trang phải tự giữ state cho từng ô — nhiều chỗ để
 *    quên, và trang thêm sau này sẽ lặng lẽ không được bảo vệ.
 *  - Không được bọc `formAction` trong một hàm của mình để chụp FormData lúc
 *    submit. `useActionState` trả về một dispatch mà React mã hoá được vào thuộc
 *    tính `action` của thẻ <form>, nhờ đó form vẫn gửi được khi JS chưa tải xong.
 *    Bọc lại là mất đúng tính chất đó — đáng kể với mạng chậm ở nhà.
 *
 * Nên form tự ghi lại giá trị mới nhất theo từng lần gõ, rồi trả lại vào DOM sau
 * khi React đã reset. Trang gọi không phải biết gì cả.
 */

/**
 * Những loại input KHÔNG trả lại giá trị.
 *
 * `password` là chủ ý, không phải bỏ sót: mật khẩu gõ lại thì trình quản lý mật
 * khẩu điền hộ, còn để lại một mật khẩu sai nằm trong DOM thì chẳng được gì. Với
 * form đổi/đặt mật khẩu, xoá trắng lại đúng là hành vi mong muốn.
 *
 * `file` thì không gán được `value` bằng script. `hidden` do React tự render lại
 * từ props. Checkbox/radio dùng `checked` chứ không phải `value`, và AuthForm
 * hiện không có ô nào loại đó.
 */
const KHONG_TRA_LAI = new Set([
  'password',
  'file',
  'hidden',
  'checkbox',
  'radio',
  'submit',
  'button',
  'reset',
  'image',
]);

type ONhap = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function laOTraLaiDuoc(el: Element): el is ONhap {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.name !== '';
  if (el instanceof HTMLInputElement) return el.name !== '' && !KHONG_TRA_LAI.has(el.type);
  return false;
}

/**
 * Form dùng chung cho đăng ký / đăng nhập / tạo tài khoản con.
 *
 * useActionState giữ được thông báo lỗi từ server action mà không cần state thủ
 * công, và form vẫn submit được khi JS chưa tải xong (progressive enhancement) —
 * đáng kể với mạng chậm ở nhà.
 */
export function AuthForm({
  action,
  submitLabel,
  busyLabel,
  children,
  successMessage,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  busyLabel: string;
  children: ReactNode;
  /** Hiện khi action thành công mà không điều hướng đi đâu. */
  successMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  const formRef = useRef<HTMLFormElement>(null);
  /** Giá trị mới nhất người dùng đã gõ, theo `name`. Ref chứ không phải state:
   *  ghi ở mỗi lần gõ mà render lại theo là phí, và không ai đọc nó khi render. */
  const daGo = useRef(new Map<string, string>());

  /* Sự kiện `input` nổi bọt lên form, nên một handler ở đây bắt được mọi ô, kể cả
   * ô của trang nào đó thêm vào sau này. `<select>` cũng phát `input`. */
  function ghiLai() {
    const form = formRef.current;
    if (!form) return;
    for (const el of form.elements) {
      if (laOTraLaiDuoc(el)) daGo.current.set(el.name, el.value);
    }
  }

  useEffect(() => {
    // Chỉ trả lại khi action BÁO LỖI. Thành công thì reset là đúng: hoặc trang
    // điều hướng đi, hoặc (như tạo tài khoản con) form cần trống cho bé tiếp theo.
    if (!state || !('error' in state)) return;

    const form = formRef.current;
    if (!form) return;

    for (const el of form.elements) {
      if (!laOTraLaiDuoc(el)) continue;
      const cu = daGo.current.get(el.name);
      /* Chỉ điền vào ô ĐANG TRỐNG. Nếu React không reset ô đó, hoặc người dùng đã
       * gõ lại nhanh hơn effect này, thì thứ trên màn hình mới là thứ đúng — đè lên
       * là tự tạo ra một lỗi khó hiểu hơn lỗi đang chữa. */
      if (cu !== undefined && cu !== '' && el.value === '') el.value = cu;
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      data-testid="auth-form"
      action={formAction}
      onInput={ghiLai}
      className="mb-12 max-w-125 rounded-card border border-border bg-surface p-6"
    >
      {children}

      {state && 'error' in state && (
        <Notice tone="error" role="alert">
          {state.error}
        </Notice>
      )}
      {state && 'ok' in state && successMessage && (
        <Notice tone="info" role="status">
          {successMessage}
        </Notice>
      )}

      <div className="mt-7">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? busyLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
