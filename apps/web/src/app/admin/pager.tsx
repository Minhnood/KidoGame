import Link from 'next/link';

/**
 * Thanh phân trang dùng chung cho ba danh sách của khu quản trị.
 *
 * VÌ SAO CÓ SỐ TRANG, không chỉ hai mũi tên. Bản trước chỉ có "Trang trước / Trang
 * sau", nên đi từ trang 1 sang trang 7 là bảy lần bấm và bảy lần chờ tải — mà hàng
 * đợi thì xếp việc GẤP NHẤT lên đầu, tức trang cuối là chỗ chứa những thứ nằm lâu
 * nhất mà chưa ai đụng tới. Không đi thẳng tới được nghĩa là cái đuôi ấy trên thực tế
 * không ai đọc.
 *
 * Hai mũi tên VẪN GIỮ, không thay bằng số: đọc hết một trang rồi đi tiếp là thao tác
 * hay dùng nhất, và bắt người ta phải tìm đúng con số kế tiếp trong một dãy số là
 * bắt đọc để làm một việc vốn không cần đọc.
 *
 * NHẬN MỘT HÀM `href`, không tự dựng URL. Ba trang mang ba bộ tham số khác nhau —
 * `loc`, `q`, `be` — và nếu thanh này tự ghép URL thì nó phải biết hết, rồi lần sau
 * ai thêm tham số thứ tư sẽ quên đúng chỗ này. Rơi một tham số lúc sang trang là lỗi
 * IM LẶNG: danh sách đổi mà không có gì trên màn hình nói vì sao.
 */

/**
 * Dãy số trang cần vẽ, có thể chứa `null` = chỗ lược bớt.
 *
 * Luôn giữ trang ĐẦU, trang CUỐI và hai trang hai bên trang hiện tại. Không rút gọn
 * khi tổng ít hơn 8 trang: một dãy `1 … 5 6 7 … 9` khi chỉ có 9 trang thì phần lược
 * bớt còn dài hơn thứ nó lược.
 */
export function daySoTrang(page: number, lastPage: number): (number | null)[] {
  if (lastPage <= 7) return Array.from({ length: lastPage }, (_, i) => i + 1);

  const giu = new Set<number>([1, lastPage, page]);
  for (let d = 1; d <= 2; d++) {
    if (page - d >= 1) giu.add(page - d);
    if (page + d <= lastPage) giu.add(page + d);
  }

  const so = [...giu].sort((a, b) => a - b);
  const ra: (number | null)[] = [];
  let truoc = 0;
  for (const n of so) {
    /* Chỉ chèn dấu lược khi thật sự có khoảng trống. Cách đúng MỘT trang thì in luôn
       số đó: một dấu "…" thay cho một con số là dài hơn, và lại còn không bấm được. */
    if (truoc && n - truoc === 2) ra.push(truoc + 1);
    else if (truoc && n - truoc > 2) ra.push(null);
    ra.push(n);
    truoc = n;
  }
  return ra;
}

export function Pager({
  page,
  lastPage,
  href,
  testId,
  className = '',
}: {
  page: number;
  lastPage: number;
  href: (p: number) => string;
  testId: string;
  className?: string;
}) {
  if (lastPage <= 1) return null;

  return (
    <nav
      className={`flex flex-wrap items-center gap-2 ${className}`}
      data-testid={testId}
      aria-label="Phân trang"
    >
      {page > 1 && (
        <Link href={href(page - 1)} data-testid={`${testId}-truoc`} className="px-2 py-2">
          ← Trang trước
        </Link>
      )}

      {daySoTrang(page, lastPage).map((n, i) =>
        n === null ? (
          /* `aria-hidden` vì với người dùng trình đọc màn hình, ba dấu chấm không thêm
             thông tin nào — số trang liền trước và liền sau đã nói ra là có khoảng
             cách. */
          <span key={`luoc-${i}`} aria-hidden="true" className="px-1 text-ink-soft">
            …
          </span>
        ) : (
          <Link
            key={n}
            href={href(n)}
            data-testid={`${testId}-so-${n}`}
            /* `aria-current="page"` chứ không chỉ đổi màu: trang đang mở phải nói ra
               được cho trình đọc màn hình, giống hệt cách tab và bộ lọc đang làm. */
            aria-current={n === page ? 'page' : undefined}
            className={[
              'min-h-touch inline-flex min-w-11 items-center justify-center rounded-lg border px-2 font-semibold tabular-nums no-underline',
              n === page
                ? 'border-transparent bg-accent text-chrome'
                : 'border-border bg-surface text-ink hover:bg-bg',
            ].join(' ')}
          >
            {n}
          </Link>
        )
      )}

      {page < lastPage && (
        <Link href={href(page + 1)} data-testid={`${testId}-sau`} className="px-2 py-2">
          Trang sau →
        </Link>
      )}
    </nav>
  );
}
