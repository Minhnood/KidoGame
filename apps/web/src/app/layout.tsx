import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import { headers } from 'next/headers';
import { SiteNav } from '@/components/site-nav';
import { SiteLogo } from '@/components/site-logo';
import { NavDecor } from '@/components/nav-decor';
import { DayLeoVien, SiteDecor } from '@/components/site-decor';
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
  const h = await headers();
  const nonce = h.get('x-nonce');

  /*
   * Khu QUẢN TRỊ không dùng khung của site.
   *
   * Không phải chuyện thẩm mỹ. Thanh điều hướng, tranh đồi cây và chân trang được
   * dựng cho trẻ em và bố mẹ: chữ to, màu tươi, cột nội dung 1024px. Việc của người
   * quản trị là ngược lại — đọc bảng dài, so số đếm, bấm nút khó đảo — và đặt nó
   * giữa mấy cái cây thì hai chuyện cùng dở đi: danh sách bị bó vào 1024px trong khi
   * nó cần cả bề ngang, còn cái cây thì nằm cạnh một nút "Gỡ hẳn".
   *
   * `app/admin/layout.tsx` tự dựng khung riêng cho mình, nên ở đây chỉ việc thôi
   * không vẽ ba thứ kia. `<html>`, `<body>`, font và script chống loé giao diện thì
   * VẪN dùng chung — chúng là hạ tầng của mọi trang, không phải trang trí.
   *
   * `startsWith('/admin')` là đủ và cố tình thô: cả `/admin` lẫn `/admin/loi` và mọi
   * trang quản trị thêm sau này đều phải rơi vào đây, và không có route nào khác của
   * site bắt đầu bằng chuỗi đó.
   */
  const laKhuQuanTri = (h.get('x-pathname') ?? '').startsWith('/admin');

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
        {/* Ba thứ dưới đây — link nhảy, tranh trang trí, thanh điều hướng — là KHUNG
            CỦA SITE. Khu quản trị tự dựng khung riêng, xem chú thích ở `laKhuQuanTri`. */}
        {!laKhuQuanTri && (
          <>
        {/*
         * Link nhảy thẳng tới nội dung, cho người dùng bàn phím.
         *
         * KHÔNG có ở khu quản trị, và không phải vì bỏ sót: đích của nó là
         * `<main>`, mà ở khu quản trị chính thanh điều hướng riêng lại nằm TRONG
         * `<main>`. Nhảy tới đó là nhảy lên phía trên thanh, tức không bỏ qua được
         * gì — một link nói mình làm một việc mà không làm thì tệ hơn không có.
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
        {/* Tranh trang trí hai bên lề. Đặt TRƯỚC <header> nhưng nó `fixed` nên vị trí
            trong cây DOM không ảnh hưởng gì tới bố cục — điều đáng quan tâm là nó
            không chen vào thứ tự Tab, và nó không hề focus được. */}
        <SiteDecor />
        {/* Dây leo hai mép, cho màn hình hẹp — cùng lý do đặt ở đây như `SiteDecor`:
            nó `fixed` nên chỗ trong cây DOM không ảnh hưởng bố cục, và nó không hề
            focus được nên không chen vào thứ tự Tab. */}
        <DayLeoVien />
        {/*
          Nền thanh điều hướng xếp BA LỚP, và thứ tự là thứ tự trong DOM.

          1. `bg-nav-1` — màu đặc, tối nhất. Phải có: hai lớp trên đều là
             `background-image` có chỗ trong suốt, không có nền đặc lót dưới thì chỗ
             đó lộ ra nền trang.
          2. Dải chuyển sắc ngang, tím đêm ở phía logo sang xanh đen ở phía các nút.
             Đi về phía tím chứ không về phía cam, vì nút chính là nút cam: cam trên
             tím đêm thì nổi hẳn, còn kéo nền về phía cam là nút chìm vào nền đúng ở
             chỗ nó cần nổi nhất.
          3. Vệt sáng loang quanh logo, bắt đầu từ 14% ngang trên mép trên. Chỗ sáng
             nhất của thanh nên là chỗ ta muốn mắt đến trước.

          Cả ba lớp `absolute inset-0` nên KHÔNG chiếm chỗ trong bố cục — chiều cao
          thanh vẫn do `Wrap` bên dưới quyết định, thêm hay bớt một lớp không làm
          thanh cao lên hay thấp đi.

          `overflow-hidden` là BẮT BUỘC, không phải cho gọn: nhánh lá trang trí vẽ
          tràn qua mép trên và mép dưới thanh (cố ý — nhánh chạy tiếp ra ngoài chứ
          không cụt lại ở đúng mép), thiếu nó là lá đổ xuống đè lên nội dung trang.
        */}
        <header className="relative overflow-hidden bg-nav-1 text-chrome-ink">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-r from-nav-3 via-nav-2 to-nav-1"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(120%_170%_at_14%_-30%,var(--color-nav-glow)_0%,transparent_55%)]"
          />
          <NavDecor />
          {/*
            Cho phép xuống dòng ở ĐÂY, và chỉ ở đây.
            Thanh điều hướng bên trong thì `flex-nowrap` — nhờ vậy trên máy rất hẹp
            (320px, kiểu iPhone SE đời đầu) cả cụm nút rơi xuống một hàng riêng nằm
            gọn dưới logo, thay vì vỡ lẻ từng nút mỗi cái một dòng như bản cũ. Không
            khoá cứng cả hai tầng: khoá cả hai là trang tràn ngang ở 320px, đã đo
            thấy tràn 31px.
          */}
          {/* `relative` để nó nằm TRÊN ba lớp nền và nhánh lá. Hai phần tử đều được
              định vị thì cái sau trong DOM vẽ sau — không cần `z-index` nào. */}
          <Wrap className="relative flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-2.5 min-[360px]:flex-nowrap sm:gap-4 sm:py-3.5">
            <SiteLogo />
            <div className="ml-auto flex items-center gap-0.5 sm:gap-2">
              <SiteNav />
              <ThemeToggle />
            </div>
          </Wrap>
          {/*
            Vạch cam mảnh dưới chân thanh điều hướng.

            Nó làm hai việc: đóng cạnh dưới của khối tối lại cho ra một thanh chứ
            không phải một mảng màu bị cắt ngang, và nhắc lại đúng màu thương hiệu ở
            chỗ mắt đi qua nhiều nhất.

            Nhạt dần về bên phải chứ không cam đều cả vạch: một vạch cam đặc suốt
            1920px là một cái gạch chân, nó cắt trang làm hai và kéo mắt chạy ngang
            theo nó. Nhạt dần thì nó chỉ còn là một mép sáng bắt đầu từ phía logo.

            Cao 3px, `aria-hidden`, không chữ không link — nên nó không thêm một điểm
            Tab nào (`a11y-check` đếm số điểm Tab mỗi trang).
          */}
          <div
            aria-hidden="true"
            className="relative h-0.75 bg-linear-to-r from-accent via-accent/40 to-transparent"
          />
        </header>
          </>
        )}
        {/*
         * `tabIndex={-1}` để link nhảy ở trên thật sự MANG FOCUS tới đây.
         *
         * Không có nó thì trình duyệt cuộn tới đúng chỗ nhưng focus vẫn ở link
         * cũ, nên lần Tab tiếp theo quay về thanh điều hướng — người dùng bàn
         * phím lại đi đúng con đường vừa muốn bỏ qua. Đây là lý do phần lớn link
         * nhảy trên mạng chỉ *trông như* hoạt động.
         */}
        {/*
         * `overflow-x-clip` — hàng rào cho mọi thứ TRANG TRÍ CHÌA RA NGOÀI.
         *
         * Cành mọc ra khỏi thẻ game khi trỏ chuột vào (xem `game-card.tsx`) là hình
         * vẽ nằm ngoài hộp của thẻ. Ở thẻ cột ngoài cùng, phần chìa ra vượt khỏi khung
         * nhìn và trang phải vuốt ngang — mà nó CHỈ xảy ra lúc trỏ chuột, nên bộ đo
         * tràn ngang trong `a11y-check` không bao giờ thấy: nó không hover.
         *
         * `clip` chứ KHÔNG phải `hidden`: `hidden` tạo ra một vùng cuộn được, làm chết
         * `position: sticky` của mọi thứ bên trong và đổi cả hành vi cuộn. `clip` chỉ
         * cắt, không tạo vùng cuộn.
         *
         * Cắt ở đây, không cắt ở lưới thẻ: mép của `<main>` là mép KHUNG NHÌN, nên
         * cành bị cắt đúng ở rìa màn hình — đọc ra là "nó chạy tiếp ra ngoài". Cắt ở
         * lưới thì vết cắt nằm giữa trang, đúng cái lỗi đã phải sửa ở tranh hai bên lề.
         *
         * Tranh trang trí hai bên lề KHÔNG bị ảnh hưởng: nó là thẻ anh em của
         * `<main>`, không phải con.
         */}
        <main id="noi-dung" tabIndex={-1} className="flex-1 overflow-x-clip">
          {/*
            `Wrap` bó nội dung vào 1024px. Khu quản trị KHÔNG dùng nó và tự quyết bề
            rộng của mình: việc ở đó là đọc danh sách dài có ảnh, số đếm và nút, và
            1024px trên màn 1920 nghĩa là gần một nửa màn hình để trống trong khi
            từng dòng thì chật.
          */}
          {laKhuQuanTri ? children : <Wrap>{children}</Wrap>}
        </main>
        {!laKhuQuanTri && <SiteFooter />}
      </body>
    </html>
  );
}
