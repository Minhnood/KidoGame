import { LinkCho } from '@/components/link-cho';

/**
 * Logo KidoGame: một dấu hiệu vuông bo góc, rồi tên viết bằng chữ.
 *
 * Vì sao thêm dấu hiệu chứ không để tên trần như bản cũ: thanh điều hướng bản cũ
 * có ba cụm chữ cạnh nhau — tên trang, mấy mục điều hướng, nút đổi giao diện — và
 * cả ba đều là chữ đậm cỡ xấp xỉ nhau. Không có gì nói cho mắt biết đâu là tên
 * trang; mắt phải ĐỌC mới biết, mà đọc là việc chậm. Một khối màu đặc thì nhận ra
 * trước khi đọc, và trẻ chưa đọc thông thì nó là cách duy nhất.
 *
 * Hình bên trong là ĐẦU MÈO, không phải chữ K hay ngôi sao. Mèo là mascot của Scratch,
 * nên đứa trẻ nào đã mở Scratch một lần là nhận ra ngay trang này thuộc thế giới nào —
 * thứ mà một hình trung tính không nói được. Chữ K ở cỡ 28px chỉ còn là một vệt.
 *
 * BA HÌNH ĐÃ THỬ RỒI BỎ, cả ba đều chết ở đúng cỡ 28px:
 *
 * - Khối lệnh Scratch: cái RÃNH LÕM trên đầu khối là thứ duy nhất phân biệt nó với một
 *   hình chữ nhật, mà rãnh ấy sâu chừng 1.8/24 đơn vị — ở 28px là hơn một pixel. Mất
 *   rãnh thì còn lại một cục.
 * - Tay cầm game: hai nút, dấu chữ thập và thân bo góc là bốn chi tiết trên 16px. Ở cỡ
 *   nhỏ tất cả nhoè vào nhau thành một vệt đen.
 * - Đầu mèo BỎ MẮT: ở 96px vẫn ra con mèo, nhưng ở 28px thành một cục có hai cái sừng.
 *   HAI LỖ MẮT mới là thứ làm mắt đọc ra "cái mặt"; bỏ chúng đi là bỏ đúng phần mang
 *   nghĩa. Nên mắt ở đây không phải chi tiết trang trí, nó là bắt buộc.
 *
 * Hai lỗ mắt là LỖ THẬT (`fill-rule="evenodd"`), không phải hai chấm tô màu nền: dải
 * chuyển sắc cam phía sau lộ qua đúng chỗ ấy, nên mắt sáng dần từ trên xuống cùng nhịp
 * với cả khối. Tô hai chấm bằng một màu cam chốt cứng thì ở nửa dưới của dải nó lệch
 * tông, và cái lệch ấy trông như vết bẩn chứ không ai đọc ra là lỗi màu.
 *
 * Nút chơi tam giác KHÔNG mất đi — nó vẫn là hình trên nút chơi của thẻ game
 * (`TamGiac` trong `game-card.tsx`), và ở đó nó đúng nghĩa "bấm vào là chạy". Chỉ có
 * dấu hiệu thương hiệu là đổi.
 *
 * KHÔNG có `aria-label` riêng và hình thì `aria-hidden`: chữ "KidoGame" ngay bên
 * cạnh đã là tên của link. Đặt nhãn cho cả hai là trình đọc màn hình đọc tên trang
 * hai lần mỗi trang.
 */
