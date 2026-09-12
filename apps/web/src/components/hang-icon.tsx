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
  /** Đã bấm mà không thả được -> nói vì sao. Không phải lỗi, nên không đỏ. */
  const [nhac, setNhac] = useState(false);
  /**
   * Mã icon VỪA được thả, để chạy cú nảy — rồi tự xoá khi hết hoạt ảnh.
   *
   * Phải tự xoá, không được giữ: lớp `kg-icon-na` còn nằm trên phần tử thì lần thả
   * sau vào CÙNG icon đó sẽ không chạy lại hoạt ảnh nào cả (trình duyệt chỉ khởi
   * động animation khi lớp được GẮN vào, không phải khi nó đang có sẵn). Bé gỡ tim
   * rồi thả tim lại — lần thứ hai im re.
   *
   * Chỉ đặt lúc THẢ hoặc ĐỔI, không đặt lúc GỠ: gỡ là rút lại, mà ăn mừng một cú rút
   * lại thì đọc ra như trêu.
   */
  const [vuaTha, setVuaTha] = useState<string | null>(null);
  const [dangGui, startTransition] = useTransition();

  function bam(ma: string) {
    /*
     * Người không thả được BẤM ĐƯỢC, và nhận lại một câu.
     *
     * Trước đây nút này `disabled`, nên cú bấm rơi vào hư không — đúng, nhưng cũng
     * câm: đứa trẻ chưa đăng nhập bấm tim, không gì xảy ra, và nó không có cách nào
     * biết là do chưa đăng nhập chứ không phải do trang hỏng. Câu gợi ý ở cuối hàng
     * chỉ hiện khi CHƯA AI thả gì, tức đúng lúc hàng có sẵn vài con số thì nó biến
     * mất — và đó lại là lúc đứa trẻ muốn thả nhất.
     */
    if (!thaDuoc) {
      setNhac(true);
      return;
    }
    setNhac(false);

    // Dựng trạng thái lạc quan bằng ĐÚNG ba nhánh mà `thaIcon` trên server dùng —
    // giữ hai bên cùng một luật, nếu không thì con số nhảy một nhịp lúc server trả
    // lời và người dùng thấy nó "tự sửa", trông như vừa bấm sai.
    const cu = tomTat.cuaToi;
    const dem = { ...tomTat.dem };
    if (cu === ma) {
      dem[ma] = Math.max(0, (dem[ma] ?? 1) - 1);
      setVuaTha(null);
    } else {
      setVuaTha(ma);
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
            /*
             * Bọc thêm một lớp CHỈ để treo cái tên nổi lên trên. Không gộp vào nút
             * được: bong bóng phải nằm NGOÀI nút thì mới `pointer-events: none` mà
             * không mất hover của chính nút, và nút thì `overflow` theo viền bo tròn.
             */
            <span key={icon.ma} className="kg-icon-boc">
              <button
                type="button"
                onClick={() => bam(icon.ma)}
                /*
                 * CHỈ `disabled` lúc ĐANG GỬI. Người không thả được thì chặn bằng
                 * `aria-disabled` + nhánh `if (!thaDuoc) return` ở trên.
                 *
                 * Vì sao không dùng `disabled` cho họ: một nút `disabled` không nhận
                 * chuột và không tab tới được, nên khách và phụ huynh mất luôn cái
                 * tên icon — mà đó chính là thứ duy nhất hàng icon còn nói được với
                 * người không thả được. Chốt thật vẫn nằm ở server (`thaIconAction`),
                 * chưa bao giờ nằm ở thuộc tính này: `e2e-icon` gỡ rào giao diện rồi
                 * bấm thật đúng để chứng minh điều đó.
                 */
                disabled={dangGui}
                aria-disabled={thaDuoc ? undefined : true}
                aria-pressed={thaDuoc ? dangChon : undefined}
                /*
                 * Nhãn mang CẢ tên lẫn số. Nút chỉ có emoji thì trình đọc màn hình
                 * đọc ra tên Unicode tiếng Anh ("red heart"), tức đứa trẻ dùng trình
                 * đọc nghe một câu khác hẳn đứa trẻ nhìn màn hình.
                 */
                aria-label={`${icon.nhan}${so > 0 ? `, ${so} bạn` : ''}`}
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
                  /*
                   * `kg-icon-bam` là thứ bật hiệu ứng NHẤC LÊN, và chỉ nó. Cái tên
                   * hiện ra thì treo ở lớp bọc, nên người không thả được vẫn thấy.
                   *
                   * HAI NỀN HOVER KHÁC NHAU, và tách ra là bắt buộc chứ không phải
                   * cho đẹp. Một `hover:bg-accent/10` dùng chung thì với nút ĐANG
                   * CHỌN (nền sẵn `accent/15`) nó là 15% → 10%, tức rê chuột vào làm
                   * nút NHẠT ĐI. Mà đúng nút đó là nút để GỠ — đường rút lại duy nhất
                   * — nên phản hồi của nó không được đi lùi.
                   */
                  thaDuoc
                    ? dangChon
                      ? 'kg-icon-bam cursor-pointer hover:bg-accent/20'
                      : 'kg-icon-bam cursor-pointer hover:border-accent-text hover:bg-accent/10'
                    : 'cursor-default',
                  dangGui ? 'opacity-70' : '',
                ].join(' ')}
              >
                <span
                  className={`kg-icon-hinh${vuaTha === icon.ma ? ' kg-icon-na' : ''}`}
                  /* Gỡ lớp ngay khi hoạt ảnh kết thúc, để lần thả sau vào cùng icon
                     này còn chạy lại được. `onAnimationEnd` chứ không phải
                     `setTimeout(420)`: hết giờ là đoán theo một con số chép tay từ
                     CSS, và hai bên sẽ lệch ngay lần đầu ai đó chỉnh nhịp bên kia.

                     Với người xin ít chuyển động thì `animation: none` nên sự kiện
                     này KHÔNG bao giờ bắn, và lớp nằm lại vĩnh viễn. Vô hại, cố ý:
                     lớp đó lúc ấy không vẽ ra gì cả. */
                  onAnimationEnd={() => setVuaTha((v) => (v === icon.ma ? null : v))}
                  aria-hidden="true"
                >
                  {icon.ky_tu}
                </span>
                {/* Số 0 KHÔNG hiện. Một hàng năm con số 0 dưới game của một đứa trẻ
                    đọc lên là "chưa ai thích cái này", lặp lại năm lần. */}
                {so > 0 && <span className="text-sm tabular-nums text-ink-soft">{so}</span>}
              </button>
              {/* `aria-hidden`: chữ này đã nằm trong `aria-label` của nút rồi. Để nó
                  lộ ra là trình đọc màn hình đọc tên icon hai lần liền nhau. */}
              <span className="kg-icon-nhan" aria-hidden="true">
                {icon.nhan}
              </span>
            </span>
          );
        })}
      </div>

      {loi && (
        <p className="mt-2 text-sm text-danger" role="status" data-testid="icon-loi">
          {loi}
        </p>
      )}

      {/* Hiện sẵn khi hàng còn trống, hoặc ngay khi có người bấm thử. `role=status`
          để trình đọc màn hình đọc lên câu này sau cú bấm, chứ không im. */}
      {!thaDuoc && (tomTat.tong === 0 || nhac) && (
        <p className="mt-2 text-sm text-ink-soft" role="status" data-testid="icon-goi-y">
          Đăng nhập bằng tài khoản của bé để thả icon nhé!
        </p>
      )}
    </div>
  );
}
