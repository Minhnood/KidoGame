/**
 * Kiểm ĐƯỜNG THƯ TRẢ LỜI: header `Reply-To` và chân thư.
 *
 * VÌ SAO CÓ BỘ NÀY. Sáu lá thư trong dự án bảo người nhận "trả lời thư này", và
 * một trong số đó — thư báo gỡ game vì khiếu nại bản quyền — là đường DUY NHẤT để
 * phụ huynh lấy lại file `.sb3` gốc của con trước ngày nó bị xoá vĩnh viễn.
 * `/dieu-khoan` hứa đúng đường ấy. Suốt một thời gian dài không lá thư nào mang
 * `Reply-To`, nên thư trả lời rơi về `MAIL_FROM`, mà mặc định lúc deploy của biến
 * đó là `no-reply@kidogame.vn`. Cùng lúc, chân thư HTML in "Bạn không cần trả lời
 * thư." — ngay dưới câu vừa bảo hãy trả lời.
 *
 * VÌ SAO KHÔNG AI THẤY, và vì sao phải có bộ kiểm chứ không chỉ sửa một lần: trên
 * máy dev `MAIL_FROM` là hòm thư thật của người phát triển, nên ở dev trả lời thư
 * TỚI NƠI. Cả hai cách hỏng — thiếu header, và chân thư nói ngược — chỉ hiện ra ở
 * production, ở một thời điểm khác, tại hòm thư của người khác. Không có gì đỏ.
 *
 * VÌ SAO KHÔNG NẰM TRONG e2e QUA HTTP: cái cần đo là một header của lá thư và một
 * chuỗi chữ, cả hai quyết định xong trước khi có bất kỳ request nào. Chạy qua trình
 * duyệt thì còn phải khởi động lại dev server với `OPERATOR_*` để đo được nhánh
 * "đã cấu hình" — mà nhánh "chưa cấu hình" lại đòi khởi động lại lần nữa với biến
 * bị gỡ đi. Gọi thẳng hàm thì đo được cả hai nhánh trong một lượt, không cần server.
 *
 * Chạy:
 *   cd apps/web && pnpm exec tsx ../../infra/tra-loi-thu-check.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Dọn sạch mọi đường gửi thật TRƯỚC khi nạp module.
 *
 * Bộ này gọi `sendMail` thật. Máy dev của fen có `SMTP_*` trỏ vào hòm thư Gmail
 * thật, và `tsx` thì không nạp `.env` như Next — nhưng nếu ai đó chạy bộ này với
 * các biến đó đã export sẵn trong shell thì nó sẽ đi gửi thật. Địa chỉ `.test`
 * bên dưới đã tự chặn một lớp; đây là lớp thứ hai, vì lớp kia chỉ chặn ở dev.
 */
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.RESEND_API_KEY;

const { sendMail, dungHtmlTuText, docHopThuDev, xoaHopThuDev } = await import(
  '../apps/web/src/lib/mail.ts'
);

const results: Array<{ name: string; ok: boolean }> = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const OP_EMAIL = 'lienhe@vidu.test';
const THAN = [
  'Chào bạn,',
  '',
  'Nếu bé chưa giữ bản .sb3 trên máy và muốn lấy lại, trả lời thư này trước ngày đó.',
  '',
  'KidoGame',
].join('\n');

/** Gửi một lá thư rồi trả về đúng lá vừa vào hộp thư dev. Nuốt log cho đỡ rối. */
async function guiRoiLay(text = THAN) {
  xoaHopThuDev();
  const log = console.log;
  console.log = () => {};
  try {
    await sendMail({ to: 'ai-do@vidu.test', subject: 'Thử', text });
  } finally {
    console.log = log;
  }
  return docHopThuDev()[0];
}

function datOperator(bat: boolean) {
  if (bat) {
    process.env.OPERATOR_NAME = 'Trung tâm Ví Dụ';
    process.env.OPERATOR_EMAIL = OP_EMAIL;
  } else {
    delete process.env.OPERATOR_NAME;
    delete process.env.OPERATOR_EMAIL;
  }
}

/** Đếm số lần một chuỗi xuất hiện. Dùng để bắt chân thư in hai lần. */
const demLan = (trong: string, gi: string) => trong.split(gi).length - 1;

const CAU_CU = 'Bạn không cần trả lời thư';
const CAU_TRA_LOI = 'Trả lời thư này thì thư về';

// ---------------------------------------------------------------------------
console.log('\n── Đã khai OPERATOR_*: thư trả lời phải tới được người thật ─');

