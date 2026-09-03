import { NextResponse, type NextRequest } from 'next/server';

/*
 * CSP của app origin, sinh lại cho TỪNG REQUEST với một nonce riêng.
 *
 * Trước đây policy này nằm trong `headers()` của next.config.ts và phải mang
 * `script-src 'unsafe-inline'`, vì Next chèn script inline để hydrate. Mà
 * 'unsafe-inline' thì làm script-src gần như vô nghĩa: bất cứ chỗ nào lọt được một
 * thẻ <script> vào HTML là chạy được. Trên một trang mà nội dung do trẻ con nhập
 * (tên game, mô tả) được render ra, đó là lớp phòng thủ không nên bỏ trống.
 *
 * Nonce sửa đúng chỗ đó: mỗi lần tải trang sinh một chuỗi ngẫu nhiên, chỉ script
 * mang đúng chuỗi đó mới chạy. Kẻ tấn công không đoán được nonce của lần tải trang
 * mà nạn nhân đang mở.
 *
 * Cách Next nhận nonce: nó đọc header `Content-Security-Policy` từ REQUEST headers
 * mà middleware đặt vào, moi nonce ra, rồi tự gắn vào các thẻ script của nó. Vì vậy
 * dòng `requestHeaders.set('Content-Security-Policy', ...)` bên dưới KHÔNG thừa —
 * bỏ nó đi thì script của Next không có nonce và trang trắng.
 *
 * CHUYỂN TỪ next.config.ts SANG ĐÂY LÀ BẮT BUỘC, không phải cho gọn. Hai header CSP
 * cùng tồn tại thì trình duyệt áp dụng GIAO của chúng: cái cũ không có nonce, cái
 * mới không có 'unsafe-inline', giao lại là chẳng script nào chạy được.
 */

const isDev = process.env.NODE_ENV === 'development';

function playerOrigin(): string {
  return process.env.PLAYER_ORIGIN ?? 'http://127.0.0.1:3001';
}

/** 16 byte ngẫu nhiên, base64. Dùng Web Crypto để chạy được ở cả edge lẫn node runtime. */
function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCsp(nonce: string): string {
  const player = playerOrigin();

  return [
    "default-src 'self'",

    /*
     * 'strict-dynamic': script đã được tin (nhờ nonce) được phép nạp tiếp script khác.
     * Cần vì Next bootstrap bằng một script inline rồi script đó chèn các chunk.
     * Lưu ý CSP3: có 'strict-dynamic' thì 'self' và mọi host-source trong script-src
     * bị BỎ QUA. Giữ 'self' lại chỉ để trình duyệt cũ không hiểu strict-dynamic vẫn
     * chạy được.
     *
     * 'unsafe-eval' CHỈ ở dev: `next dev` build bundle bằng devtool eval-source-map.
     * Thiếu nó thì client component không hydrate và hỏng IM LẶNG — trang vẫn hiện,
     * chỉ có mọi nút bấm không phản ứng.
     */
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,

    /*
     * style-src GIỮ 'unsafe-inline', cố ý.
     *
     * next/font tự chèn thẻ <style>, Tailwind cũng vậy, và cả hai đều không đi qua
     * đường mà nonce của Next chạm tới. Siết chỗ này đổi lấy rủi ro giao diện vỡ mà
     * không hiểu vì sao, trong khi lợi ích an ninh nhỏ hơn hẳn script: CSS inject
     * được thì xấu, còn script inject được thì mất phiên đăng nhập của trẻ.
     */
    "style-src 'self' 'unsafe-inline'",

    `img-src 'self' data: ${player}`,
    `frame-src ${player}`,
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // App origin KHÔNG BAO GIỜ được nhúng vào iframe. Chiều ngược lại (player được
    // nhúng vào app) do frame-ancestors bên player origin quyết định.
    "frame-ancestors 'none'",
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  // Để Next moi nonce ra và gắn vào script của nó. Bỏ dòng này là trang trắng.
  requestHeaders.set('content-security-policy', csp);
  // Để component của ta đọc được nếu sau này cần chèn script inline của riêng mình.
  requestHeaders.set('x-nonce', nonce);
  /*
   * Đường dẫn đang mở, để layout GỐC biết mình đang bọc trang nào.
   *
   * Server component không có cách nào tự đọc pathname — `usePathname` là hook của
   * client. Mà layout gốc cần biết đúng một việc: khu `/admin` có khung riêng, nên
   * đừng vẽ thanh điều hướng trẻ em, tranh trang trí và chân trang quanh nó.
   *
   * Cách khác là chuyển toàn bộ 13 route hiện có vào một route group `(site)` để
   * group đó mang khung riêng. Sạch hơn về kiến trúc, nhưng `app/not-found.tsx` —
   * trang bắt MỌI đường dẫn sai — buộc phải nằm ở gốc và sẽ mất thanh điều hướng
   * cùng chân trang, đúng thứ đã cố ý thêm vào nó. Một header rẻ hơn hẳn.
   */
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  /*
   * Bỏ qua file tĩnh.
   *
   * Không phải để nhanh mà vì đúng đắn: nonce phải khác nhau mỗi lần tải trang, nên
   * response nào mang nonce thì không cache dùng chung được. Gắn nonce vào
   * /_next/static — vốn là nội dung bất biến, cache vĩnh viễn — là tự phá cache mà
   * chẳng bảo vệ thêm được gì.
   *
   * Các header an ninh còn lại (nosniff, Referrer-Policy…) vẫn do next.config.ts
   * đặt cho MỌI đường dẫn, kể cả những đường bị loại ở đây.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
