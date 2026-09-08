/**
 * Gửi email, qua một tầng trung gian thay được nhà cung cấp.
 *
 * Mặc định là transport `console`: in nguyên nội dung mail ra log server thay vì
 * gửi đi thật. Nhờ vậy toàn bộ luồng xác minh email và quên mật khẩu chạy được —
 * và test end-to-end được — trên máy dev mà không cần API key, không cần mạng, và
 * không có nguy cơ lỡ tay gửi mail thật tới người dùng thật trong lúc thử.
 *
 * Cắm đường gửi thật chỉ bằng biến môi trường, không phải sửa code. Có hai đường,
 * chọn MỘT:
 *
 *   SMTP — gửi qua hòm thư sẵn có, không cần domain riêng. Đường rẻ nhất để mail
 *   đi thật được ngay; với Gmail thì bật xác minh hai bước rồi tạo App Password
 *   (https://myaccount.google.com/apppasswords), KHÔNG dùng mật khẩu đăng nhập.
 *     SMTP_HOST=smtp.gmail.com
 *     SMTP_PORT=587
 *     SMTP_USER=ban@gmail.com
 *     SMTP_PASS=<app password 16 ký tự>
 *     MAIL_FROM="KidoGame <ban@gmail.com>"
 *
 *   Resend — HTTP API, cần domain riêng đã verify để gửi cho người ngoài.
 *     RESEND_API_KEY=re_xxx
 *     MAIL_FROM="KidoGame <no-reply@kidogame.vn>"
 *
 * Đặt cả hai thì SMTP thắng: xem `sendMail`.
 */

import { isOperatorConfigured, operator } from './operator';

export interface MailMessage {
  to: string;
  subject: string;
  /** Bản chữ thuần. Luôn phải có — nhiều hòm thư và bộ lọc rác đọc bản này. */
  text: string;
}

/** Một lá thư đã dựng xong chân thư và đã quyết định địa chỉ nhận thư trả lời. */
export interface ThuGui extends MailMessage {
  /** Địa chỉ cho header `Reply-To`, hoặc `null` khi chưa khai `OPERATOR_EMAIL`. */
  replyTo: string | null;
}

/**
 * Địa chỉ nhận thư TRẢ LỜI, hoặc `null` khi chưa khai `OPERATOR_EMAIL`.
 *
 * VÌ SAO PHẢI CÓ. Sáu lá thư trong dự án này bảo người nhận "trả lời thư này", và
 * một trong số đó là đường DUY NHẤT để lấy lại file `.sb3` gốc của một đứa trẻ
 * trước ngày nó bị xoá vĩnh viễn (`takedown.ts`, thư báo gỡ vì khiếu nại bản
 * quyền). `/dieu-khoan` hứa đúng đường ấy. Mà trước đây `MailMessage` không có
 * `replyTo` và không transport nào đặt header đó, nên thư trả lời rơi về địa chỉ
 * `MAIL_FROM` — mặc định lúc deploy là `no-reply@kidogame.vn` (`docker-compose.yml`).
 *
 * VÌ SAO KHÔNG AI THẤY: trên máy dev `MAIL_FROM` là hòm thư thật của người phát
 * triển, nên ở dev trả lời thư TỚI NƠI. Cách hỏng chỉ hiện ra đúng lúc deploy.
 *
 * `null` khi chưa cấu hình chứ KHÔNG rơi về `chua-cau-hinh@kidogame.local`: đặt
 * `Reply-To` trỏ vào một TLD dành riêng cho thử nghiệm là bảo đảm mọi thư trả lời
 * bị trả về, tệ hơn hẳn việc không đặt header nào và để thư về `MAIL_FROM`.
 */
function diaChiTraLoi(): string | null {
  return isOperatorConfigured() ? operator().email : null;
}

/**
 * Chân thư, dùng chung cho CẢ bản chữ lẫn bản HTML.
 *
 * Câu cũ ở đây là "Bạn không cần trả lời thư." — sai với sáu trong tám lá thư, và
 * nó nằm cách chỗ thư vừa bảo "trả lời thư này trước ngày đó" đúng hai dòng. Phụ
 * huynh đọc lá thư báo game của con sắp bị xoá hẳn sẽ thấy hai câu ngược nhau, gửi
 * từ một địa chỉ tên là `no-reply`.
 *
 * Nêu thẳng địa chỉ chứ không chỉ dựa vào header: một số hòm thư không bày
 * `Reply-To` ra, và người đang muốn giữ lại công của con thì cần thấy chỗ để gửi.
 *
 * Chưa cấu hình `OPERATOR_*` thì BỎ HẲN câu về việc trả lời, không thay bằng câu
 * phủ định. Lúc đó không ai biết thư trả lời đi đâu, nên cả hai hướng đều là nói
 * bừa; im về chuyện đó là câu duy nhất còn đúng.
 */