datOperator(true);
{
  const thu = await guiRoiLay();

  /*
   * Phép kiểm quan trọng nhất của cả bộ. Mọi phép còn lại là về chữ nghĩa trong
   * thư; riêng phép này là về việc bấm nút Reply trong Gmail thì thư đi đâu.
   */
  check('Thư mang Reply-To đúng địa chỉ đơn vị vận hành', thu?.replyTo === OP_EMAIL, String(thu?.replyTo));

  check('Chân thư nêu thẳng địa chỉ trả lời', thu?.text.includes(`${CAU_TRA_LOI} ${OP_EMAIL}.`) === true);
  check('Chân thư chỉ in MỘT lần trong bản chữ', demLan(thu?.text ?? '', CAU_TRA_LOI) === 1, `${demLan(thu?.text ?? '', CAU_TRA_LOI)} lần`);
  check('Thân thư giữ nguyên, không bị chân thư nuốt mất đoạn nào', thu?.text.startsWith(THAN) === true);
  check(`Không còn câu cũ "${CAU_CU}"`, thu?.text.includes(CAU_CU) === false);

  const html = dungHtmlTuText(thu?.text ?? '', 'Thử');
  check('Bản HTML in chân thư đúng MỘT lần', demLan(html, CAU_TRA_LOI) === 1, `${demLan(html, CAU_TRA_LOI)} lần`);
  check('Bản HTML có địa chỉ trả lời', html.includes(OP_EMAIL));
  check(`Bản HTML không còn câu cũ "${CAU_CU}"`, !html.includes(CAU_CU));
  /*
   * Bản chữ và bản HTML phải nói CÙNG một câu về việc trả lời. Đây chính là cách
   * lỗi cũ sinh ra: câu "không cần trả lời" chỉ nằm trong nhánh HTML, nên người
   * sửa câu chữ đọc bản chữ thuần không bao giờ nhìn thấy nó.
   */
  check(
    'Bản chữ và bản HTML nói cùng một câu về việc trả lời',
    demLan(thu?.text ?? '', CAU_TRA_LOI) === demLan(html, CAU_TRA_LOI)
  );
}

// ---------------------------------------------------------------------------
console.log('\n── Chưa khai OPERATOR_*: im về chuyện trả lời, không nói bừa ');

datOperator(false);
{
  const thu = await guiRoiLay();

  /*
   * `null` chứ KHÔNG phải `chua-cau-hinh@kidogame.local`. Đặt Reply-To trỏ vào một
   * TLD dành riêng cho thử nghiệm là bảo đảm mọi thư trả lời bị trả về — tệ hơn
   * hẳn việc không đặt header nào và để thư rơi về MAIL_FROM.
   */
  check('Chưa cấu hình thì KHÔNG đặt Reply-To', thu?.replyTo === null, String(thu?.replyTo));
  check('Chưa cấu hình thì chân thư không hứa gì về việc trả lời', thu?.text.includes(CAU_TRA_LOI) === false);
  check('Chân thư không rò địa chỉ giữ chỗ .local ra thư người dùng', thu?.text.includes('kidogame.local') === false);
  check(`Chưa cấu hình cũng không quay lại câu cũ "${CAU_CU}"`, thu?.text.includes(CAU_CU) === false);
  check('Vẫn còn dòng giới thiệu KidoGame ở chân thư', thu?.text.includes('gửi tự động từ KidoGame') === true);
}

// ---------------------------------------------------------------------------
console.log('\n── Dựng HTML từ chữ trần: không được nuốt đoạn cuối ─────────');

datOperator(true);
{
  /*
   * `/dev/thu/[chiSo]/html` gọi `dungHtmlTuText` trên thư đã lưu. Nếu hàm đó gỡ
   * chân thư bằng cách "bỏ đoạn cuối" thay vì so đúng chuỗi, thì một đoạn chữ trần
   * sẽ mất đúng đoạn cuối — mà đoạn cuối của mọi lá thư ở đây là chữ ký "KidoGame",
   * nên nhìn qua vẫn thấy hợp lý và không ai để ý.
   */
  const html = dungHtmlTuText(THAN, 'Thử');
  check('Chữ trần vẫn được thêm chân thư', demLan(html, CAU_TRA_LOI) === 1);
  check('Chữ trần KHÔNG mất đoạn cuối', html.includes('KidoGame'));
  check('Chữ trần giữ nguyên câu bảo trả lời thư', html.includes('trả lời thư này trước ngày đó'));
}

