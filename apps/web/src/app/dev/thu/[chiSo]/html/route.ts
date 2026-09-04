/**
 * Trả về BẢN HTML của một lá thư trong hộp thư dev, để mở ở tab mới.
 *
 * VÌ SAO KHÔNG NHÚNG BẰNG IFRAME NGAY TRONG TRANG. Nhúng thì tiện hơn — thấy ngay
 * không phải bấm — nhưng iframe `srcdoc` chịu CSP của trang cha, và `frame-src` của
 * app chỉ cho phép đúng player origin. Muốn nhúng thì phải nới `frame-src` cho cả
 * site, chỉ để phục vụ một trang chỉ tồn tại ở dev. Một trang dev không được làm yếu
 * chính sách của production; mở tab mới thì không đổi gì cả.
 *
 * Kèm lợi ích thật: tab mới cho thấy lá thư ở đúng bề rộng cửa sổ, tức gần với cái
 * phụ huynh nhìn thấy hơn là một ô nhỏ nhúng trong trang.
 *
 * HAI LỚP CHẶN Ở PRODUCTION, cùng lý lẽ với trang `/dev/thu`:
 *
 *  1. 404 ngay dưới đây theo `NODE_ENV`. Không phải 403 — 403 là xác nhận có tồn tại.
 *  2. Hộp thư trong RAM chỉ được nạp ở dev, nên ở production nó luôn rỗng.
 *
 * Lớp 2 một mình đã đủ, nhưng route là MỘT ĐIỂM VÀO RIÊNG: `notFound()` của trang
 * không che cho nó, đúng như server action xoá hộp thư đã phải có chốt riêng.
 */
import { docHopThuDev, dungHtmlTuText } from '@/lib/mail';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ chiSo: string }> }) {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Không tìm thấy', { status: 404 });
  }

  const { chiSo } = await ctx.params;
  const i = Number(chiSo);
  const thu = docHopThuDev();

  /*
   * Chỉ số đếm theo thứ tự đang bày trên trang, tức mới nhất trước. Nghĩa là gửi
   * thêm một lá rồi bấm lại link cũ sẽ ra lá khác — chấp nhận ở một trang dev, và
   * đổi sang khoá bền hơn (thời điểm gửi) thì phải nhét cái khoá đó vào URL, tức là
   * một token nữa nằm trong thanh địa chỉ để rò ra history của trình duyệt.
   */
  if (!Number.isInteger(i) || i < 0 || i >= thu.length) {
    return new Response('Không có lá thư nào ở vị trí này. Quay lại /dev/thu.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const t = thu[i];

  return new Response(dungHtmlTuText(t.text, t.subject), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Hộp thư nằm trong RAM và đổi liên tục; một bản cache là một lá thư cũ hiện ra
      // sau khi người ta vừa bấm gửi lại.
      'cache-control': 'no-store',
    },
  });
}
