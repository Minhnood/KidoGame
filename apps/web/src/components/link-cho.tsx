import Link from 'next/link';
import type { ComponentProps } from 'react';
import { NutDangCho, type NenCho } from './nut-dang-cho';

/**
 * `<Link>` mang sẵn vòng xoay `NutDangCho` — dùng cho MỌI link điều hướng trong app,
 * trừ thẻ game (đã có `TheDangMo` riêng).
 *
 * Gộp thành một component vì hai thứ phải đi cùng nhau và cả hai đều hỏng im lặng khi
 * quên: thiếu `NutDangCho` thì bấm vào không có gì nhúc nhích; thiếu `relative` thì
 * vòng xoay `absolute inset-0` bám ra thẻ tổ tiên gần nhất và phủ cả một khối trang.
 * Rải tay hai thứ ấy lên năm chục link là năm chục chỗ để quên một trong hai.
 *
 * Link nằm giữa câu văn vẫn dùng được: `relative` trên một `<a>` inline làm mốc cho
 * lớp phủ theo đúng hộp chữ của nó, không đổi cách dòng gãy.
 */
export function LinkCho({
  nen,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & { nen?: NenCho }) {
  return (
    <Link className={className ? `relative ${className}` : 'relative'} {...rest}>
      {children}
      <NutDangCho nen={nen} />
    </Link>
  );
}
