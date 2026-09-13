import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { docGameDuocXem } from './quyen-xem';

/**
 * Quyết định 404 TRƯỚC khung chờ.
 *
 * Layout này không vẽ gì cả — nó tồn tại chỉ vì nó chạy ngoài `loading.tsx`. Đặt
 * `notFound()` trong page thì dòng 200 của khung chờ đã đi trước, và game bị ẩn hay bị
 * gỡ trả 200 cho mọi người lạ. Lý do đầy đủ ở `quyen-xem.ts`.
 *
 * Đổi lại, khung chờ chỉ hiện ra sau MỘT truy vấn theo khoá chính cộng một lần đọc
 * phiên — phần nặng của trang (icon, lời nhắn, game khác) vẫn nằm sau khung chờ.
 */
export default async function GameLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await docGameDuocXem(id))) notFound();
  return children;
}
