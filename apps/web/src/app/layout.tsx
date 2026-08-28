import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import { headers } from 'next/headers';
import Link from 'next/link';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wrap } from '@/components/page';
import './globals.css';

/*
 * Nunito: chữ bo tròn, thân thiện, và có bộ dấu tiếng Việt đầy đủ.
 * next/font tải về lúc BUILD rồi self-host, nên lúc chạy không có request nào
 * ra Google — hợp với CSP `default-src 'self'` và không rò dữ liệu người dùng.
 */
const nunito = Nunito({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '600', '700', '800'],
  display: 'swap',
  variable: '--font-nunito',
});

export const metadata: Metadata = {
  title: 'KidoGame — Sân chơi game Scratch của các bé',
  description: 'Nơi các bé đăng tải và chia sẻ game Scratch tự làm.',
};

/*
 * Đặt `data-theme` TRƯỚC khung hình đầu tiên.
 *
 * Bảng màu tối đã tự chạy theo `prefers-color-scheme` mà không cần một dòng JS nào,
 * nên khối này chỉ phục vụ những người đã TỰ CHỌN khác cài đặt của máy. Với họ, nếu
 * để React đặt thuộc tính sau khi hydrate thì trang loé lên giao diện của máy rồi mới
 * đổi — trên trang tối, cú loé trắng ban đêm là thứ khó chịu thật sự, không phải
 * chuyện thẩm mỹ.
 *
 * Phải là script CHẶN, đặt trong <head>, đúng một dòng đọc localStorage. Chuyển sang
 * bất kỳ cách bất đồng bộ nào cũng làm mất tác dụng.
 *
 * Gói trong try/catch vì `localStorage` NÉM ở một số ngữ cảnh (trình duyệt chặn site
 * data, cửa sổ riêng tư trên vài phiên bản Safari). Ném ở đây là chặn cả trang.
 */
const SCRIPT_GIAO_DIEN = `try{var t=localStorage.getItem('kidogame-theme');if(t==='sang'||t==='toi')document.documentElement.dataset.theme=t==='sang'?'light':'dark'}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * Nonce do `src/middleware.ts` đặt vào request header. Script inline BẮT BUỘC phải
   * mang nonce, vì CSP của app không còn `script-src 'unsafe-inline'`.
   *
   * `headers()` làm route render động — nhưng ở đây không mất gì thêm: `SiteNav` trong
   * chính layout này gọi `getActor()`, tức đọc cookie, nên layout gốc đã động ở mọi
   * route từ trước.
   *
   * Thiếu nonce (route nào không qua middleware) thì BỎ script thay vì gửi một thẻ
   * script chắc chắn bị CSP chặn: giao diện vẫn đúng theo cài đặt của máy, chỉ mất
   * phần chống loé cho người đã tự chọn.
   */
  const nonce = (await headers()).get('x-nonce');

  return (
    /*
     * `suppressHydrationWarning` ở ĐÚNG thẻ <html> này là bắt buộc, không phải để
     * cho im tiếng: script bên dưới đặt `data-theme` lên chính thẻ này trước khi
     * React chạy, nên HTML của server (không có thuộc tính đó) và DOM lúc client
     * hydrate (có) chắc chắn khác nhau với người đã tự chọn giao diện.
     *
     * An toàn vì cờ này chỉ có tác dụng MỘT CẤP — riêng thẻ <html> — nên nó không
     * che được lệch hydration ở bất cứ đâu khác trong cây.
     */
    <html lang="vi" className={nunito.variable} suppressHydrationWarning>
      {/* flex-col + min-h-screen: giữ chân trang ở đáy màn hình cả trên trang ngắn. */}
      <body className="flex min-h-screen flex-col font-[family-name:var(--font-nunito)] antialiased">
        {/*
          Đặt ở đầu <body> chứ KHÔNG bọc trong một thẻ <head> tự viết. App Router tự
          quản lý <head>; thêm một thẻ <head> của mình vào cây làm lệch hydration ngay
          ở ranh giới html/head — đã thử và thấy cảnh báo thật.

          Ở đây vẫn kịp: CSS trong <head> đã tải xong, và trình duyệt chưa vẽ khung
          hình nào vì chưa có nội dung nào để vẽ.
        */}
        {nonce && (
          /*
           * `suppressHydrationWarning` ở đây là vì TRÌNH DUYỆT, không phải vì code:
           * sau khi parse xong, trình duyệt XOÁ thuộc tính `nonce` khỏi DOM (để một
           * script bị chèn vào không đọc được nonce mà tự cấp phép cho mình). React
           * so `nonce` nó vừa render với `nonce=""` đang có trong DOM và báo lệch
           * hydration. Không có cách nào sửa được từ phía ta, vì hành vi xoá đó
           * chính là lớp bảo vệ.
           */
          <script
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: SCRIPT_GIAO_DIEN }}
          />
        )}
        {/*
         * Link nhảy thẳng tới nội dung, cho người dùng bàn phím.
         *
         * Không có nó thì mỗi trang phải bấm Tab 5 lần mới ra khỏi thanh điều
         * hướng — đã đếm trên bản production. Năm lần không nhiều, nhưng nó lặp
         * ở MỌI trang và MỌI lần, và người phải trả giá đó là đứa trẻ không dùng
         * được chuột.
         *
         * `sr-only` cho tới khi được focus (`focus:not-sr-only`): người dùng
         * chuột không bao giờ thấy nó, người dùng bàn phím thấy ngay ở Tab đầu.
         * Ẩn hẳn bằng `display:none` thì bàn phím cũng không tới được — thành ra
         * vô dụng.
         *
         * PHẢI là phần tử focus được đầu tiên trong <body>, nên nó nằm trên
         * <header>. Script chống loé giao diện ở trên không focus được nên không
         * chen vào thứ tự.
         */}
        <a
          href="#noi-dung"
          /*
           * Padding và màu nằm TRONG nhánh `focus:`, không để ngoài.
           *
           * `sr-only` của Tailwind đặt `padding: 0` để hộp co về 1×1. Viết
           * `px-4 py-2` ở ngoài là ghi đè đúng dòng đó, và hộp phình lại thành
           * 32×16 ngay cả lúc chưa focus. Nội dung vẫn bị `clip` nên mắt thường
           * khó thấy, nhưng nó là một ô nền đậm 32×16 nằm ở góc trên trái —
           * loại lỗi chỉ lộ trên đúng một trình duyệt, đúng một zoom level.
           */
          className="sr-only bg-chrome text-chrome-ink focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2"
        >
          Bỏ qua thanh điều hướng, tới nội dung
        </a>
        <header className="bg-chrome py-3 text-chrome-ink">
          <Wrap className="flex items-center justify-between gap-4">
            <Link href="/" className="text-xl font-extrabold tracking-tight no-underline">
              Kido<span className="text-accent">Game</span>
            </Link>
            <div className="flex items-center gap-1 sm:gap-2">
              <SiteNav />
              <ThemeToggle />
            </div>
          </Wrap>
        </header>
        {/*
         * `tabIndex={-1}` để link nhảy ở trên thật sự MANG FOCUS tới đây.
         *
         * Không có nó thì trình duyệt cuộn tới đúng chỗ nhưng focus vẫn ở link
         * cũ, nên lần Tab tiếp theo quay về thanh điều hướng — người dùng bàn
         * phím lại đi đúng con đường vừa muốn bỏ qua. Đây là lý do phần lớn link
         * nhảy trên mạng chỉ *trông như* hoạt động.
         */}
        <main id="noi-dung" tabIndex={-1} className="flex-1">
          <Wrap>{children}</Wrap>
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
