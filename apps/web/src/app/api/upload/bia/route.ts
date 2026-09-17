import { NextResponse } from 'next/server';
import { MAX_COVER_IMAGE_BYTES, Sb3Error } from '@kidogame/sb3';
import { themBiaTuTai } from '@/lib/ingest';
import { getActor } from '@/lib/session';

// Giải mã ảnh cần sharp (Node API).
export const runtime = 'nodejs';

/**
 * Bé tải ảnh riêng làm bìa cho bản xem thử đang mở.
 *
 * Xét đăng nhập TRƯỚC khi đọc body, cùng lý do với `/api/upload`: người lạ không được
 * khiến server đọc cả một ảnh vào bộ nhớ rồi mới bị từ chối.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json(
      { error: 'Bé cần đăng nhập trước nhé.', code: 'UNAUTHENTICATED' },
      { status: 401 }
    );
  }
  if (actor.kind !== 'child') {
    return NextResponse.json(
      { error: 'Ảnh bìa cần được tải từ tài khoản của bé.', code: 'WRONG_ACTOR' },
      { status: 403 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 });
  }

  const anh = form.get('anh');
  if (!(anh instanceof File)) {
    return NextResponse.json({ error: 'Chọn một ảnh nhé.' }, { status: 400 });
  }
  if (anh.size > MAX_COVER_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `Ảnh quá lớn (tối đa ${MAX_COVER_IMAGE_BYTES / 1024 / 1024}MB).` },
      { status: 413 }
    );
  }

  try {
    const result = await themBiaTuTai(
      String(form.get('maXemThu') ?? ''),
      actor.id,
      Buffer.from(await anh.arrayBuffer())
    );
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof Sb3Error) {
      const status = e.code === 'RATE_LIMITED' ? 429 : e.code === 'PREVIEW_EXPIRED' ? 410 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error('[upload/bia] lỗi không lường trước:', e);
    return NextResponse.json({ error: 'Có lỗi xảy ra, thử lại sau nhé.' }, { status: 500 });
  }
}
