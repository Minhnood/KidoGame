import { NextResponse } from 'next/server';
import { Sb3Error, LIMITS } from '@kidogame/sb3';
import { taoBanXemThu } from '@/lib/ingest';
import { guiSuKien, nhomDungLuong } from '@/lib/mixpanel';
import { getActor } from '@/lib/session';

// Đóng gói cần Node API (sharp, zlib, fs) — không chạy được trên edge runtime.
export const runtime = 'nodejs';
// Đóng gói một project lớn có thể mất vài giây.
export const maxDuration = 60;

/**
 * Bước 1 của việc đăng game: nhận file, đóng gói, trả về một BẢN XEM THỬ.
 *
 * Chỉ cần file: bé chọn file là trang gọi route này ngay, trước khi có tên game. KHÔNG
 * tạo game. Bé chơi thử, chọn bìa, điền tên rồi mới bấm "Đăng game" — lúc đó
 * `/api/upload/dang` mới tạo game công khai và báo cho bố mẹ.
 */
export async function POST(request: Request) {
  /*
   * XÉT ĐĂNG NHẬP TRƯỚC KHI ĐỌC BODY. Thứ tự này quan trọng, đừng đảo lại.
   *
   * Bản trước gọi `request.formData()` ngay dòng đầu, nghĩa là một request KHÔNG
   * đăng nhập vẫn khiến server đọc trọn body vào memory rồi mới bị từ chối. Cổng
   * duy nhất mở cho người lạ mà lại làm việc đắt nhất trước khi kiểm quyền.
   *
   * Nó cũng làm dòng comment ở dưới ("chặn theo dung lượng TRƯỚC khi đọc vào
   * memory") thành sai sự thật, vì `formData()` đã đọc xong từ trước đó — và một
   * comment sai còn tệ hơn không có comment, nó dạy người sau tin nhầm.
   */
  // Chỉ tài khoản của BÉ được đăng game. Phụ huynh không đăng hộ — game phải
  // gắn đúng với bé để trang quản lý của phụ huynh và phần ghi công có nghĩa.
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json(
      { error: 'Bé cần đăng nhập trước khi đăng game nhé.', code: 'UNAUTHENTICATED' },
      { status: 401 }
    );
  }
  if (actor.kind !== 'child') {
    return NextResponse.json(
      { error: 'Game cần được đăng từ tài khoản của bé, không phải tài khoản bố mẹ.', code: 'WRONG_ACTOR' },
      { status: 403 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Hãy chọn file .sb3 của bé nhé.' }, { status: 400 });
  }

  /*
   * Chặn theo dung lượng trước khi ĐÓNG GÓI — không phải trước khi đọc vào memory.
   *
   * `formData()` ở trên đã đọc xong body rồi, nên `file.size` chỉ biết được sau đó.
   * Cái phép kiểm này cứu được là bước đắt tiền phía sau: giải nén, chuẩn hoá,
   * đóng gói qua packager, sinh thumbnail bằng sharp.
   *
   * Muốn chặn thật sự trước khi đọc vào memory thì phải chặn ở tầng Caddy
   * (`request_body max_size`) — Next không cho xem body theo từng phần ở đây.
   */
  if (file.size > LIMITS.MAX_SB3_BYTES) {
    return NextResponse.json(
      { error: `File quá lớn (tối đa ${Math.floor(LIMITS.MAX_SB3_BYTES / 1024 / 1024)}MB).` },
      { status: 413 }
    );
  }

  /*
   * Bước 1 của phễu (xem `lib/mixpanel.ts`). Đặt SAU khi đã biết đây là bé thật và file
   * hợp lệ về dung lượng: đếm cả request của người lạ thì phễu đếm cả bot.
   */
  const batDau = Date.now();
  guiSuKien('chon-file', actor.id, { nhom_dung_luong: nhomDungLuong(file.size) });

  try {
    const result = await taoBanXemThu({
      sb3: Buffer.from(await file.arrayBuffer()),
      childId: actor.id,
    });
    guiSuKien('xem-thu-xong', actor.id, {
      so_bia: Array.isArray(result.biaUrls) ? result.biaUrls.length : 0,
      mili_giay: Date.now() - batDau,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof Sb3Error) {
      // `detail` chỉ để log phía server, không bao giờ lộ ra client.
      console.warn(`[upload] từ chối ${e.code}: ${e.detail ?? e.message}`);
      guiSuKien('dang-loi', actor.id, { ma_loi: e.code, mili_giay: Date.now() - batDau });
      const status = e.code === 'RATE_LIMITED' ? 429 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error('[upload] lỗi không lường trước:', e);
    guiSuKien('dang-loi', actor.id, { ma_loi: 'KHONG_RO', mili_giay: Date.now() - batDau });
    return NextResponse.json({ error: 'Có lỗi xảy ra, thử lại sau nhé.' }, { status: 500 });
  }
}