export function SiteLogo() {
  return (
    <LinkCho
      href="/"
      nen="toi"
      /*
       * `group` để dấu hiệu nảy nhẹ khi trỏ vào — cả cụm là MỘT link, nên phản hồi
       * cũng phải là của cả cụm, không phải riêng chữ.
       *
       * `shrink-0`: logo là mốc nhận diện, thà để phần bên phải chật còn hơn để chữ
       * "KidoGame" bị bóp méo hay xuống dòng giữa chừng.
       */
      className="group flex shrink-0 items-center gap-2 no-underline sm:gap-2.5"
    >
      <span
        aria-hidden="true"
        /*
         * Cỡ chốt cứng theo px chứ không theo cỡ chữ: dấu hiệu phải là một hình
         * vuông thật. Dùng `size-7` (28px) là đủ nhỏ để không đội thanh nav cao lên
         * mà vẫn còn ra hình ở khoảng cách người ta thật sự ngồi.
         *
         * Bo 9px, không phải tròn hẳn: tròn hẳn thì nó thành một cái chấm giống nút
         * bấm, mà cạnh vuông thì cứng. Bo mạnh nhưng còn thấy góc là đúng cái ngôn
         * ngữ hình của trang (thẻ game bo 16px, ô nhập bo 12px).
         *
         * `hidden min-[400px]:grid` — DƯỚI 400px THÌ KHÔNG VẼ, và con số này đo ra
         * chứ không chọn cho đẹp. Dấu hiệu cộng khoảng cách là 36px, mà thanh điều
         * hướng ở 360px chỉ còn thừa đúng 1px: thêm vào là trang tràn ngang 35px.
         * Đo được: 360px tràn 35, 390px tràn 5, 400px vừa khít, 414px thừa chỗ.
         *
         * Vì sao ẩn dấu hiệu chứ không cho thanh xuống hai hàng: điện thoại phổ
         * biến nhất nằm đúng khoảng 390–430px, cho cả dải đó thành header cao gấp
         * rưỡi để giữ một hình trang trí thì đắt hơn giá trị nó mang lại. Tên trang
         * viết bằng chữ vẫn còn nguyên, không mất gì về nhận diện.
         *
         * NỀN LÀ DẢI CHUYỂN SẮC DỌC, không phải một mảng cam phẳng: sáng ở trên,
         * `accent-dark` ở dưới. Đó là cách vẽ ánh sáng đến từ phía trên — cùng thứ
         * làm quả táo trong tranh hai bên lề tròn ra chứ không dẹt như chấm sơn.
         * Một mảng cam phẳng thì đúng màu thương hiệu nhưng trông như chưa tô xong.
         *
         * `shadow-accent/30` là một vệt sáng CAM hắt xuống nền, không phải bóng đen.
         * Bóng đen trên nền tím đêm thì không thấy gì; còn quầng cam thì làm dấu
         * hiệu như đang phát sáng, và đó là chỗ duy nhất trên thanh nav được phép
         * hút mắt nhất.
         */
        className="hidden size-7 shrink-0 place-items-center rounded-[9px] bg-linear-to-b from-accent to-accent-dark shadow-lg shadow-accent/30 transition-all group-hover:-rotate-3 group-hover:scale-105 group-hover:shadow-accent/45 min-[400px]:grid sm:size-8 sm:rounded-[10px]"
      >
        {/*
          Vẽ bằng `stroke` CÙNG MÀU với `fill`, không phải fill trần. Fill trần cho hai
          chóp tai nhọn hoắt như mũi dao; thêm nét viền có đầu tròn thì hai chóp lượn
          lại, và cả trang này bo góc chỗ nào cũng được thì cái mũi nhọn duy nhất sẽ lộ
          ra ngay. Nét ở đây mảnh (0.9) chứ không dày như hồi vẽ tam giác: nét dày thì
          nó cũng bịt luôn hai lỗ mắt.

          Màu là `chrome` (xanh đen cố định), không phải `ink`: nền cam không đảo màu
          theo giao diện, nên chữ và hình trên nó cũng phải cố định tối. Dùng `ink` ở
          đây thì bật giao diện tối là hình sáng trên nền cam, chìm mất.

          Cỡ nhích lên `size-4.5` (18px trong khối 28px): con mèo có hai tai chìa lên
          nên phần thân thật của hình thấp hơn hộp bao, để đúng 16px như tam giác thì
          cái mặt bé lại và hai lỗ mắt tụt xuống dưới ngưỡng nhìn ra.
        */}
        <svg viewBox="0 0 24 24" className="size-4.5 sm:size-5" focusable="false">
          <path
            d={
              // Hai tai, đầu bầu, rồi hai lỗ mắt — cùng một path để evenodd đục được lỗ.
              'M6.2 8.6 5.4 3.6 9.8 6.4A9 9 0 0 1 14.2 6.4L18.6 3.6 17.8 8.6' +
              'A7.4 7.4 0 0 1 20.4 14.2 8.4 8.4 0 0 1 12 21 8.4 8.4 0 0 1 3.6 14.2' +
              'A7.4 7.4 0 0 1 6.2 8.6Z' +
              'M9.4 12.6a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z' +
              'M14.6 12.6a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z'
            }
            fillRule="evenodd"
            fill="var(--color-chrome)"
            stroke="var(--color-chrome)"
            strokeWidth="0.9"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="text-lg font-extrabold tracking-tight sm:text-xl">
        Kido<span className="text-accent">Game</span>
      </span>
    </LinkCho>
  );
}