// ---------------------------------------------------------------------------
console.log('\n── Bất biến trong mã nguồn ──────────────────────────────────');

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = (p: string) => readFileSync(join(goc, p), 'utf8');
const mailTs = doc('apps/web/src/lib/mail.ts');

{
  /*
   * Hai transport, hai cú pháp KHÁC HẲN nhau, và cái sai thì im lặng: nodemailer
   * đọc `replyTo` (camelCase, chuỗi), Resend đọc `reply_to` (snake_case, mảng).
   * Gõ camelCase cho Resend thì API bỏ qua trường lạ và vẫn trả 200 — thư đi bình
   * thường, chỉ là không có Reply-To. Nên phải ghim từng tên một.
   */
  check('Transport SMTP đặt replyTo', /replyTo:\s*message\.replyTo/.test(mailTs));
  check('Transport Resend đặt reply_to (snake_case, mảng)', /reply_to:\s*\[message\.replyTo\]/.test(mailTs));
  /*
   * Ghim SỐ transport, không chỉ ghim hai cái đang có. Hai phép trên vẫn xanh
   * nguyên vẹn khi ai đó thêm một đường gửi thứ ba và quên cắm `Reply-To` vào —
   * đúng cách lỗi này đã xảy ra lần đầu. Con số đổi thì phép này đỏ, và người thêm
   * transport đọc được ngay là phải làm gì.
   */
  const soTransport = demLan(mailTs, 'async function sendVia');
  check('Đúng 2 transport, thêm cái thứ ba thì phải cắm Reply-To vào đó', soTransport === 2, `${soTransport} transport`);
  /*
   * Chân thư dựng từ MỘT hàm cho cả hai bản. Câu "không cần trả lời" ngày trước chỉ
   * nằm trong nhánh HTML, nên người sửa câu chữ đọc bản chữ thuần không bao giờ
   * thấy nó — và hai bản lệch nhau suốt mà không phép kiểm nào chạm tới.
   */
  check('Bản HTML lấy chân thư từ cùng hàm chanThu()', /\$\{esc\(chan\)\}/.test(mailTs));
  check('sendMail gắn chân thư đúng một chỗ', demLan(mailTs, '${chanThu()}') === 1);
}

{
  /*
   * Đếm số lá thư bảo "trả lời thư này". Con số không quan trọng bằng việc nó KHÁC
   * KHÔNG: chừng nào còn một lá thư nói câu ấy thì `Reply-To` còn là bắt buộc, và
   * ai định gỡ nó đi sẽ vấp phải phép kiểm này chứ không phải phát hiện sau ba
   * tháng qua một phụ huynh không nhận được hồi âm.
   */
  const nguon = ['apps/web/src/lib/takedown.ts', 'apps/web/src/lib/moderation.ts', 'apps/web/src/lib/xoa-gia-dinh.ts']
    .map(doc)
    .join('\n');
  const soLoiHua = demLan(nguon, 'trả lời thư này');
  check('Vẫn còn thư bảo người dùng "trả lời thư này"', soLoiHua > 0, `${soLoiHua} chỗ`);
}

{
  /*
   * Bẫy 0c của phiên trước: một service trong compose CHỈ có đúng những biến nó
   * được khai, dùng lại image của `web` không kéo theo env của `web`. Service
   * `prune` tự gửi thư nhắc việc quá hạn và thư báo game sắp bị xoá — cả hai đều
   * bảo người nhận trả lời. Thiếu `OPERATOR_EMAIL` ở riêng service đó thì đúng
   * những lá thư gấp nhất là những lá không có đường trả lời.
   */
  const compose = doc('infra/docker-compose.yml');
  /*
   * Đếm theo DÒNG KHAI, không đếm số lần chuỗi xuất hiện: dòng khai có dạng
   * `OPERATOR_EMAIL: ${OPERATOR_EMAIL:-}`, tức tên biến nằm hai lần trên cùng một
   * dòng. Đếm chuỗi thì ra gấp đôi, và con số đó vẫn "trông đúng" nếu một service
   * khai hai lần còn service kia không khai lần nào.
   */
  const soDongKhai = compose.split('\n').filter((d) => /^\s*OPERATOR_EMAIL:/.test(d)).length;
  check('Compose khai OPERATOR_EMAIL cho cả hai service gửi thư (web và prune)', soDongKhai === 2, `${soDongKhai} dòng khai`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
