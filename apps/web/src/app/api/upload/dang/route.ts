import { NextResponse } from 'next/server';
import { Sb3Error } from '@kidogame/sb3';
import { dangBanXemThu, MAX_TAGS_PER_GAME } from '@/lib/ingest';
import { guiSuKien } from '@/lib/mixpanel';
import { getActor } from '@/lib/session';

/**
 * Bước 2 của việc đăng game: bé bấm "Đăng game" sau khi chơi thử.
 *
 * Nhận MÃ bản xem thử, CHỈ SỐ bìa đã chọn, và tên / mô tả / loại game bé vừa điền. KHÔNG
 * nhận file: file game là đúng cái bé vừa chơi thử, nằm sẵn trong bản xem thử. Mọi thứ
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
  let bia = 0;
  let title = '';
  let description = '';
  let tagSlugs: string[] = [];
  try {
    const body = (await request.json()) as Record<string, unknown>;
    maXemThu = typeof body.maXemThu === 'string' ? body.maXemThu : '';
    // Không gửi thì là bìa mặc định; gửi sai kiểu thì để `dangBanXemThu` từ chối.
    bia = body.bia === undefined ? 0 : typeof body.bia === 'number' ? body.bia : -1;
    title = typeof body.title === 'string' ? body.title : '';
    description = typeof body.description === 'string' ? body.description : '';
    /*
     * Tag do bé tick, nên không bao giờ tin thẳng: chỉ nhận slug, cắt còn tối đa 2,
     * và `dangBanXemThu` còn đối chiếu lại với bảng Tag. Slug lạ bị bỏ im lặng chứ
     * không báo lỗi — bé không làm gì sai, và game vẫn nên đăng được.
     */
    tagSlugs = (Array.isArray(body.tags) ? body.tags : [])
      .map((v) => String(v))
      .filter((v) => /^[a-z0-9-]{1,40}$/.test(v))
      .slice(0, MAX_TAGS_PER_GAME);
  } catch {
    return NextResponse.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 });
  }

  /* Bước 3 của phễu: bé đã bấm "Đăng game". Gửi TRƯỚC khi tạo game, vì cái cần đo là
     bé có bấm hay không — tạo hỏng thì `dang-loi` ngay dưới sẽ nói. */
  const batDau = Date.now();
  guiSuKien('bam-dang', actor.id, { bia_tu_tai: bia > 0 });

  try {
    const result = await dangBanXemThu(maXemThu, actor.id, { title, description, tagSlugs, chiSoBia: bia });
    guiSuKien('dang-xong', actor.id, { mili_giay: Date.now() - batDau });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof Sb3Error) {
      const status = e.code === 'RATE_LIMITED' ? 429 : e.code === 'PREVIEW_EXPIRED' ? 410 : 400;
      guiSuKien('dang-loi', actor.id, { ma_loi: e.code, mili_giay: Date.now() - batDau });
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    guiSuKien('dang-loi', actor.id, { ma_loi: 'KHONG_RO', mili_giay: Date.now() - batDau });
    console.error('[upload/dang] lỗi không lường trước:', e);
    return NextResponse.json({ error: 'Có lỗi xảy ra, thử lại sau nhé.' }, { status: 500 });
  }
}
