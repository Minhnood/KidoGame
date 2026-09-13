import { DauTrangCho, KhungCho, O } from '@/components/dang-tai';

/**
 * Khung chờ của trang game — trang NẶNG NHẤT và cũng là trang trẻ mở nhiều nhất.
 *
 * Đo trên production, prefetch bị chặn: 987 ms trên mạng nhanh và 2.776 ms trên 3G
 * chậm mà màn hình không đổi một pixel. File này tồn tại để xoá đúng khoảng đó.
 *
 * KHUNG GAME dựng bằng `stage-frame` THẬT, không phải một ô xám hình chữ nhật. Lớp đó
 * đã chốt `max-width: 720px` và `aspect-ratio: 720/584`, nên ô chờ chiếm đúng chỗ mà
 * khung game sắp chiếm — sai tỉ lệ ở đây là cả trang bên dưới trượt một nhịp lúc game
 * tới, mà bên dưới chính là hàng icon và hàng lời nhắn. Trẻ đang đưa tay tới thả tim
 * thì hàng nút đó nhảy đi chỗ khác.
 *
 * Nền khung là `chrome` (tối, ở cả hai giao diện) nên nó KHÔNG thở như mấy ô xám kia:
 * một hình chữ nhật tối cỡ này nhấp nháy giữa màn hình là thứ chói nhất trên trang.
 */
export default function DangTaiGame() {
  return (
    <KhungCho cauNoi="Đang mở game, đợi một chút nhé…">
      <DauTrangCho />

      {/* Không thêm lề trên cho khung game: trang thật đặt `<StageFrame/>` ngay sau
          `<PageTitle/>`, không có lớp bọc nào ở giữa. Thêm một `mt-*` cho "thoáng" ở
          đây là tự tay tạo ra cú xê dịch mà cả file này sinh ra để xoá. */}
      {/*
        Khung game chờ mang HÌNH TAM GIÁC CHƠI mờ ở giữa, không phải một hình chữ nhật
        đen trơn.

        Một mảng tối cỡ 720×584 chiếm gần hết màn hình đầu; để trống trơn thì nó đọc
        ra là "hỏng rồi" chứ không phải "sắp có". Cùng hình tam giác trên mọi thẻ game
        và trên vòng xoay vừa bấm — ba chỗ, một dấu hiệu, cùng một câu: game chạy ở
        đây.

        `opacity-20`: đây là hình TRANG TRÍ báo chỗ, không phải nút. Đậm hơn thì nó
        thành một nút mời bấm, mà bấm vào không có gì cả — đúng cái bẫy `91852ee`, lần
        này dựng lại bằng một hình vẽ.
      */}
      {/*
        CĂN GIỮA PHẢI NẰM Ở LỚP CON, KHÔNG PHẢI TRÊN `.stage-frame`.

        `.stage-frame` tự đặt `display: block`, và trong `globals.css` nó nằm SAU tầng
        utility của Tailwind → cùng độ ưu tiên (0,1,0), cái sau thắng. Viết
        `className="stage-frame grid place-items-center"` thì lớp `grid` thua im lặng:
        `place-items-center` vô nghĩa trên `block`, tam giác dính sát đỉnh khung —
        lệch 251px mà không có gì đỏ ở đâu cả.
      */}
      <div className="stage-frame" aria-hidden="true">
        <div className="grid h-full place-items-center">
          <svg viewBox="0 0 24 24" className="kg-o-mo size-20 text-chrome-ink opacity-20" focusable="false">
            <path
              d="M9 6.8 18.2 12 9 17.2Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      <div className="mx-auto max-w-180">
        {/* Hàng icon: năm viên tròn 44px, `mt-5` — đúng cỡ và đúng lề của `HangIcon`
            trên trang thật. */}
        <div className="mt-5 flex flex-wrap items-center gap-2" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <O key={i} className="size-11 rounded-full" />
          ))}
        </div>

        <O className="mt-4 h-4 w-72 max-w-full" />

        {/* Hai nút dưới cùng: "Tải file .sb3" và "Xem game khác". */}
        <div className="mt-6 flex flex-wrap gap-2.5" aria-hidden="true">
          <O className="h-11 w-36 rounded-full" />
          <O className="h-11 w-40 rounded-full" />
        </div>
      </div>
    </KhungCho>
  );
}
