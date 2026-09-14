import Link from 'next/link';
import { DatCuoiTrang, Hoa } from './site-decor';
import { ThemeToggle } from './theme-toggle';

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
  /* Báo lỗi phải ở CHÂN TRANG, không chỉ ở trang lỗi. Trang lỗi chỉ hiện khi React
     ném exception; phần lớn chỗ hỏng người dùng gặp thì không ném gì cả — "bấm gửi mà
     không có gì xảy ra", "thư xác minh không tới" — nên nếu đường vào chỉ nằm trên
     trang lỗi thì đúng những báo cáo giá trị nhất không có cửa nào. */
  { href: '/bao-loi', label: 'Báo lỗi' },
];

/**
 * Đường ranh trên chân trang: một vạt đất lượn, có bụi cỏ và hoa mọc trên.
 *
 * Thay cho `border-t` của bản cũ, và đó là một BẢN SỬA LỖI chứ không chỉ là trang
 * trí. Viền đó nằm trên thẻ <footer>, mà thẻ ấy rộng suốt khung nhìn — nên trên màn
 * 1280px trở lên, đường kẻ xám chạy thẳng qua quả đồi và mấy cái cây của tranh hai
 * bên lề. Một nhát kẻ ngang giữa bức tranh, ai nhìn cũng thấy là sai.
 *
 * Nay đường ranh nằm TRONG khung nội dung 1024px, tức chỉ dài bằng chỗ nó cần ngăn
 * — chữ với chữ — và hai bên lề để nguyên cho tranh.
 *
 * HAI LỚP, vì hai lớp có nhu cầu co giãn khác nhau:
 *
 *  - Đường đất kéo giãn theo bề rộng (`preserveAspectRatio="none"`). Một đường cong
 *    thoải thì giãn bao nhiêu cũng không ai thấy. Nhưng phải có
 *    `vector-effect="non-scaling-stroke"`: co giãn không đều thì nét vẽ cũng bị bóp
 *    theo, đường kẻ sẽ dày mỏng khác nhau ở hai đầu.
 *  - Cỏ và hoa thì KHÔNG được giãn — bông hoa bị bóp ngang thành hình bầu dục là
 *    nhìn ra ngay. Nên chúng là những thẻ <svg> riêng, cỡ cố định, đặt theo phần
 *    trăm bề ngang.
 *
 * CHỖ ĐỨNG của cây cỏ tính bằng PHẦN TRĂM cả hai chiều, ngang lẫn dọc — và chiều
 * dọc mới là chỗ đáng nói. Đường đất giãn ngang chứ không giãn dọc, nên độ cao của
 * nó ở mỗi mốc phần trăm ngang là một TỈ LỆ cố định của chiều cao lớp: ở mốc 4%
 * đường đất nằm ở 13.1/20, tức 65.5% từ trên xuống, tức `bottom-[35%]`. Ghi bằng
 * phần trăm thì đổi chiều cao lớp (`h-5` lên `h-7` chẳng hạn) cây cỏ vẫn đứng đúng
 * trên mặt đất; ghi bằng px thì nó lơ lửng hoặc lún xuống ngay.
 *
 * Ba con số 35% / 40% / 43% không chọn cho đẹp mà tính từ đúng ba điểm trên đường
 * cong ở ba mốc 4%, 40%, 74%.
 */
function VienDat() {
  return (
    <div aria-hidden="true" className="relative mb-5 h-5">
      <svg
        viewBox="0 0 1000 20"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        fill="none"
        focusable="false"
      >
        <path
          d="M0 14C140 10 220 17 360 13 500 9 580 16 720 12 840 9 920 15 1000 12"
          stroke="var(--color-decor-doi)"
          strokeWidth="2.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Bụi bên trái, mốc 4%: ba nhánh cỏ và một bông hồng. */}
      <svg
        viewBox="0 0 40 22"
        className="absolute bottom-[35%] left-[4%] h-5.5 w-10"
        fill="none"
        focusable="false"
      >
        <g stroke="var(--color-decor-la-dam)" strokeWidth="2.2" strokeLinecap="round">
          <path d="M10 22C9 16 7 12 4 9" />
          <path d="M14 22C14 15 15 10 17 6" />
          <path d="M18 22C20 17 23 13 27 11" />
        </g>
        <Hoa x={31} y={22} mau="var(--color-decor-hoa-hong)" s={0.85} />
      </svg>

      {/* Bụi giữa, mốc 40%: thấp và thưa nhất, chỉ hai nhánh cỏ với một bông nhỏ.
          Ba bụi giống nhau thì thành hoa văn lặp; bụi giữa phải là bụi mờ nhất, nó
          nằm đúng dưới câu chữ dài nhất của chân trang. */}
      <svg
        viewBox="0 0 30 22"
        className="absolute bottom-[40%] left-[40%] h-4.5 w-7.5"
        fill="none"
        focusable="false"
      >
        <g stroke="var(--color-decor-la-dam)" strokeWidth="2" strokeLinecap="round">
          <path d="M8 22C8 17 9 13 11 10" />
          <path d="M12 22C14 18 17 15 20 13" />
        </g>
        <Hoa x={24} y={22} mau="var(--color-decor-hoa-vang)" s={0.55} />
      </svg>

      {/* Bụi bên phải, mốc 74%: hai bông, khác cỡ khác màu với bên trái — không phải
          một cặp đối xứng. */}
      <svg
        viewBox="0 0 46 22"
        className="absolute bottom-[43%] left-[74%] h-5.5 w-11.5"
        fill="none"
        focusable="false"
      >
        <g stroke="var(--color-decor-la-dam)" strokeWidth="2" strokeLinecap="round">
          <path d="M8 22C8 17 7 13 5 10" />
          <path d="M12 22C13 16 15 12 18 9" />
        </g>
        <Hoa x={24} y={22} mau="var(--color-decor-hoa-vang)" s={0.75} />
        <Hoa x={38} y={22} mau="var(--color-decor-hoa-hong)" s={0.6} />
      </svg>
    </div>
  );
}

export function SiteFooter() {
  return (
    /*
     * `pb-6` nằm ở khung chữ bên trong, KHÔNG ở thẻ <footer>.
     *
     * Dải đất cuối trang là phần tử cuối cùng của trang, nên padding đặt ở <footer>
     * sẽ thành 24px nền kem NẰM DƯỚI mặt đất — một khe hở giữa mặt đất và đáy trang,
     * đúng thứ mà cả dải đất tồn tại để lấp. Chuyển vào trong thì khoảng cách giữa
     * chữ và mặt đất vẫn còn, ở cả hai khổ màn hình.
     */
    <footer className="mt-auto" data-testid="site-footer">
      <div className="mx-auto w-full max-w-5xl px-5 pb-6 text-sm text-ink-soft">
        <VienDat />
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
          {/* Chỉ hiện dưới `sm` — trên đó nút nằm ở thanh điều hướng. Lý do ở `ThemeToggle`. */}
          <ThemeToggle viTri="chan-trang" />
        </div>
      </div>
      {/* Ngoài khung 1024px và không có `px-5`: mặt đất phải chạy suốt hai mép màn
          hình. Nằm trong khung thì hai đầu đất cụt ngang, cách mép 20px — một dải
          đất lửng lơ giữa trang chứ không phải mặt đất. */}
      <DatCuoiTrang />
    </footer>
  );
}
