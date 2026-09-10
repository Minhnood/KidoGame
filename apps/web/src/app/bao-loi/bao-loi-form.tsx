'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/button';
import { Field, TextArea, TextInput } from '@/components/field';
import { GocCo, THE_FORM } from '@/components/card';
import { Notice } from '@/components/notice';
import { guiBaoLoiAction } from '@/lib/actions';

/**
 * Biểu mẫu báo một chỗ hỏng.
 *
 * Người điền đang GẶP LỖI, tức đang ở trạng thái kém kiên nhẫn nhất mà một người dùng
 * có thể ở. Nên form này ngắn nhất trong cả dự án: đúng MỘT ô bắt buộc. Ba ô còn lại
 * tuỳ chọn, và hai trong ba thường đã được điền sẵn giúp họ.
 *
 * Ô nhập ĐƯỢC ĐIỀU KHIỂN bằng state, cùng lý do đã ghi ở `takedown-form.tsx`: React
 * reset form sau khi action chạy, kể cả khi action trả lỗi — và ở đây ô mô tả là toàn
 * bộ nội dung báo cáo. Mất nó một lần thì người đang bực sẽ không gõ lại, và một chỗ
 * hỏng thật không bao giờ được biết tới.
 */
export function BaoLoiForm({
  maLoiSan,
  duongDanSan,
}: {
  maLoiSan: string;
  duongDanSan: string;
}) {
  const [state, formAction, pending] = useActionState(guiBaoLoiAction, null);
  const [moTa, setMoTa] = useState('');
  const [maLoi, setMaLoi] = useState(maLoiSan);
  const [duongDan, setDuongDan] = useState(duongDanSan);
  const [email, setEmail] = useState('');

  if (state && 'ok' in state) {
    return (
      <div data-testid="bao-loi-done">
        <Notice tone="info" role="status">
          <p className="font-semibold">Đã nhận. Cảm ơn bạn.</p>
          <p className="mt-1">
            {email
              ? 'Nếu cần hỏi thêm, chúng tôi trả lời vào email bạn vừa điền.'
              : 'Bạn không điền email nên chúng tôi không trả lời được — nhưng báo cáo đã tới nơi.'}{' '}
            Không cần gửi lại lần nữa.
          </p>
        </Notice>
      </div>
    );
  }

  return (
    <form action={formAction} data-testid="bao-loi-form" className={`max-w-150 ${THE_FORM}`}>
      <GocCo />
      <Field
        id="moTa"
        label="Chỗ nào hỏng?"
        hint="Bạn đang ở trang nào, bấm gì thì hỏng, và bạn thấy gì thay vì thứ đáng ra phải thấy. Đừng viết tên thật, trường lớp hay số điện thoại của ai vào đây."
      >
        <TextArea
          id="moTa"
          name="moTa"
          required
          rows={5}
          maxLength={2000}
          value={moTa}
          onChange={(e) => setMoTa(e.target.value)}
          placeholder="Bấm Đăng game thì quay tròn mãi không xong…"
        />
      </Field>

      {/*
        Mã lỗi và đường dẫn: TUỲ CHỌN, và đã điền sẵn khi người dùng tới đây từ trang
        lỗi. Vẫn để họ sửa được, vì có người sẽ chép mã từ ảnh chụp màn hình của người
        khác — và một ô chỉ đọc thì họ không dán vào đâu được.
      */}
      <Field
        id="maLoi"
        label="Mã lỗi (nếu trang lỗi có hiện)"
        hint="Chuỗi chữ số ở cuối trang lỗi. Không có thì bỏ trống."
      >
        <TextInput
          id="maLoi"
          name="maLoi"
          value={maLoi}
          onChange={(e) => setMaLoi(e.target.value)}
          autoComplete="off"
          placeholder="ví dụ 1a2b3c4d"
        />
      </Field>

      <Field id="duongDan" label="Trang đang mở" hint="Chúng tôi điền sẵn nếu biết.">
        <TextInput
          id="duongDan"
          name="duongDan"
          value={duongDan}
          onChange={(e) => setDuongDan(e.target.value)}
          autoComplete="off"
          placeholder="/upload"
        />
      </Field>

      <Field
        id="emailLienHe"
        label="Email của bạn (không bắt buộc)"
        hint="Chỉ dùng để trả lời bạn về đúng chỗ hỏng này. Để trống cũng gửi được."
      >
        <TextInput
          id="emailLienHe"
          name="emailLienHe"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="bome@vidu.com"
        />
      </Field>

      {state && 'error' in state && (
        <Notice tone="error" role="alert">
          {state.error}
        </Notice>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Đang gửi…' : 'Gửi báo lỗi'}
      </Button>
    </form>
  );
}
