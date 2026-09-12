'use client';

import { useState, useTransition } from 'react';
import { doiTheoDoiAction } from '@/lib/actions';

/**
 * Nút theo dõi một bạn.
 *
 * Chỉ render cho bé đang đăng nhập và KHÔNG phải chủ game — nơi gọi quyết định, vì
 * chỉ nó biết ai là chủ. Khách và phụ huynh không thấy nút này chứ không thấy nó ở
 * dạng mờ: một cái nút không bấm được thì đứa trẻ sẽ bấm thử vài lần rồi mới hiểu.
 *
 * Nút KHÔNG hiện con số nào. Không phải quên — xem `model Follow`: chiều "ai theo
 * dõi tôi" không tồn tại trong sản phẩm, kể cả dưới dạng một con số cạnh cái nút.
 */
export function NutTheoDoi({
  authorId,
  tenBan,
  banDau,
}: {
  authorId: string;
  tenBan: string;
  banDau: boolean;
}) {
  const [dang, setDang] = useState(banDau);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, startTransition] = useTransition();

  function bam() {
    // Lạc quan, cùng lý do đã ghi ở `hang-icon.tsx`: chờ server rồi mới đổi chữ thì
    // trên mạng chậm đứa trẻ tưởng hụt và bấm lại — mà cú bấm thứ hai là lệnh BỎ.
    const truoc = dang;
    setDang(!dang);
    setLoi(null);

    startTransition(async () => {
      const kq = await doiTheoDoiAction(authorId);
      if ('error' in kq) {
        setDang(truoc);
        setLoi(kq.error);
      } else {
        setDang(kq.dangTheoDoi);
      }
    });
  }

  return (
    <div data-testid="theo-doi">
      <button
        type="button"
        onClick={bam}
        disabled={dangGui}
        aria-pressed={dang}
        data-testid="nut-theo-doi"
        data-dang={dang ? 'co' : 'khong'}
        className={[
          'min-h-touch inline-flex items-center rounded-full border px-4 py-1.5',
          'text-sm font-semibold transition cursor-pointer',
          /*
           * Trạng thái ĐANG THEO DÕI cũng phải phản hồi khi rê chuột vào.
           *
           * Đo được trước khi sửa: `hover:border-accent-text` chỉ nằm ở nhánh CHƯA
           * theo dõi, nên nút "Đang theo dõi kubin" — đúng cái nút để BỎ theo dõi —
           * không đổi viền, không đổi nền, không gì cả. Nó là nút duy nhất trên trang
           * mà con trỏ đi qua như đi qua một dòng chữ.
           *
           * Nền đậm thêm (15% → 20%) chứ không nhạt đi: hover là tiến tới, không lùi.
           * Con số 20 do phép đo chặn lại, không phải chọn cho đẹp — xem
           * `contrast-check.mjs`, mục "lúc rê chuột".
           */
          dang
            ? 'border-accent-text bg-accent/15 text-ink hover:bg-accent/20'
            : 'border-border bg-surface text-ink hover:border-accent-text hover:bg-accent/10',
          dangGui ? 'opacity-70' : '',
        ].join(' ')}
      >
        {dang ? `Đang theo dõi ${tenBan}` : `Theo dõi ${tenBan}`}
      </button>

      {/*
        Câu giải thích đổi theo trạng thái, và cả hai đều nói về THỨ BÉ NHẬN ĐƯỢC.
        Không câu nào nói "bạn ấy sẽ biết" — vì bạn ấy sẽ không biết, và hứa nhầm
        điều đó là hứa hộ một tính năng cố ý không có.
      */}
      <p className="mt-1.5 text-sm text-ink-soft" data-testid="theo-doi-giai-thich">
        {dang
          ? 'Game mới của bạn ấy sẽ hiện ở trang chủ của bé.'
          : 'Theo dõi để thấy game mới của bạn ấy ngay ở trang chủ.'}
      </p>

      {loi && (
        <p className="mt-1.5 text-sm text-danger" role="status" data-testid="theo-doi-loi">
          {loi}
        </p>
      )}
    </div>
  );
}
