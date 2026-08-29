import Link from 'next/link';

/**
 * Chân trang: chỉ có link, KHÔNG có tên/email đơn vị vận hành.
 *
 * Cố ý. Tên và email đến từ biến môi trường lúc chạy, mà chân trang thì nằm trong
 * layout gốc — in chúng ở đây là ép mọi trang trong web phải render động, hoặc tệ
 * hơn: Next render sẵn lúc build và đóng băng giá trị của máy build vào toàn bộ
 * trang. Thông tin liên hệ vì vậy sống ở /dieu-khoan, là trang `force-dynamic`.
 */
const LINKS = [
  { href: '/dieu-khoan', label: 'Điều khoản sử dụng' },
  { href: '/bao-cao-ban-quyen', label: 'Yêu cầu gỡ bản quyền' },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border py-6" data-testid="site-footer">
      <div className="mx-auto w-full max-w-5xl px-5 text-sm text-ink-soft">
        {/* Một dòng nói web này là gì. Người lớn lần đầu vào bằng link con gửi
            thường cuộn thẳng xuống đáy để tìm xem đây là chỗ nào. */}
        <p className="max-w-2xl">
          <span className="font-bold text-ink">KidoGame</span> — sân chơi để các bé đăng và
          chia sẻ game Scratch tự làm. Tài khoản của bé do bố mẹ tạo.
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-testid={`footer-${link.href.slice(1)}`}
              className="min-h-touch inline-flex items-center font-semibold no-underline hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
