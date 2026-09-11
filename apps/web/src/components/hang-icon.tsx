'use client';

import { useState, useTransition } from 'react';
import { thaIconAction } from '@/lib/actions';
import { ICONS, type TomTatPhanUng } from '@/lib/phan-ung';

/**
 * Hàng icon dưới game: thả, đổi, gỡ.
 *
 * BA KIỂU NGƯỜI XEM, ba cách hiện:
 *   - bé đang đăng nhập  -> bấm được
 *   - phụ huynh / khách  -> thấy số, không bấm được (xem `model Reaction`)
 *   - game của chính bé  -> vẫn bấm được, cố ý (lý do ở `thaIcon`)
 *
 * VÌ SAO CẬP NHẬT LẠC QUAN. Một cú chạm phải đổi màu NGAY. Chờ server rồi mới sáng
 * lên thì trên mạng 3G ở trường học, đứa trẻ bấm lại lần nữa vì tưởng hụt — và cú
 * bấm thứ hai chính là lệnh GỠ. Nó thả tim, thấy không có gì xảy ra, bấm lại, rồi
 * tim biến mất. Nhìn từ phía đứa trẻ đó thì nút này hỏng.
 *
 * Server trả về tóm tắt THẬT sau mỗi lần bấm, nên con số lạc quan chỉ sống vài trăm
 * mili giây rồi bị thay bằng số đúng. Trượt thì quay lại trạng thái cũ và nói một
 * câu — không im lặng, vì im lặng sau một cú chạm cũng là "nút này hỏng".
 */
export function HangIcon({
  gameId,
  banDau,
  thaDuoc,
}: {
  gameId: string;
  banDau: TomTatPhanUng;
  /** Bé đang đăng nhập hay không. Sai thì hàng này chỉ để đọc. */
  thaDuoc: boolean;
}) {
  const [tomTat, setTomTat] = useState(banDau);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, startTransition] = useTransition();

  function bam(ma: string) {
    if (!thaDuoc) return;

    // Dựng trạng thái lạc quan bằng ĐÚNG ba nhánh mà `thaIcon` trên server dùng —
    // giữ hai bên cùng một luật, nếu không thì con số nhảy một nhịp lúc server trả
    // lời và người dùng thấy nó "tự sửa", trông như vừa bấm sai.
    const cu = tomTat.cuaToi;
    const dem = { ...tomTat.dem };
    if (cu === ma) {
      dem[ma] = Math.max(0, (dem[ma] ?? 1) - 1);
    } else {
      if (cu) dem[cu] = Math.max(0, (dem[cu] ?? 1) - 1);
      dem[ma] = (dem[ma] ?? 0) + 1;
    }
    for (const k of Object.keys(dem)) if (dem[k] === 0) delete dem[k];

    const truoc = tomTat;
    setTomTat({
      dem,
      tong: Object.values(dem).reduce((a, b) => a + b, 0),
      cuaToi: cu === ma ? null : ma,
    });
    setLoi(null);

    startTransition(async () => {
      const kq = await thaIconAction(gameId, ma);
      if ('error' in kq) {
        setTomTat(truoc);
        setLoi(kq.error);
      } else {
        setTomTat(kq.tomTat);
      }
    });
  }

  return (
    <div data-testid="hang-icon">
      <div className="flex flex-wrap items-center gap-2">
        {ICONS.map((icon) => {
          const so = tomTat.dem[icon.ma] ?? 0;
          const dangChon = tomTat.cuaToi === icon.ma;
          return (
            <button
              key={icon.ma}
              type="button"
              onClick={() => bam(icon.ma)}
              disabled={!thaDuoc || dangGui}
              aria-pressed={thaDuoc ? dangChon : undefined}
              /*
               * Nhãn mang CẢ tên lẫn số. Nút chỉ có emoji thì trình đọc màn hình
               * đọc ra tên Unicode tiếng Anh ("red heart"), tức đứa trẻ dùng trình
               * đọc nghe một câu khác hẳn đứa trẻ nhìn màn hình.
               */
              aria-label={`${icon.nhan}${so > 0 ? `, ${so} bạn` : ''}`}
              title={icon.nhan}
              data-testid={`icon-${icon.ma}`}
              data-chon={dangChon ? 'co' : 'khong'}
              /*
               * min-h/min-w 44px: đây là ngón tay trẻ con trên điện thoại. Nhỏ hơn
               * thì bấm nhầm sang icon bên cạnh, mà bấm nhầm ở đây là thả nhầm một
               * lời khen rồi phải bấm thêm lần nữa để gỡ.
               */
              className={[
                'inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-full border px-3 py-1.5',
                'text-lg leading-none transition',
                dangChon
                  ? 'border-accent-text bg-accent/15 text-ink'
                  : 'border-border bg-surface text-ink',
                thaDuoc ? 'cursor-pointer hover:border-accent-text' : 'cursor-default',
                dangGui ? 'opacity-70' : '',
              ].join(' ')}
            >
              <span aria-hidden="true">{icon.ky_tu}</span>
              {/* Số 0 KHÔNG hiện. Một hàng năm con số 0 dưới game của một đứa trẻ
                  đọc lên là "chưa ai thích cái này", lặp lại năm lần. */}
              {so > 0 && <span className="text-sm tabular-nums text-ink-soft">{so}</span>}
            </button>
          );
        })}
      </div>

      {loi && (
        <p className="mt-2 text-sm text-danger" role="status" data-testid="icon-loi">
          {loi}
        </p>
      )}

      {!thaDuoc && tomTat.tong === 0 && (
        <p className="mt-2 text-sm text-ink-soft" data-testid="icon-goi-y">
          Đăng nhập bằng tài khoản của bé để thả icon nhé!
        </p>
      )}
    </div>
  );
}
