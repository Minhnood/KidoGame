'use client';

import { useState, useTransition } from 'react';
import { doiTheoDoiAction } from '@/lib/actions';

/**
 * Bỏ theo dõi, dùng trong danh sách `/ban-be`.
 *
 * Riêng một component chứ không dùng lại `NutTheoDoi`, và khác biệt không chỉ là
 * chữ trên nút: ở đây bấm xong thì HÀNG BIẾN MẤT khỏi danh sách. Dùng nút kia sẽ
 * để lại một dòng ghi "Theo dõi X" nằm trong trang tên là "các bạn đang theo dõi" —
 * một danh sách tự mâu thuẫn với chính nó.
 *
 * Bỏ nhầm thì bấm "Theo dõi lại" ngay tại chỗ, không phải đi tìm lại game của bạn
 * ấy. Hàng chỉ thật sự biến mất ở lần tải trang sau.
 */
export function NutBoTheoDoi({ authorId, tenBan }: { authorId: string; tenBan: string }) {
  const [dang, setDang] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, startTransition] = useTransition();

  function bam() {
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
    <span className="flex flex-wrap items-center gap-2">
      {!dang && (
        <span className="text-sm text-ink-soft" data-testid="da-bo-theo-doi">
          Đã bỏ theo dõi {tenBan}
        </span>
      )}
      <button
        type="button"
        onClick={bam}
        disabled={dangGui}
        data-testid="nut-bo-theo-doi"
        data-dang={dang ? 'co' : 'khong'}
        className={[
          'min-h-touch inline-flex items-center rounded-full border px-4 py-1.5',
          'text-sm font-semibold transition cursor-pointer',
          dang
            ? 'border-border bg-surface text-ink hover:border-accent-text'
            : 'border-accent-text bg-accent/15 text-ink',
          dangGui ? 'opacity-70' : '',
        ].join(' ')}
      >
        {dang ? 'Bỏ theo dõi' : 'Theo dõi lại'}
      </button>
      {loi && (
        <span className="text-sm text-danger" role="status" data-testid="bo-theo-doi-loi">
          {loi}
        </span>
      )}
    </span>
  );
}
