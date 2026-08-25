import { NextResponse } from 'next/server';
import { Sb3Error, LIMITS } from '@kidogame/sb3';
import { ingestGame } from '@/lib/ingest';
import { getActor } from '@/lib/session';

// Đóng gói cần Node API (sharp, zlib, fs) — không chạy được trên edge runtime.
export const runtime = 'nodejs';
// Đóng gói một project lớn có thể mất vài giây.
export const maxDuration = 60;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 });
  }

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

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Hãy chọn file .sb3 của bé nhé.' }, { status: 400 });
  }

  // Chặn theo dung lượng TRƯỚC khi đọc vào memory.
  if (file.size > LIMITS.MAX_SB3_BYTES) {
    return NextResponse.json(
      { error: `File quá lớn (tối đa ${Math.floor(LIMITS.MAX_SB3_BYTES / 1024 / 1024)}MB).` },
      { status: 413 }
    );
  }

  const title = String(form.get('title') ?? '');
  const description = String(form.get('description') ?? '');

  try {
    const result = await ingestGame({
      sb3: Buffer.from(await file.arrayBuffer()),
      title,
      description,
      childId: actor.id,
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
