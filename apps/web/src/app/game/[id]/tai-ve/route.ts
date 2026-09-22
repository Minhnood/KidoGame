import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { objectPath } from '@/lib/storage';
import { docGameDuocXem } from '../quyen-xem';

/**
 * Tải file .sb3 về, MANG TÊN GAME.
 *
 * VÌ SAO KHÔNG TRỎ THẲNG SANG PLAYER ORIGIN NHƯ TRƯỚC. Kho file đặt tên theo sha256
 * của nội dung, nên nút cũ tải về một file tên `215020a1157244…sb3`. Bé tải ba game
 * của ba bạn là có ba chuỗi băm không đọc được trong thư mục Tải về, và không cách nào
 * biết cái nào là cái nào. Player origin là kho file tĩnh, nó KHÔNG biết tên game —
 * chỉ app biết, vì tên nằm trong database. Nên việc đặt tên phải làm ở đây.
 *
 * Đánh đổi đã chấp nhận: file đi qua Node thay vì đi thẳng từ đĩa như file tĩnh. Đọc
 * theo dòng chứ không nạp cả file vào RAM (`createReadStream`), nên một game 50MB vẫn
 * chỉ tốn vài chục KB bộ nhớ; cái mất là bộ nhớ đệm trình duyệt không còn dùng được
 * kiểu `immutable`, và đó là đúng ý — game bị gỡ thì bản tải về không nên vẫn lấy được.
 *
 * LUẬT AI ĐƯỢC XEM DÙNG CHUNG với trang game (`docGameDuocXem`), không viết lại. Viết
 * lại là mở đường cho hai chỗ lệch nhau, và chỗ lệch sẽ nằm đúng ở game đã bị gỡ.
 */

export const dynamic = 'force-dynamic';

/**
 * Bỏ dấu, thay mọi thứ lạ bằng gạch dưới — bản dự phòng cho `filename=`.
 *
 * Trình duyệt hiện nay đều đọc `filename*` (UTF-8), nhưng RFC 6266 bảo gửi kèm cả bản
 * ASCII cho phần mềm cũ, và một cái tên xấu vẫn hơn là file không tải được.
 */
function tenAscii(title: string): string {
  const khongDau = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
  const sach = khongDau.replace(/[^A-Za-z0-9 ._-]/g, '_').trim();
  return sach || 'game';
}

/**
 * Làm sạch tên game để dùng làm tên file.
 *
 * Ba nhóm ký tự bị bỏ, mỗi nhóm một lý do khác nhau:
 *  - `\r\n` và ký tự điều khiển: header HTTP xuống dòng là chèn được header khác.
 *  - `/ \ : * ? " < > |`: Windows và macOS từ chối, file rơi vào tên rác hoặc lưu hỏng.
 *  - Dấu chấm và khoảng trắng ở cuối: Windows lặng lẽ cắt bỏ, nên `.sb3` có thể mất.
 */
function tenFile(title: string): string {
  const sach = title
    /* Ký tự điều khiển thành KHOẢNG TRẮNG, không phải xoá hẳn: tên "Mèo\nbay" mà xoá
       thì thành "Mèobay", hai chữ dính nhau. Dòng `\s+` ngay dưới gom lại sau. */
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80);
  return sach || 'game';
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const duocXem = await docGameDuocXem(id);
  /* Cùng câu trả lời với trang game: không được xem thì coi như không tồn tại. */
  if (!duocXem) return new Response('Không có game này', { status: 404 });
  const { game } = duocXem;

  const duongDan = objectPath('sb3', game.sb3Sha256);
  let co;
  try {
    co = await stat(duongDan);
  } catch {
    /* File mất mà hàng trong DB còn — không bịa ra một file rỗng, vì trình duyệt sẽ
       lưu nó xuống như một game hỏng và bé tưởng game của mình hỏng. */
    return new Response('File game không còn trên máy chủ', { status: 404 });
  }

  const ten = tenFile(game.title);
  const web = Readable.toWeb(createReadStream(duongDan)) as ReadableStream<Uint8Array>;

  return new Response(web, {
    headers: {
      /* KHÔNG bao giờ để text/html: file do trẻ khác tải lên. `nosniff` chặn nốt việc
         trình duyệt tự đoán kiểu — cùng luật với player origin. */
      'Content-Type': 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': String(co.size),
      'Content-Disposition':
        `attachment; filename="${tenAscii(ten)}.sb3"; ` +
        `filename*=UTF-8''${encodeURIComponent(`${ten}.sb3`)}`,
      /* Riêng tư: game LIMITED hay game đang ẩn của con chỉ một số người xem được,
         nên proxy dùng chung không được giữ lại bản sao. */
      'Cache-Control': 'private, no-store',
    },
  });
}