function chanThu(): string {
  const traLoi = diaChiTraLoi();
  const gioiThieu = 'Thư này gửi tự động từ KidoGame, nơi các bé đăng game Scratch tự làm.';
  return traLoi ? `${gioiThieu} Trả lời thư này thì thư về ${traLoi}.` : gioiThieu;
}

/** Origin của app, dùng để dựng link tuyệt đối trong mail. */
export function appOrigin(): string {
  return process.env.APP_ORIGIN ?? 'http://localhost:3000';
}

// --- Dựng bản HTML của thư ---------------------------------------------------

/*
 * Bản HTML được DỰNG TỪ CHÍNH BẢN CHỮ, không viết tay riêng cho từng loại thư.
 *
 * Có tám chỗ gọi `sendMail`. Viết HTML riêng cho từng chỗ là tám bản nội dung song
 * song với tám bản chữ, và chúng sẽ lệch nhau ngay lần đầu có người sửa câu chữ ở
 * một bên — mà cách hỏng đó im lặng: người sửa đọc bản HTML trong hòm thư của mình
 * và không bao giờ thấy bản chữ mà bộ lọc rác đọc.
 *
 * Đổi lại, hàm này chỉ nhận được đúng cấu trúc mà văn bản có: dòng trống tách đoạn,
 * và một dòng chỉ chứa URL là một link đứng riêng. Thế là đủ cho mọi thư ở đây, vì
 * cả tám đều viết theo lối đó.
 */

const MAU = {
  nen: '#f8f7f3',
  the: '#fffdf8',
  vien: '#d9d9e4',
  chu: '#1b1b32',
  chuMo: '#5a5a77',
  nut: '#a54f00',
  nutChu: '#ffffff',
} as const;

/**
 * Escape để chuỗi bất kỳ nằm an toàn trong nội dung HTML.
 *
 * Cần thật, không phải đề phòng hình thức: địa chỉ email và tên game do người dùng
 * nhập đều đi vào thư. Một tên game chứa `<` mà không escape thì phần còn lại của
 * lá thư biến thành thẻ mở dở dang, và hòm thư nhận sẽ tự "sửa" theo cách của nó.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Một đoạn chỉ gồm đúng một URL http/https, không kèm chữ nào khác. */
function laUrlDungRieng(doan: string): boolean {
  return /^https?:\/\/\S+$/.test(doan.trim());
}

/**
 * Dựng bản HTML từ bản chữ.
 *
 * Ba giới hạn của email khác hẳn web, và cả ba đều quyết định lối viết dưới đây:
 *
 *  - **Không có stylesheet.** Gmail bỏ hẳn thẻ `<style>` trong nhiều ngữ cảnh, nên
 *    mọi thuộc tính phải là `style=` đặt tại chỗ.
 *  - **Không flex, không grid.** Outlook trên Windows dựng trang bằng Word, nên
 *    layout phải là `<table>` — đó không phải cổ lỗ mà là thứ duy nhất chạy.
 *  - **Không ảnh, không webfont.** Phần lớn hòm thư chặn ảnh ngoài theo mặc định,
 *    và một lá thư mà bố cục phụ thuộc vào ảnh thì hỏng ngay ở lần mở đầu tiên.
 *    Thư này không tải một byte nào từ bên ngoài — cũng đúng nguyên tắc của cả dự
 *    án là không có traffic ra bên thứ ba.
 */
