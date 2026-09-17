'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * Ảnh bìa game — và thứ hiện thay khi ảnh KHÔNG tải được.
 *
 * Trước đây là `<img>` trần: file bìa mất, player origin sập hay mạng rớt giữa chừng thì
 * thẻ game hiện icon ảnh vỡ của trình duyệt, cạnh viên "▶ 1 · ❤ 0", và cả thẻ trông như
 * trang hỏng. Fen chọn: nền màu lấy theo TÊN game + chữ cái đầu cỡ lớn.
 *
 * VẼ NGAY TRONG TRANG, không tải ảnh thay thế nào. Ảnh bìa nằm trên player origin; lý do
 * hay gặp nhất khiến nó hỏng — player sập — cũng làm hỏng mọi ảnh thay thế đặt ở đó.
 *
 * MÀU THEO TÊN, không phải một màu chung: nhiều bìa hỏng cùng lúc (đúng trường hợp player
 * sập) thì cả trang toàn ô giống hệt nhau, không nhận ra game nào với game nào. Tên như
 * nhau thì màu như nhau, lần tải nào cũng vậy. `hsl(sắc 55% 32%)` để chữ trắng đọc được
 * trên mọi sắc: tính cả 360 sắc, thấp nhất 4,26:1 ở sắc vàng 60°, cao nhất 12,79:1.
 *
 * HAI ĐƯỜNG BẮT LỖI. `onError` chỉ có sau khi React hydrate; ảnh lỗi TRƯỚC đó (HTML server
 * vừa về, request ảnh bị từ chối ngay) thì sự kiện đã qua mất. Nên lúc mount kiểm thêm
 * `complete && naturalWidth === 0` — ảnh `loading="lazy"` chưa tải thì `complete` là
 * false, không bị nhận nhầm là hỏng.
 *
 * Ô thay thế giữ nguyên `className` của ảnh (kích thước, bo góc, độ mờ, hiệu ứng trỏ chuột)
 * để dòng và thẻ không nhảy. `display: grid` đặt bằng `style` vì `style` thắng mọi lớp
 * `block`/`sm:block` mà nơi gọi đã đặt cho ảnh.
 */
export function AnhBia({
  src,
  ten,
  alt = '',
  className = '',
  ...rest
}: {
  src: string;
  /** Tên game: chọn màu nền và chữ cái của ô thay thế. */
  ten: string;
  alt?: string;
  className?: string;
  width: number;
  height: number;
  loading?: 'lazy' | 'eager';
  'data-testid'?: string;
}) {
  /* Nhớ `src` nào hỏng chứ không chỉ một cờ: trang đăng game đổi `src` khi bé chọn bìa
     khác, và bìa mới không được thừa hưởng cái hỏng của bìa cũ. */
  const [srcHong, setSrcHong] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const anh = ref.current;
    if (anh && anh.complete && anh.naturalWidth === 0) setSrcHong(src);
  }, [src]);

  if (srcHong === src) {
    const style: CSSProperties = {
      display: 'grid',
      placeItems: 'center',
      containerType: 'inline-size',
      background: `hsl(${sacTheoTen(ten)} 55% 32%)`,
      color: '#fff',
    };
    return (
      <span
        className={className}
        style={style}
        data-testid={rest['data-testid']}
        data-bia-thay-the=""
        {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
      >
        {/* 42cqw: chữ to theo bề ngang CHÍNH ô này — ô 64px ở trang bố mẹ và ô 300px trên
            thẻ game dùng chung một con số. */}
        <span style={{ fontSize: '42cqw', lineHeight: 1, fontWeight: 800 }}>{chuDau(ten)}</span>
      </span>
    );
  }

  return (
    // Ảnh nằm trên player origin nên dùng <img> thường thay vì next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={className}
      onError={() => setSrcHong(src)}
      {...rest}
    />
  );
}

/** Sắc màu 0–359 từ tên, cố định theo tên (FNV-1a). */
function sacTheoTen(ten: string): number {
  let h = 0x811c9dc5;
  for (const kyTu of ten) {
    h ^= kyTu.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 360;
}

/** Chữ cái đầu, viết hoa. Theo "ký tự người đọc thấy" (grapheme), để "Đ" hay emoji
 *  không bị cắt đôi. */
function chuDau(ten: string): string {
  const goc = ten.trim();
  const dau =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? new Intl.Segmenter('vi', { granularity: 'grapheme' }).segment(goc)[Symbol.iterator]().next().value?.segment
      : Array.from(goc)[0];
  return (dau ?? '?').toLocaleUpperCase('vi');
}
