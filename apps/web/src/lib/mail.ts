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

/** Một lá thư đã "gửi" ở môi trường dev, giữ để xem lại ở `/dev/thu`. */
export interface ThuDaGui extends MailMessage {
  /** Thời điểm gửi, để hộp thư xếp mới nhất trước. */
  luc: Date;
}

/**
 * Hộp thư giả của môi trường dev: giữ TRONG BỘ NHỚ, không ghi đĩa, không vào DB.
 *
 * VÌ SAO CẦN. Transport `console` in nguyên lá thư kèm link xác minh ra stdout, và
 * điều đó đủ cho bộ kiểm tự động — chúng đọc log. Nhưng để một người XEM thì nó
 * kém: link nằm lẫn trong hàng nghìn dòng log của Next, và muốn bấm được thì phải
 * mở terminal, tìm, bôi đen, copy. `/dev/thu` bày đúng những lá thư đó thành một
 * hộp thư bấm được.
 *
 * VÌ SAO KHÔNG GHI RA ĐĨA HAY VÀO DB, dù cả hai đều tiện hơn (thư sống qua restart):
 * lá thư ở đây chứa token xác minh email và token đặt lại mật khẩu. Giữ trong RAM
 * của tiến trình dev là thứ tự nó biến mất; ghi ra file hay vào bảng là tạo một chỗ
 * chứa token có thời hạn sống lâu hơn phiên làm việc, rồi ai đó sao lưu nó đi.
 *
 * Chỉ nạp được từ `sendViaConsole`, mà hàm đó không bao giờ chạy khi
 * `NODE_ENV=production` (xem `sendMail`). Nên ở production hộp thư này luôn rỗng —
 * và `/dev/thu` vẫn chốt thêm một lớp `notFound()` nữa, không dựa vào điều đó.
 */
const MAX_THU = 50;

const g = globalThis as unknown as { kidogameHopThuDev?: ThuDaGui[] };
g.kidogameHopThuDev ??= [];

/** Mới nhất trước. Trả bản sao để chỗ gọi không sửa được hộp thư. */
export function docHopThuDev(): ThuDaGui[] {
  return [...(g.kidogameHopThuDev ?? [])].reverse();
}

export function xoaHopThuDev(): number {
  const n = g.kidogameHopThuDev?.length ?? 0;
  g.kidogameHopThuDev = [];
  return n;
}

/**
 * In mail ra console.
 *
 * Cố ý in cả nội dung, kể cả link chứa token: đây là transport dành riêng cho máy
 * dev, và người chạy nó chính là người cần bấm vào link để thử luồng. Trên
 * production thì `RESEND_API_KEY` phải được đặt, và nhánh này không chạy.
 *
 * VẪN IN RA CONSOLE dù đã có `/dev/thu`, không thay thế: bốn bộ e2e đọc link xác
 * minh từ stdout, và hộp thư trong bộ nhớ thì tiến trình khác không đọc được. Bỏ
 * `console.log` ở đây là 146 phép kiểm đổ ở bước đầu.
 */
function sendViaConsole(message: MailMessage): void {
  const hop = (g.kidogameHopThuDev ??= []);
  hop.push({ ...message, luc: new Date() });
  // Mảng vòng: một buổi thử có thể sinh hàng trăm thư, mà chẳng ai xem lại thư thứ 51.
  if (hop.length > MAX_THU) hop.splice(0, hop.length - MAX_THU);

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
 * Key Resend thật hay chỉ là chỗ giữ chỗ.
 *
 * VÌ SAO CẦN HÀM NÀY. Chốt an toàn bên dưới chỉ kêu khi `RESEND_API_KEY` VẮNG MẶT.
 * Mà `infra/.env.example` và mọi bản .env chép từ nó đều có sẵn một giá trị giả kiểu
 * `re_xxx`, nên trên thực tế biến luôn CÓ MẶT và chốt đó không bao giờ chạy. Cái xảy
 * ra thay vào đó, đã dựng lại nguyên vẹn trên stack Docker: đăng ký một phụ huynh thì
 * tài khoản tạo xong, trang hiện "Một lá thư đã được gửi tới …", ngay dưới là "Bạn cần
 * xác minh email trước khi tạo tài khoản cho con", và không có lá thư nào. Lỗi thật
 * `Resend trả về 401: API key is invalid` chỉ nằm trong log container.
 *
 * Tức là một cấu hình chưa xong bị kể lại thành một hệ thống đang chạy. Phụ huynh chờ
 * mãi, không tạo được tài khoản cho con, và đứa trẻ không có gì để đăng.
 *
 * Key thật của Resend là `re_` cộng một chuỗi dài. Ngưỡng 20 ký tự chọn thấp hơn hẳn
 * độ dài thật để không bao giờ từ chối oan một key thật, nhưng vẫn bắt được mọi giá
 * trị giữ chỗ đã thấy: `re_xxx`, `re_your_api_key`, `re_local`.
 *
 * KHÔNG kiểm bằng cách gọi thử API: `sendMail` nằm trên đường đi của đăng ký và đặt
 * lại mật khẩu, thêm một vòng đi Internet vào đó là thêm một chỗ để chậm và để hỏng.
 * Kiểm key dùng được thật là việc của `infra/mail-check.mjs`.
 */
function laKeyGiuCho(apiKey: string): boolean {
  const k = apiKey.trim();
  return !k.startsWith('re_') || k.length < 20;
}

/**
 * Gửi một email.
 *
 * Ném lỗi khi gửi thất bại. Người gọi tự quyết định có nuốt lỗi hay không —
 * ví dụ đăng ký tài khoản KHÔNG nên hỏng chỉ vì mail xác minh gửi trượt.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const coKeyThat = Boolean(apiKey) && !laKeyGiuCho(apiKey as string);

  if (coKeyThat) {
    await sendViaResend(message, apiKey as string);
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    /*
     * Ở production mà thiếu cấu hình thì phải kêu to. In mail ra log server của
     * production là rò token vào một nơi hoàn toàn không mong đợi.
     *
     * Nói rõ key ĐANG CÓ nhưng là giữ chỗ, chứ không gộp vào cùng một câu với thiếu
     * hẳn key: hai tình huống này sửa khác nhau, mà người đọc dòng lỗi thường là
     * người vừa tưởng mình đã cấu hình xong.
     */
    throw new Error(
      apiKey
        ? 'RESEND_API_KEY đang là giá trị giữ chỗ, chưa phải key thật: không gửi được mail ở môi trường production. Lấy key ở https://resend.com/api-keys rồi kiểm bằng `node infra/mail-check.mjs`.'
        : 'Thiếu RESEND_API_KEY: không gửi được mail ở môi trường production.'
    );
  }

  /*
   * Dev: key giữ chỗ cũng rơi về transport `console` như khi không có key. Cố ý —
   * `re_xxx` trong .env của máy dev là chuyện bình thường, mà đi Resend với nó thì
   * mất luôn link xác minh trong log, và bốn bộ e2e đọc link từ đó sẽ đổ ở bước đầu
   * với triệu chứng trông như luồng xác minh email bị hỏng.
   */
  sendViaConsole(message);
}
