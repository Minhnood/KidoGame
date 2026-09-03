'use client';

import { useActionState } from 'react';
import { Button } from '@/components/button';
import { resendVerificationAction } from '@/lib/actions';

/**
 * Nút gửi lại mail xác minh.
 *
 * Nằm ngay trong hộp cảnh báo "chưa xác minh" chứ không đẩy xuống cuối trang:
 * lúc người dùng đọc được lý do cũng chính là lúc họ sẵn sàng bấm.
 */
export function VerifyEmailButton() {
  const [state, formAction, pending] = useActionState(resendVerificationAction, null);
  const daGui = Boolean(state && 'ok' in state);

  /*
   * Nút KHÔNG bị thay thế sau khi gửi xong, chỉ đổi chữ.
   *
   * Bản cũ trả về riêng một thẻ <p> "Đã gửi …" và nút biến mất hẳn. Nhưng đoạn chữ
   * ngay trên nút nói "Chưa thấy thư, kể cả trong thư rác, thì bấm nút dưới đây để
   * gửi lại" — nên sau một lần bấm, trang chỉ đường tới một cái nút không còn tồn
   * tại. Và đúng người cần bấm lần thứ hai là người thư chưa tới, tức người đang
   * mắc kẹt: họ phải đoán ra là phải tải lại trang.
   *
   * Trần 5 lần một giờ mỗi tài khoản nằm ở `createAuthToken`, nên để nút bấm được
   * mãi không mở ra đường gửi thư loạn.
   */
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button type="submit" variant="ghost" disabled={pending} data-testid="verify-resend">
        {pending ? 'Đang gửi…' : daGui ? 'Gửi lại lần nữa' : 'Gửi link xác minh'}
      </Button>
      {daGui && (
        <span className="text-sm font-semibold" role="status" data-testid="verify-sent">
          Đã gửi. Kiểm tra hòm thư nhé — link có hiệu lực 24 giờ. Nếu bạn bấm gửi nhiều lần thì chỉ
          link trong lá thư mới nhất còn dùng được.
        </span>
      )}
      {state && 'error' in state && (
        <span className="text-sm text-danger" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
