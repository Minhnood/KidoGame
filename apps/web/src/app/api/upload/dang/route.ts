import { NextResponse } from 'next/server';
import { Sb3Error } from '@kidogame/sb3';
import { dangBanXemThu } from '@/lib/ingest';
import { getActor } from '@/lib/session';

/**
 * Bước 2 của việc đăng game: bé bấm "Đăng game" sau khi chơi thử.
 *
 * Chỉ nhận MÃ bản xem thử, không nhận tên hay file: đăng đúng cái bé vừa thử. Mọi thứ
 * còn lại (bản thử của ai, còn hạn không, file còn không) do `dangBanXemThu` kiểm.
 */
export async function POST(request: Request) {
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

  let maXemThu = '';
  try {
    const body = (await request.json()) as { maXemThu?: unknown };
    maXemThu = typeof body.maXemThu === 'string' ? body.maXemThu : '';
  } catch {
    return NextResponse.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 });
  }

  try {
    const result = await dangBanXemThu(maXemThu, actor.id);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof Sb3Error) {
      const status = e.code === 'RATE_LIMITED' ? 429 : e.code === 'PREVIEW_EXPIRED' ? 410 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error('[upload/dang] lỗi không lường trước:', e);
    return NextResponse.json({ error: 'Có lỗi xảy ra, thử lại sau nhé.' }, { status: 500 });
  }
}
