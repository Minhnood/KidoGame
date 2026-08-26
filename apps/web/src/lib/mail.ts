/**
 * Gửi email, qua một tầng trung gian thay được nhà cung cấp.
 *
 * Mặc định là transport `console`: in nguyên nội dung mail ra log server thay vì
 * gửi đi thật. Nhờ vậy toàn bộ luồng xác minh email và quên mật khẩu chạy được —
 * và test end-to-end được — trên máy dev mà không cần API key, không cần mạng, và
 * không có nguy cơ lỡ tay gửi mail thật tới người dùng thật trong lúc thử.
 *
 * Cắm nhà cung cấp thật chỉ bằng biến môi trường, không phải sửa code:
 *   RESEND_API_KEY=re_xxx
 *   MAIL_FROM="KidoGame <no-reply@kidogame.vn>"
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Bản chữ thuần. Luôn phải có — nhiều hòm thư và bộ lọc rác đọc bản này. */
  text: string;
}

/** Origin của app, dùng để dựng link tuyệt đối trong mail. */
export function appOrigin(): string {
  return process.env.APP_ORIGIN ?? 'http://localhost:3000';
}

function mailFrom(): string {
  return process.env.MAIL_FROM ?? 'KidoGame <no-reply@kidogame.local>';
}

/**
 * In mail ra console.
 *
 * Cố ý in cả nội dung, kể cả link chứa token: đây là transport dành riêng cho máy
 * dev, và người chạy nó chính là người cần bấm vào link để thử luồng. Trên
 * production thì `RESEND_API_KEY` phải được đặt, và nhánh này không chạy.
 */
function sendViaConsole(message: MailMessage): void {
  console.log(
    [
      '',
      '┌─ MAIL (transport console — KHÔNG gửi đi thật) ─────────────',
      `│ tới:     ${message.to}`,
      `│ tiêu đề: ${message.subject}`,
      '├────────────────────────────────────────────────────────────',
      message.text
        .split('\n')
        .map((line) => `│ ${line}`)
        .join('\n'),
      '└────────────────────────────────────────────────────────────',
      '',
    ].join('\n')
  );
}

async function sendViaResend(message: MailMessage, apiKey: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });

  if (!res.ok) {
    // Đọc body để log được lý do thật, nhưng KHÔNG bao giờ đưa nó ra cho người dùng.
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend trả về ${res.status}: ${detail.slice(0, 300)}`);
  }
}

/**
 * Gửi một email.
 *
 * Ném lỗi khi gửi thất bại. Người gọi tự quyết định có nuốt lỗi hay không —
 * ví dụ đăng ký tài khoản KHÔNG nên hỏng chỉ vì mail xác minh gửi trượt.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    await sendViaResend(message, apiKey);
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    // Ở production mà thiếu cấu hình thì phải kêu to. In mail ra log server của
    // production là rò token vào một nơi hoàn toàn không mong đợi.
    throw new Error('Thiếu RESEND_API_KEY: không gửi được mail ở môi trường production.');
  }

  sendViaConsole(message);
}
