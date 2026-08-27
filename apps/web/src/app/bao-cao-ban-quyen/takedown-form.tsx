'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/button';
import { Field, TextArea, TextInput } from '@/components/field';
import { Notice } from '@/components/notice';
import { submitTakedownAction } from '@/lib/actions';
import {
  MAX_CLAIMANT_EMAIL_LENGTH,
  MAX_CLAIMANT_NAME_LENGTH,
  MAX_EVIDENCE_LENGTH,
} from '@/lib/takedown-limits';

/**
 * Biểu mẫu gỡ nội dung vi phạm bản quyền.
 *
 * Người điền là NGƯỜI LỚN Ở NGOÀI, không có tài khoản ở đây và có thể chưa từng
 * nghe tới KidoGame trước hôm nay. Nên form viết bằng giọng khác hẳn phần còn lại
 * của trang: không "bé ơi", không biểu tượng vui, và mỗi ô nói thẳng vì sao lại hỏi.
 */
export function TakedownForm({ defaultGameRef }: { defaultGameRef: string }) {
  const [state, formAction, pending] = useActionState(submitTakedownAction, null);

  /*
   * Ô nhập ĐƯỢC ĐIỀU KHIỂN bằng state, không để mặc uncontrolled như các form khác
   * trong dự án. Đây không phải sở thích — React reset form sau khi một action chạy
   * xong, kể cả khi action trả về lỗi, nên form uncontrolled sẽ trắng trơn ngay lúc
   * người dùng vừa được báo là điền sai. Ở đây ô "căn cứ" dài tới 2000 ký tự và là
   * cả nội dung khiếu nại: mất nó một lần là phần lớn người ta bỏ luôn, và một yêu
   * cầu gỡ có thật sẽ không bao giờ tới nơi.
   *
   * Các form còn lại chưa gặp vấn đề này vì ô của chúng ngắn (email, mật khẩu) và gõ
   * lại chỉ mất vài giây.
   */
  const [gameRef, setGameRef] = useState(defaultGameRef);
  const [claimantName, setClaimantName] = useState('');
  const [claimantEmail, setClaimantEmail] = useState('');
  const [evidence, setEvidence] = useState('');

  if (state && 'ok' in state) {
    return (
      <div data-testid="takedown-done">
        <Notice tone="info" role="status">
          <p className="font-semibold">Đã nhận yêu cầu của bạn.</p>
          <p className="mt-1">
            Game đã được tạm ẩn khỏi trang công khai. Chúng tôi sẽ xem lại và trả lời vào email bạn
            vừa điền. Không cần gửi thêm lần nữa.
          </p>
        </Notice>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      data-testid="takedown-form"
      className="mb-12 max-w-150 rounded-card border border-border bg-surface p-6"
    >
      <Field
        id="gameRef"
        label="Game nào?"
        hint="Dán nguyên đường link trang game vào đây. Không cần cắt gọt gì cả."
      >
        <TextInput
          id="gameRef"
          name="gameRef"
          required
          value={gameRef}
          onChange={(e) => setGameRef(e.target.value)}
          placeholder="https://…/game/…"
          autoComplete="off"
        />
      </Field>

      <Field id="claimantName" label="Tên của bạn">
        <TextInput
          id="claimantName"
          name="claimantName"
          required
          value={claimantName}
          onChange={(e) => setClaimantName(e.target.value)}
          maxLength={MAX_CLAIMANT_NAME_LENGTH}
          autoComplete="name"
        />
      </Field>

      <Field
        id="claimantEmail"
        label="Email của bạn"
        hint="Đây là địa chỉ duy nhất chúng tôi dùng để trả lời bạn."
      >
        <TextInput
          id="claimantEmail"
          name="claimantEmail"
          type="email"
          required
          value={claimantEmail}
          onChange={(e) => setClaimantEmail(e.target.value)}
          maxLength={MAX_CLAIMANT_EMAIL_LENGTH}
          autoComplete="email"
        />
      </Field>

      <Field
        id="evidence"
        label="Bạn là ai với bản gốc, và bản gốc ở đâu?"
        hint="Dán link tới bản gốc (trang Scratch, kho lưu trữ, video…) và nói ngắn gọn vì sao bạn là người có quyền. Mỗi link một dòng cũng được."
      >
        <TextArea
          id="evidence"
          name="evidence"
          required
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          rows={7}
          maxLength={MAX_EVIDENCE_LENGTH}
        />
      </Field>

      {/*
        Ô cam đoan là BẮT BUỘC, và cố ý đặt ngay trên nút gửi.
        Yêu cầu này làm game của một đứa trẻ biến mất trước khi có ai kịp đọc, nên
        câu cuối cùng người gửi nhìn thấy phải là câu nhắc họ chịu trách nhiệm.

        Ô DUY NHẤT trong form này KHÔNG được điều khiển bằng state — nghĩa là nó bị
        React reset sau mỗi lần gửi hỏng, và người gửi phải tích lại. Cố ý: chữ họ gõ
        thì phải giữ, còn lời cam đoan thì nên khẳng định lại mỗi lần bấm gửi. Để nó
        controlled cũng không giữ được (React reset thẳng DOM), chỉ tạo ra state lệch
        với thứ đang hiện trên màn hình.
      */}
      <label className="mt-6 flex cursor-pointer items-start gap-2.5 text-[0.95rem]">
        <input
          type="checkbox"
          name="attest"
          required
          className="mt-1 size-5 shrink-0"
          data-testid="takedown-attest"
        />
        <span>
          Tôi cam đoan những thông tin trên là đúng sự thật, và tôi là người có quyền với nội dung
          gốc hoặc được người đó uỷ quyền. Tôi hiểu game sẽ bị ẩn ngay khi tôi gửi.
        </span>
      </label>

      {state && 'error' in state && (
        <Notice tone="error" role="alert">
          {state.error}
        </Notice>
      )}

      <div className="mt-7">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Đang gửi…' : 'Gửi yêu cầu gỡ'}
        </Button>
      </div>
    </form>
  );
}
