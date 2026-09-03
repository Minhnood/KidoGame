import { NextResponse } from 'next/server';
import { Sb3Error, LIMITS } from '@kidogame/sb3';
import { ingestGame, MAX_TAGS_PER_GAME } from '@/lib/ingest';
import { getActor } from '@/lib/session';

// Đóng gói cần Node API (sharp, zlib, fs) — không chạy được trên edge runtime.
export const runtime = 'nodejs';
// Đóng gói một project lớn có thể mất vài giây.
export const maxDuration = 60;

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

  const title = String(form.get('title') ?? '');
  const description = String(form.get('description') ?? '');

  /*
   * Tag do bé tick, nên không bao giờ tin thẳng: chỉ nhận slug, cắt còn tối đa 2,
   * và `ingestGame` còn đối chiếu lại với bảng Tag. Slug lạ bị bỏ im lặng chứ
   * không báo lỗi — bé không làm gì sai, và game vẫn nên đăng được.
   */
  const tagSlugs = form
    .getAll('tags')
    .map((v) => String(v))
    .filter((v) => /^[a-z0-9-]{1,40}$/.test(v))
    .slice(0, MAX_TAGS_PER_GAME);

  try {
    const result = await ingestGame({
      sb3: Buffer.from(await file.arrayBuffer()),
      title,
      description,
      childId: actor.id,
      tagSlugs,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof Sb3Error) {
      // `detail` chỉ để log phía server, không bao giờ lộ ra client.
      console.warn(`[upload] từ chối ${e.code}: ${e.detail ?? e.message}`);
      const status = e.code === 'RATE_LIMITED' ? 429 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error('[upload] lỗi không lường trước:', e);
    return NextResponse.json({ error: 'Có lỗi xảy ra, thử lại sau nhé.' }, { status: 500 });
  }
}
