import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getActorTrongLuotRender } from '@/lib/session';

/**
 * Chặn người chưa đăng nhập Ở ĐÂY, không chỉ ở `page.tsx`.
 *
 * Route này có `loading.tsx`, và khung chờ bọc `page.tsx` chứ không bọc layout. Có khung
 * chờ thì Next gửi dòng trạng thái 200 đi ngay để vẽ khung, nên một `redirect()` nằm
 * trong page chạy SAU khi mã trạng thái đã rời máy chủ: người chưa đăng nhập nhận 200
 * kèm một khung chờ, rồi JavaScript mới chuyển hướng hộ. Layout chạy trước khung chờ,
 * nên chuyển hướng ở đây ra đúng 307 từ máy chủ.
 *
 * `page.tsx` vẫn giữ phép kiểm của nó — nó cần `actor` để render, và bản có nhớ làm hai
 * lần hỏi chỉ tốn một truy vấn.
 */
export default async function BanBeLayout({ children }: { children: ReactNode }) {
  if (!(await getActorTrongLuotRender())) redirect('/be-dang-nhap');
  return children;
}
