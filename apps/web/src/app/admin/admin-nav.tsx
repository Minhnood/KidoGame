'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Tab của khu quản trị.
 *
 * Client component chỉ vì một việc: đánh dấu tab đang mở. `usePathname` là hook, và
 * layout là server component nên không gọi được — mà layout gốc thì đã đọc đường dẫn
 * từ header `x-pathname` cho mục đích khác. Ở đây dùng hook vì tab phải đổi ngay khi
 * điều hướng phía client, không chờ một vòng server.
 *
 * Số đếm truyền từ layout xuống, không tự query: một client component không đọc được
 * DB, và quan trọng hơn là số này phải đúng ở lần vẽ đầu tiên chứ không nhảy vào sau.
 */
/*
 * `dem: null` cho Tổng quan, cố ý không phải một số nào đó.
 *
 * Trang ấy là chỗ ĐỌC các con số, nên một cái nhãn đếm gắn lên chính tab của nó thì
 * hoặc trùng lặp, hoặc — tệ hơn — phải chọn xem trong mười hai con số trên đó thì số
 * nào đáng lên tab, tức là quyết định thay người trực đúng cái việc họ vào đó để tự
 * quyết. Hai tab kia có nhãn vì mỗi tab là MỘT hàng đợi, một loại việc.
 */
const MUC = [
  { href: '/admin/tong-quan', id: 'tong-quan', label: 'Tổng quan', dem: null },
  { href: '/admin', id: 'go', label: 'Kiểm duyệt', dem: 'go' as const },
  { href: '/admin/tai-khoan', id: 'tai-khoan', label: 'Tài khoản', dem: null },
  { href: '/admin/loi', id: 'loi', label: 'Lỗi', dem: 'loi' as const },
];

export function AdminNav({ soYeuCauGo, soNhomLoi }: { soYeuCauGo: number; soNhomLoi: number }) {
  const path = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1" data-testid="admin-nav">
      {MUC.map((m) => {
        /*
         * So khớp CHÍNH XÁC, không dùng `startsWith`.
         *
         * `/admin` là tiền tố của `/admin/loi`, nên `startsWith` làm tab "Kiểm duyệt"
         * sáng ở cả hai trang — và khi hai tab cùng sáng thì cái đang mở không còn
         * nói được điều gì.
         */
        const dangMo = path === m.href;
        const dem = m.dem === 'go' ? soYeuCauGo : m.dem === 'loi' ? soNhomLoi : 0;

        return (
          <Link
            key={m.href}
            href={m.href}
            data-testid={`admin-tab-${m.id}`}
            aria-current={dangMo ? 'page' : undefined}
            className={[
              'min-h-touch inline-flex items-center gap-2 rounded-lg px-3.5 font-semibold no-underline',
              dangMo
                ? 'bg-chrome-lift text-chrome-ink'
                : 'text-chrome-ink/70 hover:bg-chrome-lift hover:text-chrome-ink',
            ].join(' ')}
          >
            {m.label}
            {/*
              Số chỉ hiện khi KHÁC 0. Một cái nhãn "0" trên tab là chỗ mắt phải dừng
              lại đọc để rồi thấy không có việc gì — và khi nó luôn ở đó thì lúc nó
              thành "3" cũng không ai nhận ra.
            */}
            {dem > 0 && (
              <span
                data-testid={`admin-tab-${m.id}-dem`}
                className="inline-flex min-w-6 items-center justify-center rounded-full bg-danger px-1.5 text-sm font-bold text-chrome"
              >
                {dem}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
