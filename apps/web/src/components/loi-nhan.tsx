'use client';

import { useState, useTransition } from 'react';
import { nhanLoiAction } from '@/lib/actions';
import { LOI_NHAN, SO_DONG_HIEN, timCau, type TomTatLoiNhan } from '@/lib/loi-nhan';

/**
 * Lời nhắn dưới game: chọn một câu trong bộ, đổi câu, gỡ.
 *
 * BỐN KIỂU NGƯỜI XEM, bốn cách hiện:
 *   - bé đang đăng nhập     -> chọn được
 *   - game của CHÍNH bé đó  -> đọc được, không có hàng nút (lý do ở `nhanLoi`)
 *   - phụ huynh / khách     -> đọc được, không chọn được
 *   - chưa ai nhắn          -> một câu mời, không phải một khoảng trống
 *
 * Cập nhật lạc quan vì đúng lý do đã ghi ở `hang-icon.tsx`: chờ server rồi mới đổi
 * thì trên wifi trường học đứa trẻ tưởng hụt và bấm lại — mà cú bấm thứ hai vào câu
 * đang sáng chính là lệnh GỠ.
 *
 * Ở đây việc dựng trạng thái lạc quan khó hơn hàng icon một bậc: icon chỉ cần cộng
 * trừ một con số, còn cái này phải chèn đúng DÒNG mang tên mình vào đúng chỗ. Nên
 * component cần biết `tenToi` và `childIdToi` — không phải để kiểm tra quyền gì cả
 * (server không tin gì từ đây), chỉ để vẽ ra dòng mà server sắp trả về.
 */