export function dungHtmlTuText(text: string, subject: string): string {
  const chan = chanThu();

  /*
   * Gỡ chân thư ra khỏi phần thân nếu bản chữ đã mang sẵn.
   *
   * `sendMail` gắn chân vào `text` để bản chữ và bản HTML không bao giờ lệch nhau —
   * đó là cùng lý do đã viết ở đầu mục này. Nhưng chân thư trong HTML là một ô
   * riêng có đường kẻ ngăn và cỡ chữ nhỏ, nên nếu cứ để nguyên thì nó vừa ra một
   * đoạn thường trong thân, vừa ra ô chân bên dưới — in hai lần.
   *
   * Gỡ bằng cách SO ĐÚNG chuỗi chân thư chứ không phải "bỏ đoạn cuối": hàm này còn
   * được `/dev/thu/[chiSo]/html` gọi trên thư đã lưu, và một ngày nào đó có thể
   * được gọi trên một đoạn chữ trần. So khớp thì đoạn chữ trần giữ nguyên mọi đoạn
   * của nó, chỉ được thêm ô chân — thay vì âm thầm mất đoạn cuối.
   */
  const doanVan = text
    .split(/\n\s*\n/)
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => d !== chan);

  const than = doanVan
    .map((doan) => {
      if (laUrlDungRieng(doan)) {
        const url = doan.trim();
        /*
         * Nút, VÀ dưới nút là link ở dạng chữ đầy đủ.
         *
         * Không phải thừa: một số hòm thư chỉ hiện chữ chứ không dựng được nền của
         * nút, và người dùng trên máy tính của trường thường phải copy link sang
         * trình duyệt khác. Bản chữ đầy đủ là đường thoát cho cả hai.
         */
        return `
          <tr><td style="padding:8px 0 4px">
            <a href="${esc(url)}" style="display:inline-block;background:${MAU.nut};color:${MAU.nutChu};text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;font-size:16px">Mở link</a>
          </td></tr>
          <tr><td style="padding:0 0 14px">
            <div style="font-size:13px;color:${MAU.chuMo};line-height:1.5">Nút không bấm được thì copy dòng này vào trình duyệt:</div>
            <div style="font-size:13px;line-height:1.6;word-break:break-all"><a href="${esc(url)}" style="color:${MAU.nut}">${esc(url)}</a></div>
          </td></tr>`;
      }

      // Dòng đơn trong cùng một đoạn vẫn phải giữ chỗ ngắt của bản chữ.
      const noiDung = esc(doan).replace(/\n/g, '<br>');
      return `<tr><td style="padding:0 0 14px;font-size:16px;line-height:1.65;color:${MAU.chu}">${noiDung}</td></tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${MAU.nen}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MAU.nen};padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${MAU.the};border:1px solid ${MAU.vien};border-radius:14px;padding:26px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
      <tr><td style="padding:0 0 18px;font-size:19px;font-weight:700;color:${MAU.nut}">KidoGame</td></tr>
      ${than}
      <tr><td style="padding:16px 0 0;border-top:1px solid ${MAU.vien};font-size:13px;line-height:1.55;color:${MAU.chuMo}">
        ${esc(chan)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function mailFrom(): string {
  return process.env.MAIL_FROM ?? 'KidoGame <no-reply@kidogame.local>';
}

/** Một lá thư đã "gửi" ở môi trường dev, giữ để xem lại ở `/dev/thu`. */
export interface ThuDaGui extends ThuGui {
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
 * Ghi lại một lá thư ở môi trường dev: vào hộp thư `/dev/thu` và ra console.
 *
 * KHÔNG phải một transport. Hàm này chạy ở dev BẤT KỂ lá thư sau đó được gửi đi
 * bằng đường nào — console, SMTP hay Resend.
 *
 * VÌ SAO PHẢI TÁCH RA NHƯ VẬY. Trước khi có SMTP, việc in ra log gắn liền với
 * chuyện "không có đường gửi thật", nên hệ quả là: đặt một key gửi thật vào máy
 * dev thì log không còn link xác minh, và bốn bộ e2e đọc link từ stdout đổ ngay
 * bước đầu — với triệu chứng trông y như luồng xác minh email bị hỏng, chứ không
 * chỉ vào cấu hình chút nào. Tách ra thì fen bật SMTP để thử gửi thật vẫn chạy
 * được cả 146 phép kiểm đó.
 *
 * Cố ý in cả nội dung, kể cả link chứa token: đây là đường của máy dev, và người
 * chạy nó chính là người cần bấm vào link. Ở production hàm này không bao giờ
 * được gọi — in mail chứa token ra log production là rò token.
 *
 * VẪN IN RA CONSOLE dù đã có `/dev/thu`, không thay thế: bốn bộ e2e đọc link từ
 * stdout, và hộp thư trong bộ nhớ thì tiến trình khác không đọc được.
 *
 * `nhan` nói lá thư này thực sự đi đường nào, để không đọc log rồi tưởng thư đã
 * gửi khi nó chưa đi đâu cả — hoặc ngược lại. Tiền tố `┌─ MAIL` phải giữ nguyên:
 * `infra/e2e-email.mjs` cắt log theo đúng chuỗi đó.
 */
function ghiLaiChoDev(message: ThuGui, nhan: string): void {
  const hop = (g.kidogameHopThuDev ??= []);
  hop.push({ ...message, luc: new Date() });
  // Mảng vòng: một buổi thử có thể sinh hàng trăm thư, mà chẳng ai xem lại thư thứ 51.
  if (hop.length > MAX_THU) hop.splice(0, hop.length - MAX_THU);

  /*
   * In cả `Reply-To`, kể cả khi nó trống.
   *
   * Header này là thứ vừa vắng mặt suốt mà không ai biết, và cách nó hỏng là im
   * lặng tuyệt đối: thư vẫn gửi, vẫn tới, vẫn đọc được — chỉ thư TRẢ LỜI mới rơi
   * mất, ở một thời điểm khác, tại hòm thư của người khác. Không in ra đây thì ở
   * dev không có chỗ nào nhìn thấy nó, và bộ kiểm cũng không có gì để đọc.
   *
   * In cả dòng "chưa khai OPERATOR_EMAIL" thay vì giấu dòng đi khi trống: một dòng
   * vắng mặt thì không ai nhận ra là nó vắng.
   */
  const dongTraLoi = message.replyTo
    ? `│ trả lời: ${message.replyTo}`
    : '│ trả lời: (chưa khai OPERATOR_EMAIL — thư trả lời rơi về MAIL_FROM)';

  console.log(
    [
      '',
      `┌─ MAIL (${nhan}) ─────────────`,
      `│ tới:     ${message.to}`,
      dongTraLoi,
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

/** Cấu hình một máy chủ SMTP, đã đủ để gửi. */
interface CauHinhSmtp {
  host: string;
  port: number;
  /** true = TLS ngay từ đầu (port 465). false = kết nối thường rồi STARTTLS (587). */
  secure: boolean;
  user: string;
  pass: string;
}

/**
 * Đọc cấu hình SMTP từ môi trường, hoặc `null` nếu chưa đủ.
 *
 * ĐÒI ĐỦ CẢ BỐN biến chứ không chấp nhận một phần. Thiếu `SMTP_PASS` mà vẫn dựng
 * transporter thì nodemailer nối tới máy chủ, bị từ chối xác thực, và `sendMail`
 * ném lỗi — trong khi đường Resend hoặc đường console ngay bên dưới lẽ ra vẫn
 * chạy được. Tức một biến gõ thiếu làm chết cả chức năng mail thay vì rơi về
 * đường sau. Coi cấu hình dở dang là "chưa cấu hình" thì hành vi đó không xảy ra.
 *
 * `secure` suy từ port vì đó là chỗ người ta gõ sai nhiều nhất: 465 là TLS ngay,
 * 587 là STARTTLS. Đặt `SMTP_SECURE` để ghi đè khi máy chủ không theo quy ước.
 */
function docCauHinhSmtp(): CauHinhSmtp | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  const secureRaw = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureRaw ? secureRaw === 'true' || secureRaw === '1' : port === 465;

  return { host, port, secure, user, pass };
}

/**
 * Transporter dùng lại giữa các lá thư.
 *
 * Mỗi transporter mới là một lần bắt tay TLS và một lần xác thực. Đường gửi mail
 * nằm ngay trên đường đăng ký và đặt lại mật khẩu, nên dựng mới cho từng lá thư là
 * thêm khoảng một giây vào một việc người dùng đang đứng chờ. Giữ trên globalThis
 * chứ không phải biến module vì Next dev thay module trong lúc chạy.
 */
const gSmtp = globalThis as unknown as {
  kidogameSmtp?: { key: string; transporter: import('nodemailer').Transporter };
};

async function layTransporter(cfg: CauHinhSmtp) {
  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
  if (gSmtp.kidogameSmtp?.key === key) return gSmtp.kidogameSmtp.transporter;

  // import động: chỉ nạp nodemailer khi thật sự dùng SMTP, và nó không bị kéo vào
  // bundle của những đường không cần.
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    // Dùng lại một kết nối cho nhiều thư liên tiếp — quan trọng khi một lượt kiểm
    // duyệt sinh ra hàng chục thư thông báo.
    pool: true,
    maxConnections: 2,
    // Không để một máy chủ SMTP treo giữ luôn request đăng ký của phụ huynh.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  gSmtp.kidogameSmtp = { key, transporter };
  return transporter;
}

async function sendViaSmtp(message: ThuGui, cfg: CauHinhSmtp): Promise<void> {
  const transporter = await layTransporter(cfg);
  try {
    await transporter.sendMail({
      from: mailFrom(),
      to: message.to,
      // `undefined` chứ không phải chuỗi rỗng: nodemailer dựng hẳn một header
      // `Reply-To:` rỗng cho chuỗi rỗng, và một header dị dạng bị chấm điểm spam.
      replyTo: message.replyTo ?? undefined,
      subject: message.subject,
      // Gửi cả hai bản. Hòm thư tự chọn, và bộ lọc rác đọc bản chữ — một lá thư
      // chỉ có HTML bị chấm điểm spam cao hơn hẳn.
      text: message.text,
      html: dungHtmlTuText(message.text, message.subject),
    });
  } catch (err) {
    /*
     * Bọc lại kèm host và user để dòng lỗi tự nói ra chỗ cần sửa. Nguyên nhân hay
     * gặp nhất với Gmail là dùng mật khẩu đăng nhập thay cho App Password, và lỗi
     * gốc của nodemailer cho việc đó chỉ là "Invalid login: 535-5.7.8" — không ai
     * đoán ra từ đó.
     *
     * KHÔNG đưa `pass` vào thông điệp: dòng này đi vào log.
     */
    const lyDo = err instanceof Error ? err.message : String(err);
    throw new Error(`Gửi SMTP thất bại qua ${cfg.host}:${cfg.port} với user ${cfg.user}: ${lyDo}`);
  }
}

async function sendViaResend(message: ThuGui, apiKey: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: [message.to],
      // Resend gọi trường này là `reply_to` (snake_case) và nhận một MẢNG, khác hẳn
      // `replyTo` của nodemailer. Gõ theo thói quen camelCase thì Resend BỎ QUA
      // trường lạ và vẫn trả 200 — thư đi bình thường, chỉ là không có Reply-To.
      ...(message.replyTo ? { reply_to: [message.replyTo] } : {}),
      subject: message.subject,
      text: message.text,
      html: dungHtmlTuText(message.text, message.subject),
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
/**
 * Tên miền cấp cao DÀNH RIÊNG cho thử nghiệm, không bao giờ tồn tại thật.
 *
 * RFC 2606 và RFC 6761 giữ `.test`, `.example`, `.invalid` và `.localhost` để không
 * ai đăng ký được; `.local` là mDNS trong mạng nội bộ.
 */
const TLD_THU_NGHIEM = ['.test', '.example', '.invalid', '.localhost', '.local'];

function laDiaChiThuNghiem(to: string): boolean {
  const dc = to.trim().toLowerCase();
  return TLD_THU_NGHIEM.some((t) => dc.endsWith(t));
}

export async function sendMail(message: MailMessage): Promise<void> {
  const smtp = docCauHinhSmtp();
  const apiKey = process.env.RESEND_API_KEY;
  const coKeyThat = Boolean(apiKey) && !laKeyGiuCho(apiKey as string);
  const laDev = process.env.NODE_ENV !== 'production';

  /*
   * Gắn chân thư và chốt địa chỉ trả lời ĐÚNG MỘT LẦN, ngay đây, trước mọi nhánh.
   *
   * Làm ở đây chứ không ở từng transport vì có bốn đường một lá thư đi ra —
   * console, hộp thư `/dev/thu`, SMTP, Resend — và ba trong bốn đường đó là thứ
   * người ta ĐỌC để tin rằng thư đã gửi đúng. Gắn chân ở transport thì log dev và
   * `/dev/thu` bày ra một lá thư khác với lá thư người nhận thật sự nhận được, mà
   * khác đúng ở phần vừa mới được sửa cho hết sai.
   */
  const thu: ThuGui = {
    ...message,
    text: `${message.text.trimEnd()}\n\n${chanThu()}`,
    replyTo: diaChiTraLoi(),
  };

  /*
   * Ở DEV, địa chỉ thuộc TLD thử nghiệm KHÔNG bao giờ đi ra ngoài, dù đã cấu hình
   * đường gửi thật.
   *
   * Đây là cách hỏng do chính việc cho phép bật SMTP ở dev tạo ra, và nó không kêu
   * lên chút nào. Sáu bộ e2e gửi thư tới `e2e-…@kidogame.test`, mỗi lượt chạy hàng
   * chục lá. Với SMTP thật, Gmail nhận rồi cố phát tới một domain không tồn tại và
   * trả về bounce — hàng chục bounce một lượt chạy là đúng dấu hiệu Google dùng để
   * chấm một tài khoản là nguồn spam. Cái mất không phải một lá thư trượt mà là
   * hòm thư của người vận hành bị hạ điểm, và hậu quả chỉ lộ ra sau, ở dạng "thư
   * của KidoGame tự nhiên hay vào Spam".
   *
   * Chặn theo TLD dành riêng chứ không theo danh sách domain cụ thể: `.test` không
   * bao giờ là địa chỉ thật, nên chặn nó không thể chặn oan ai. Thư vẫn vào hộp
   * `/dev/thu` và ra log ngay bên dưới, nên các bộ kiểm không hề biết khác biệt.
   *
   * KHÔNG áp dụng ở production: ở đó một địa chỉ `.test` là dữ liệu sai cần được
   * thấy là gửi trượt, chứ không phải im lặng bỏ qua.
   */
  const boQuaVoiDiaChiThuNghiem = laDev && laDiaChiThuNghiem(message.to);

  /*
   * Ghi lại lá thư TRƯỚC khi gửi, và ở dev thì luôn ghi bất kể đường gửi nào.
   *
   * Trước khi gửi chứ không phải sau: một lá thư gửi trượt là đúng lúc cần nhìn
   * thấy nội dung nó nhất, mà `sendViaSmtp` thì ném lỗi.
   */
  if (laDev) {
    const nhan = boQuaVoiDiaChiThuNghiem
      ? 'địa chỉ thử nghiệm — KHÔNG gửi ra ngoài'
      : smtp
        ? `gửi thật qua SMTP ${smtp.host}`
        : coKeyThat
          ? 'gửi thật qua Resend'
          : 'transport console — KHÔNG gửi đi thật';
    ghiLaiChoDev(thu, nhan);
  }

  if (boQuaVoiDiaChiThuNghiem) return;

  /*
   * SMTP thắng Resend khi đặt cả hai. Người khai đủ bốn biến SMTP_* là người đang
   * cố ý trỏ mail qua một hòm thư cụ thể, còn `RESEND_API_KEY` thì hay còn nằm lại
   * trong .env từ lần cấu hình trước.
   */
  if (smtp) {
    await sendViaSmtp(thu, smtp);
    return;
  }

  if (coKeyThat) {
    await sendViaResend(thu, apiKey as string);
    return;
  }

  if (!laDev) {
    /*
     * Ở production mà thiếu cấu hình thì phải kêu to. In mail ra log server của
     * production là rò token vào một nơi hoàn toàn không mong đợi.
     *
     * Nói rõ key ĐANG CÓ nhưng là giữ chỗ, chứ không gộp vào cùng một câu với thiếu
     * hẳn key: hai tình huống này sửa khác nhau, mà người đọc dòng lỗi thường là
     * người vừa tưởng mình đã cấu hình xong. Cùng lẽ đó, nêu luôn đường SMTP —
     * người đọc dòng này có thể đang không định dùng Resend chút nào.
     */
    throw new Error(
      apiKey
        ? 'RESEND_API_KEY đang là giá trị giữ chỗ, chưa phải key thật: không gửi được mail ở môi trường production. Lấy key ở https://resend.com/api-keys, hoặc khai SMTP_HOST/SMTP_USER/SMTP_PASS để gửi qua hòm thư sẵn có. Kiểm bằng `node infra/mail-check.mjs`.'
        : 'Chưa có đường gửi mail nào ở môi trường production: khai SMTP_HOST, SMTP_USER và SMTP_PASS, hoặc đặt RESEND_API_KEY. Kiểm bằng `node infra/mail-check.mjs`.'
    );
  }

  /*
   * Dev, không có đường gửi thật nào: lá thư đã vào hộp thư `/dev/thu` và ra log ở
   * trên, không cần làm gì thêm. Key giữ chỗ kiểu `re_xxx` rơi vào đúng nhánh này
   * như khi không có key — cố ý, vì `re_xxx` trong .env của máy dev là chuyện bình
   * thường, mà đi Resend với nó thì mọi lá thư đều trượt.
   */
}