export function LoiNhan({
  gameId,
  banDau,
  nhanDuoc,
  laGameCuaToi,
  tenToi,
  childIdToi,
}: {
  gameId: string;
  banDau: TomTatLoiNhan;
  /** Bé đang đăng nhập VÀ không phải chủ game. Sai thì khối này chỉ để đọc. */
  nhanDuoc: boolean;
  /** Người xem là chủ của game này — hiện câu giải thích thay cho hàng nút. */
  laGameCuaToi: boolean;
  tenToi: string | null;
  childIdToi: string | null;
}) {
  const [tomTat, setTomTat] = useState(banDau);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, startTransition] = useTransition();

  function bam(ma: string) {
    if (!nhanDuoc || !childIdToi) return;

    const cu = tomTat.cuaToi;
    // Dựng bằng ĐÚNG ba nhánh server dùng — lệch một nhánh thì con số tự sửa lại
    // khi server trả lời, và người dùng thấy như mình vừa bấm sai.
    let danhSach = tomTat.danhSach.filter((d) => d.childId !== childIdToi);
    let tong = tomTat.tong;

    if (cu === ma) {
      tong = Math.max(0, tong - 1);
    } else {
      // Mới nhất trước, nên dòng của mình lên đầu — kể cả khi chỉ ĐỔI câu, vì
      // `updatedAt` của hàng cũng mới lại. Sai chỗ này thì dòng nhảy vị trí lúc
      // server trả lời.
      danhSach = [{ childId: childIdToi, tenBe: tenToi ?? 'Bạn', cau: ma }, ...danhSach];
      if (!cu) tong += 1;
    }

    const truoc = tomTat;
    setTomTat({ danhSach: danhSach.slice(0, SO_DONG_HIEN), tong, cuaToi: cu === ma ? null : ma });
    setLoi(null);

    startTransition(async () => {
      const kq = await nhanLoiAction(gameId, ma);
      if ('error' in kq) {
        setTomTat(truoc);
        setLoi(kq.error);
      } else {
        setTomTat(kq.tomTat);
      }
    });
  }

  const con = tomTat.tong - tomTat.danhSach.length;

  return (
    <section data-testid="loi-nhan" aria-labelledby="loi-nhan-tieu-de">
      <h2 id="loi-nhan-tieu-de" className="text-base font-semibold text-ink">
        {tomTat.tong > 0 ? `${tomTat.tong} bạn đã nhắn` : 'Lời nhắn của các bạn'}
      </h2>

      {tomTat.danhSach.length > 0 ? (
        <ul className="mt-3 space-y-2" data-testid="loi-nhan-danh-sach">
          {tomTat.danhSach.map((d) => (
            <li
              key={d.childId}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border border-border bg-surface px-3.5 py-2"
              data-testid="loi-nhan-dong"
              data-child={d.childId}
            >
              <span className="text-sm font-semibold text-ink">{d.tenBe}</span>
              <span className="text-ink">{timCau(d.cau)?.chu ?? ''}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-soft" data-testid="loi-nhan-rong">
          {nhanDuoc
            ? 'Chưa có bạn nào nhắn — bạn là người đầu tiên nhé!'
            : 'Chưa có bạn nào nhắn.'}
        </p>
      )}

      {con > 0 && (
        <p className="mt-2 text-sm text-ink-soft" data-testid="loi-nhan-con">
          và {con} bạn nữa
        </p>
      )}

      {/*
        Hàng nút chỉ hiện cho người thật sự bấm được. Hiện nó ở trạng thái mờ cho
        khách xem là bày ra tám cái nút không làm gì — đứa trẻ chưa đăng nhập sẽ bấm
        thử cả tám rồi mới hiểu.
      */}
      {nhanDuoc && (
        <div className="mt-4">
          <p className="text-sm text-ink-soft">Chọn một câu để nhắn cho bạn:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {LOI_NHAN.map((cau) => {
              const dangChon = tomTat.cuaToi === cau.ma;
              return (
                <button
                  key={cau.ma}
                  type="button"
                  onClick={() => bam(cau.ma)}
                  disabled={dangGui}
                  aria-pressed={dangChon}
                  data-testid={`cau-${cau.ma}`}
                  data-chon={dangChon ? 'co' : 'khong'}
                  /* min-h-11: ngón tay trẻ con trên điện thoại, giống hàng icon. */
                  className={[
                    'inline-flex min-h-11 items-center rounded-full border px-3.5 py-1.5',
                    'text-sm font-semibold transition',
                    /*
                     * Câu ĐANG CHỌN phải có nền hover riêng.
                     *
                     * Đo được trước khi sửa: `hover:border-accent-text` dùng chung
                     * cho cả hai trạng thái, mà câu đang chọn ĐÃ mang sẵn viền
                     * `accent-text` — nên rê chuột vào nó thì viền lẫn nền đều **y
                     * nguyên**, không một pixel nào đổi. Đúng cái nút đó là nút để
                     * GỠ lời nhắn, tức đường rút lại duy nhất của bé, và nó là nút
                     * duy nhất trong hàng trông như đã chết.
                     */
                    dangChon
                      ? 'border-accent-text bg-accent/15 text-ink hover:bg-accent/20'
                      : 'border-border bg-surface text-ink hover:border-accent-text hover:bg-accent/10',
                    'cursor-pointer',
                    dangGui ? 'opacity-70' : '',
                  ].join(' ')}
                >
                  {cau.chu}
                </button>
              );
            })}
          </div>
          {tomTat.cuaToi && (
            <p className="mt-2 text-sm text-ink-soft">Bấm lại câu đang sáng để bỏ lời nhắn.</p>
          )}
        </div>
      )}

      {laGameCuaToi && (
        <p className="mt-3 text-sm text-ink-soft" data-testid="loi-nhan-game-cua-toi">
          Đây là game của bạn — chờ các bạn khác nhắn nhé!
        </p>
      )}

      {!nhanDuoc && !laGameCuaToi && tomTat.tong === 0 && (
        <p className="mt-2 text-sm text-ink-soft" data-testid="loi-nhan-goi-y">
          Đăng nhập bằng tài khoản của bé để nhắn cho bạn nhé!
        </p>
      )}

      {loi && (
        <p className="mt-2 text-sm text-danger" role="status" data-testid="loi-nhan-loi">
          {loi}
        </p>
      )}
    </section>
  );
}
