/**
 * Tranh trang trí ở hai bên lề: đồi, cây, cỏ, hoa, mây, chim — và mặt trời ban ngày
 * đổi thành trăng sao ban đêm.
 *
 * Nội dung của KidoGame rộng tối đa 1024px, nên trên màn hình to hai bên bỏ trống
 * một khoảng lớn. Đây là trang cho trẻ em, và một dải trắng trơn hai bên là thứ
 * người lớn quen mắt chứ trẻ con thì không.
 *
 * BỐN RÀNG BUỘC, đừng gỡ cái nào:
 *
 * 1. `aria-hidden` + không có phần tử nào focus được. Đây là hình thuần trang trí,
 *    không mang thông tin gì; để trình đọc màn hình đọc nó là bắt người mù nghe
 *    mô tả một cái cây trước khi tới được nội dung. `infra/a11y-check.mjs` đếm số
 *    điểm tab của mỗi trang — thêm một điểm tab vào đây là sai.
 *
 * 2. `pointer-events-none`. Nó phủ toàn khung nhìn; thiếu dòng này là nó nuốt mọi
 *    cú bấm của cả trang.
 *
 * 3. `overflow-hidden` trên khung ngoài. Không có nó, một cái cây thò ra ngoài mép
 *    là trang phải vuốt ngang — đúng loại lỗi mà bộ kiểm tràn ngang tồn tại để bắt.
 *
 * 4. `hidden xl:block` — chỉ hiện từ 1280px. Dưới mức đó KHÔNG có lề nào để vẽ:
 *    cây sẽ nằm đè lên nội dung. Đây là trang trí cho chỗ thừa, không phải một
 *    thành phần của giao diện.
 *
 *    ĐÃ CÂN VIỆC ĐẨY MỐC NÀY LÊN `2xl` (1536px) VÀ QUYẾT ĐỊNH KHÔNG. Đo được: ở
 *    1280px lề chỉ 128px nên tỉ lệ vẽ là 128/300 = 0.43, lá còn khoảng 10px và hoa
 *    gần thành đốm màu; ở 1536px tỉ lệ là 0.85 và mọi chi tiết đọc rõ. Nhưng ẩn tới
 *    1536px thì 1366px và 1440px — hai cỡ màn laptop phổ biến nhất — mất sạch trang
 *    trí, tức trả lại đúng dải trắng trơn mà cả file này tồn tại để tránh. Chi tiết
 *    nhỏ hơn là cái giá nhẹ hơn hẳn không có gì.
 *
 *    CÁI TỈ LỆ 0.43 ẤY ĐÃ ĐƯỢC SỬA, xem `LAN` bên dưới — nay 0.64 ở 1280px, và
 *    không đổi gì ở mọi cỡ từ 1536px trở lên. Cách làm KHÔNG phải cách ghi chú này
 *    từng dự tính (một bộ path cành ngắn cho khung 200 đơn vị): bản vẽ thứ hai là
 *    đúng cái bẫy `Canh` đã cảnh báo, và còn phải nhân đôi cả đồi, cây, cỏ, hoa cho
 *    tỉ lệ giữa chúng khỏi lệch. Vẫn đúng nguyên tắc "lề hẹp thì vẽ ÍT hơn chứ không
 *    NHỎ hơn", chỉ đạt bằng cách khác: đẩy phần thừa ra ngoài mép màn hình.
 *
 * BỀ RỘNG PHẢI THEO MÀN HÌNH. Ở đúng 1280px mỗi bên lề chỉ có (1280−1024)/2 = 128px,
 * nên tranh phải hẹp hơn thế; tới 1536px thì lề rộng 256px và tranh mới được to ra.
 * Bản đầu tiên vẽ cứng 144px và đã lấn vào nội dung ở đúng mốc 1280px.
 *
 * KHUNG VẼ RỘNG 300 ĐƠN VỊ, KHÔNG PHẢI 200 — và đây là chỗ đã sai một lần.
 *
 * Bản trước vẽ trên khung 200 đơn vị rồi chặn bề rộng ở 300px. Trên màn 1920 lề
 * rộng 448px, nên tranh dừng ở 300px và còn trơ ra một dải trống 148px cạnh nội
 * dung; tệ hơn, cả ba hình đều VẼ RA NGOÀI khung của chính nó (đồi tới đơn vị 208,
 * ngọn cành tới 208) nên thẻ <svg> xén phăng phần thừa thành một nhát dọc giữa
 * trang — sườn đồi đứt ngang, ngọn cành mất mấy chiếc lá.
 *
 * Cách sửa KHÔNG phải là bỏ trần cho tranh phóng to: 448/200 = tỉ lệ 2.24, quả táo
 * to gấp rưỡi hôm nay. Lề rộng thêm thì phải vẽ NHIỀU hơn chứ không vẽ TO hơn. Nên
 * khung nới ra 300 đơn vị và cành được vẽ dài thêm cho kín chỗ: 448/300 = 1.49,
 * đúng bằng tỉ lệ cũ, từng chiếc lá và quả táo giữ nguyên cỡ trên màn hình.
 *
 * Trần 32rem = 512px, vừa kín lề của mọi khung nhìn tới 2048px. Rộng hơn nữa thì
 * dải trống quay lại — chấp nhận, vì bỏ trần là quay về đúng cái đã phải sửa.
 *
 * MỌI HÌNH PHẢI VẼ GỌN TRONG KHUNG CỦA NÓ. Mép ngoài (x≈0) thì tràn ra được, vì
 * chỗ đó là mép màn hình, phần thừa nằm ngoài tầm mắt — cành cố ý mọc từ đó ra.
 * Mép TRONG thì không: tràn một đơn vị là một nhát cắt dọc nằm giữa trang.
 *
 * Màu lấy từ nhóm token `--color-decor-*`, tách hẳn khỏi bảng màu giao diện. Việc
 * đổi cảnh ngày/đêm nằm ở `.kg-ngay` / `.kg-dem` trong `globals.css`.
 */

/**
 * Bề rộng của mọi hình trang trí: đúng bề rộng bên lề, có trần.
 *
 * Một chỗ duy nhất cho cả bốn cành và hai mặt đất — ba hình cùng nằm trên một lề
 * thì phải cùng một bề rộng, không thì cái nọ thò ra khỏi cái kia.
 */
const RONG_LE = 'w-[calc(min((100vw-64rem)/2,32rem)+var(--kg-lan))]';

/**
 * Khoảng tranh được LAN RA NGOÀI mép màn hình, chỉ ở dải màn hình hẹp.
 *
 * Đây là cách giải bài "ở 1280px tỉ lệ vẽ chỉ 0.43" mà ghi chú đầu file để lại, và
 * nó KHÔNG phải cách ghi chú đó dự tính. Cách dự tính là vẽ thêm một bộ path cành
 * ngắn cho khung 200 đơn vị — nhưng thế là hai bản vẽ tay của cùng một cái cành,
 * đúng cái bẫy `Canh` đã cảnh báo, và còn phải nhân đôi cả quả đồi, cái cây, bụi cỏ
 * và mấy bông hoa để tỉ lệ giữa chúng khỏi lệch nhau.
 *
 * Cách này giữ ĐÚNG MỘT bản vẽ. Ghi chú đầu file nói rõ mép NGOÀI (x≈0) tràn ra
 * được vì nó nằm ngoài tầm mắt, còn mép TRONG thì tràn một đơn vị là một nhát cắt
 * dọc giữa trang. Vậy thì cho tranh rộng hơn lề rồi đẩy đúng phần thừa ấy ra ngoài
 * mép màn hình: mép trong vẫn dừng đúng ở biên nội dung, còn chỗ bị che là gốc cành
 * và chân đồi — chỗ vốn đã tràn.
 *
 * Vẽ ÍT hơn chứ không NHỎ hơn, đúng nguyên tắc cũ: thấy ít hình hơn, mà từng chiếc
 * lá vẫn đúng cỡ.
 *
 * Con số giảm dần tới 0 ở 1536px thay vì tắt đột ngột theo breakpoint: nhảy bậc thì
 * người kéo cửa sổ qua mốc đó thấy cả bức tranh giật một cái. Tỉ lệ vẽ đo được —
 * 1280: 0.43 → 0.64, 1366: 0.57 → 0.71, 1440: 0.69 → 0.77, 1536: 0.85 và mọi cỡ
 * lớn hơn KHÔNG ĐỔI, nên quả táo trên màn 1920 vẫn đúng cỡ hôm qua.
 */
/*
 * KHOẢNG TRẮNG QUANH DẤU TRỪ LÀ BẮT BUỘC, và thiếu nó thì hỏng im lặng.
 *
 * CSS `calc` đòi space quanh `-` và `+`; `(96rem-100vw)` là cú pháp sai. Nhưng một
 * custom property chấp nhận gần như mọi chuỗi mà không kêu, nên `--kg-lan` vẫn được
 * đặt bình thường và lỗi chỉ lộ ra khi giá trị ấy được thay vào `calc` của chỗ khác
 * — lúc đó cả biểu thức thành vô hiệu, `width` rơi về `auto`, và mọi hình trang trí
 * giãn ra bằng cả khung nhìn. Đo được lần đầu: sáu svg đều rộng đúng 1280px và tỉ
 * lệ vẽ 4.27, tức tranh phủ kín trang, không một dòng lỗi nào ở đâu.
 *
 * Trong class Tailwind thì không cắn phải, vì Tailwind tự chèn space quanh toán tử
 * trong giá trị arbitrary. Chỉ style inline như dòng này là không ai sửa hộ.
 */
const LAN = 'clamp(0px, (96rem - 100vw) * 0.25, 4rem)';

/**
 * Một MẢNG tán lá: nhiều hình tròn chồng lên nhau, cùng một màu.
 *
 * Vì sao không vẽ một đường path có viền răng cưa: mép lá lởm chởm cần vài chục
 * cung tròn nối nhau, viết tay thì dài và sửa một chỗ là lệch cả mảng. Chồng hình
 * tròn cho ra đúng cái silhouette gợn sóng ấy, mà mỗi hình chỉ là ba con số — thêm
 * bớt một cụm lá là thêm bớt một dòng.
 */
function MangLa({ c, mau }: { c: Array<[number, number, number]>; mau: string }) {
  return (
    <g fill={mau}>
      {c.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} />
      ))}
    </g>
  );
}

/**
 * Cây tán rộng, dựng theo BA LỚP lá — đây là toàn bộ khác biệt so với bản cũ.
 *
 * Bản cũ là ba hình tròn xanh trên một cái que: đúng là "cây" nhưng phẳng lì, không
 * có khối. Cây thật (và tranh vẽ cây) có lớp lá tối ở sau và dưới, lớp giữa, rồi
 * những mảng bắt nắng sáng nhất nằm trên đỉnh. Ba lớp đó mới làm ra chiều sâu.
 *
 * Thân cũng vậy: một hình chữ nhật bo góc không ra cái cây nào cả. Ở đây thân thon
 * dần lên trên, xoè bạnh ở gốc, có nhánh chĩa vào trong tán, và một vệt sáng dọc
 * một bên để thân tròn ra chứ không dẹt.
 *
 * `lat` LẬT NGANG cả cây. Cần nó vì một bên lề giờ có ba cây: ba cái cùng một dáng
 * đứng cạnh nhau thì không ra bụi cây, ra một cây bị dán ba lần — cỡ khác nhau vẫn
 * không cứu được, vì mắt nhận ra hình dáng trước khi nhận ra kích thước. Lật thì
 * tán lệch sang phía khác, vệt sáng thân đổi bên, cặp nhánh chĩa ngược lại; cùng
 * một cái cây mà đọc ra là hai cây khác nhau.
 */
function Cay({
  x,
  y,
  s = 1,
  delay = 0,
  lat = false,
}: {
  x: number;
  y: number;
  s?: number;
  delay?: number;
  lat?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${lat ? -s : s} ${s})`}>
      {/* Vạt cỏ dưới gốc: cây phải đứng TRÊN cái gì đó, không thì nó lơ lửng. */}
      <ellipse cx="0" cy="4" rx="62" ry="13" fill="var(--color-decor-co)" />

      {/* Thân: bạnh gốc xoè hai bên rồi thon dần lên. */}
      <path
        d="M-30 4c6-10 12-16 14-34 2-16 2-38 1-62h30c-1 24-1 46 1 62 2 18 8 24 14 34Z"
        fill="var(--color-decor-than)"
      />
      {/* Vệt sáng dọc thân. Lệch sang một bên, không đặt giữa: đặt giữa thì thành
          một cái sọc chứ không phải ánh sáng hắt từ một phía. */}
      <path
        d="M4 0c4-10 7-16 8-32 1-14 1-34 0-56h9c-1 22-1 42 1 56 2 16 5 22 9 32Z"
        fill="var(--color-decor-than-sang)"
        opacity="0.55"
      />

      {/*
        Nhánh chĩa lên, đâm vào trong tán — và phải LỘ RA một khúc dưới tán.
        Bản đầu vẽ tán trùm xuống tận chỗ nhánh nên cả bộ nhánh biến mất, cây lại
        thành một cục lá đặt trên cái que. Cây trong tranh nhìn ra là cây chính nhờ
        khúc nhánh trần nằm giữa thân và tán.
      */}
      <g stroke="var(--color-decor-than)" strokeWidth="7" strokeLinecap="round" fill="none">
        <path d="M-8-96C-20-112-34-124-52-134" />
        <path d="M8-100C20-116 38-128 56-136" />
        <path d="M0-104v-32" />
      </g>
      <g stroke="var(--color-decor-than)" strokeWidth="4.5" strokeLinecap="round" fill="none">
        <path d="M-34-120C-44-130-54-136-66-140" />
        <path d="M34-122C44-134 56-140 68-144" />
      </g>

      {/* Ba lớp lá. Lớp tối vẽ TRƯỚC và rộng nhất, lớp sáng vẽ SAU và nhỏ nhất —
          đảo thứ tự là mất hết chiều sâu, tán thành một mảng bẹt. */}
      <g
        className="kg-dua"
        style={{ animationDelay: `${delay}s` }}
        transform="translate(0 -34)"
      >
        <MangLa
          mau="var(--color-decor-la-dam)"
          c={[
            [-72, -112, 30],
            [-40, -132, 34],
            [0, -142, 38],
            [40, -132, 34],
            [72, -112, 30],
            [-58, -92, 26],
            [58, -92, 26],
            [0, -104, 32],
          ]}
        />
        <MangLa
          mau="var(--color-decor-la)"
          c={[
            [-52, -122, 26],
            [-20, -140, 30],
            [16, -140, 30],
            [48, -122, 26],
            [-32, -106, 24],
            [32, -106, 24],
            [0, -120, 28],
          ]}
        />
        <MangLa
          mau="var(--color-decor-la-sang)"
          c={[
            [-26, -142, 20],
            [4, -150, 23],
            [30, -138, 18],
            [-46, -128, 14],
          ]}
        />
      </g>
    </g>
  );
}

/**
 * Bông hoa năm cánh. Chi tiết nhỏ nhất trong tranh, và là thứ làm nó bớt trơ.
 *
 * `cuong` và `tam` cho phép đổi màu cuống và nhị, để thanh điều hướng dùng lại được
 * bông hoa NÀY ở tông tối hơn — cùng lý do như nút `mau` của chiếc lá.
 */
export function Hoa({
  x,
  y,
  mau,
  s = 1,
  cuong = 'var(--color-decor-la-dam)',
  tam = 'var(--color-decor-troi)',
}: {
  x: number;
  y: number;
  mau: string;
  s?: number;
  cuong?: string;
  tam?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0v-9" stroke={cuong} strokeWidth="2" strokeLinecap="round" />
      {[0, 72, 144, 216, 288].map((g) => (
        <circle key={g} cx={0} cy={-13} r="3.4" fill={mau} transform={`rotate(${g} 0 -9)`} />
      ))}
      <circle cx="0" cy="-9" r="2.6" fill={tam} />
    </g>
  );
}

const TONG_LA = [
  'var(--color-decor-la-dam)',
  'var(--color-decor-la)',
  'var(--color-decor-la-sang)',
] as const;

/**
 * Chiếc lá: một hình thoi bo tròn, xoay theo hướng cành.
 *
 * `mau` ghi đè tông lá, và nó tồn tại để thanh điều hướng dùng lại được chiếc lá
 * NÀY thay vì vẽ một chiếc thứ hai. Lá trên thanh nav phải hạ tông (nền tối), nhưng
 * phải là cùng một hình: hai bản vẽ tay của cùng một chiếc lá thì sớm muộn lệch
 * nhau, và lúc đó trang có hai loại lá mà không ai biết vì sao.
 */
export function La({
  x,
  y,
  g,
  t = 1,
  s = 1,
  mau,
}: {
  x: number;
  y: number;
  g: number;
  t?: 0 | 1 | 2;
  s?: number;
  mau?: string;
}) {
  return (
    <path
      d="M0 0c9-8 20-8 26 0-6 8-17 8-26 0Z"
      transform={`translate(${x} ${y}) rotate(${g}) scale(${s})`}
      fill={mau ?? TONG_LA[t]}
    />
  );
}

/**
 * Vị trí lá trên cành: [x, y, góc xoay, tông màu, cỡ].
 *
 * Liệt kê thẳng ra thay vì rải theo công thức, vì cành là một đường cong bậc ba và
 * lấy điểm trên nó lúc render thì phải có DOM (`getPointAtLength`) — thứ không tồn
 * tại khi trang dựng ở server. Bù lại, đặt tay thì chỉnh được từng chiếc cho tán
 * dày thưa đúng ý.
 *
 * Bản trước chỉ có 8 chiếc và cành trông trụi. Ba tông màu xen kẽ chứ không một
 * màu: cùng một màu thì 27 chiếc lá chồng nhau thành một vệt xanh liền, đông mà
 * vẫn không thấy có lá.
 *
 * CHIẾC LÁ MỌC VỀ BÊN PHẢI CHỖ NÓ ĐƯỢC ĐẶT, dài chừng 26×cỡ đơn vị. Nên lá cuối
 * cùng phải đặt ở x ≤ 300 − 26×cỡ, không thì nó bị mép trong khung xén dọc —
 * đúng cái lỗi đã phải sửa. Ở đây lá xa nhất là x=280 cỡ 0.65, tới 297.
 */
const LA_TREN_CANH: Array<[number, number, number, 0 | 1 | 2, number]> = [
  // Dọc cành chính, so le trên dưới.
  [8, 52, -34, 0, 0.8],
  [18, 62, 26, 1, 0.7],
  [26, 48, -40, 1, 0.85],
  [36, 60, 20, 0, 0.75],
  [44, 46, -30, 2, 0.8],
  [54, 56, 28, 1, 0.7],
  [62, 42, -38, 1, 0.9],
  [72, 52, 22, 0, 0.75],
  [80, 38, -26, 2, 0.8],
  [90, 48, 30, 1, 0.7],
  [98, 34, -34, 0, 0.85],
  [108, 44, 24, 1, 0.75],
  [116, 30, -28, 2, 0.8],
  [126, 40, 26, 0, 0.7],
  [134, 26, -36, 1, 0.85],
  [144, 36, 22, 1, 0.7],
  [152, 22, -24, 2, 0.8],
  [162, 32, 28, 0, 0.7],
  [170, 18, -32, 1, 0.85],
  [180, 28, 20, 1, 0.7],
  [188, 16, -26, 2, 0.75],
  // Nhánh con vươn lên.
  [66, 40, -54, 0, 0.75],
  [76, 30, -48, 1, 0.8],
  [86, 22, -42, 2, 0.7],
  [94, 14, -50, 1, 0.75],
  // Nhánh con rủ xuống.
  [100, 52, 44, 0, 0.75],
  [110, 62, 40, 1, 0.8],
  [120, 70, 36, 1, 0.7],
  [128, 78, 42, 2, 0.75],
  // Khúc ngọn vẽ thêm khi khung nới từ 200 lên 300 đơn vị. Vẫn so le trên dưới,
  // và cỡ nhỏ dần ra ngoài ngọn — cành thon lại thì lá cũng phải nhỏ theo.
  [198, 26, 24, 1, 0.75],
  [206, 14, -30, 0, 0.8],
  [216, 25, 22, 2, 0.7],
  [224, 13, -28, 1, 0.8],
  [234, 24, 26, 0, 0.7],
  [242, 12, -26, 2, 0.75],
  [252, 23, 24, 1, 0.7],
  [260, 11, -30, 0, 0.75],
  [270, 22, 22, 2, 0.7],
  [276, 10, -26, 1, 0.7],
  [280, 20, 24, 0, 0.65],
  // Nhánh con vươn lên ở khúc ngọn.
  [218, 20, -48, 1, 0.7],
  [228, 13, -44, 2, 0.75],
  [238, 8, -40, 0, 0.7],
  [246, 6, -46, 1, 0.7],
  // Nhánh con rủ xuống ở khúc ngọn, mang quả.
  [240, 30, 42, 0, 0.7],
  [248, 38, 40, 1, 0.75],
  [256, 44, 38, 2, 0.7],
];

/** Quả táo treo dưới cành: cuống, quả, một vệt sáng và một chiếc lá con. */
function Tao({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M0-16v7"
        stroke="var(--color-decor-than)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M1-13c4-3 9-2 9-2s-1 5-6 5Z" fill="var(--color-decor-la-dam)" />
      <circle cx="0" cy="0" r="10" fill="var(--color-decor-tao)" />
      {/* Vệt sáng làm quả tròn ra chứ không phẳng như một chấm sơn. */}
      <ellipse cx="-3.4" cy="-3.4" rx="3" ry="2.2" fill="var(--color-decor-tao-sang)" />
    </g>
  );
}

/**
 * Quả táo trên cành: [x, độ cao CHỖ DÍNH vào cành, chiều dài cuống tới tâm quả].
 *
 * Ghi bằng chỗ dính chứ không bằng tâm quả, và đây là chỗ đã làm sai một lần. Hồi
 * `ru` còn lật cả thẻ <svg>, quả lật theo thành ra dựng ngược lên trời với cái
 * cuống chĩa xuống đất. Ai nhìn cũng thấy sai ngay, không cần biết gì về cây: quả
 * chín thì trĩu xuống, đó là trọng lực chứ không phải một lựa chọn vẽ.
 *
 * Tách làm hai số thì cả hai chiều cành đều đúng: chỗ dính soi gương theo cành,
 * còn quả luôn treo xuống khỏi chỗ đó đúng một đoạn cuống.
 */
const TAO_TREN_CANH: Array<[number, number, number]> = [
  [46, 55, 23], // trên thân cành chính
  [132, 74, 14], // ở ngọn nhánh con rủ xuống
  [176, 27, 21], // trên thân cành, khúc đã thon
  [262, 48, 16], // ở ngọn nhánh con thứ tư
];

/** Hoa trên cành: [x, độ cao, màu]. Cũng soi gương chỗ đứng nhưng không lật hoa. */
const HOA_TREN_CANH: Array<[number, number, string]> = [
  [70, 30, 'var(--color-decor-hoa-hong)'],
  [140, 26, 'var(--color-decor-hoa-hong)'],
  [112, 62, 'var(--color-decor-hoa-vang)'],
  [204, 32, 'var(--color-decor-hoa-vang)'],
  [238, 16, 'var(--color-decor-hoa-hong)'],
];

/**
 * CÀNH có hoa và táo mọc ngang ra từ mép màn hình.
 *
 * Vẽ cho mép TRÁI; bên phải dùng lại chính nó rồi lật bằng `scaleX(-1)` chứ không
 * vẽ bản thứ hai — hai bản vẽ tay của cùng một cái cành thì sớm muộn sẽ lệch nhau,
 * và lệch ở đây nghĩa là nửa màn hình bên kia trông sai mà không ai biết vì sao.
 *
 * Cả cành NẰM TRONG nhóm `kg-dua-canh`, kể cả khúc gốc: nhờ vậy hộp bao bắt đầu
 * đúng ở x=0, tức đúng chỗ cành dính vào mép, nên nó đu quanh gốc như gió thổi chứ
 * không quay quanh giữa chùm lá như một cái chong chóng.
 *
 * Khung 300×112 — DÀI và THẤP, cố ý. Cành phải rộng bằng cả bên lề, mà lề trên màn
 * 1920 rộng gần 450px; khung vuông thì cành cũng cao ngần ấy và ba cành chồng lên
 * nhau. Dài ngang thì nới rộng bao nhiêu cũng không đội cao lên.
 *
 * Cành chính là BA khúc cong nối nhau, không phải hai: khúc thứ ba (194 → 292) là
 * phần vẽ thêm khi khung nới ra 300 đơn vị, và nó phải nối TIẾP TUYẾN với khúc
 * trước — điểm điều khiển đầu của nó nằm trên đường thẳng kéo dài từ điểm điều
 * khiển cuối của khúc trước, không thì chỗ nối gãy một góc nhìn ra ngay.
 */
function Canh({ delay = 0, ru = false }: { delay?: number; ru?: boolean }) {
  // Soi gương một độ cao qua trục y=45, tức chính giữa khung `0 -13 300 116`:
  // đúng trục đó thì −13 hoá 103 và 103 hoá −13, cành lật xong vẫn vừa khít khung.
  const guong = (y: number) => (ru ? 90 - y : y);
  return (
    <g className="kg-dua-canh" style={{ animationDelay: `${delay}s` }}>
      {/* Thân, nhánh và lá — lật được cả nhóm, vì lá nằm kiểu nào cũng ra lá. */}
      <g transform={ru ? 'translate(0 90) scale(1 -1)' : undefined}>
      {/*
        Cành chính, thon dần ra đầu ngọn — BA nét chồng nhau, không phải một.
        Một nét `stroke` thì dày đều từ gốc ra ngọn, và trước đây ngọn cụt ngang
        bằng gốc; cành dài tới 292 đơn vị rồi thì cái đầu cụt ấy chỉa thẳng vào
        nội dung, nhìn ra ngay. SVG không có nét dày thay đổi được, nên cắt thành
        ba khúc 9 → 7 → 5.

        Ba khúc phải CHỒNG LÊN NHAU vài đơn vị và cùng nằm trên một đường cong.
        Chồng thì đầu tròn của khúc mảnh lọt vào trong khúc dày, chỗ nối chỉ còn
        một cái vai lượn 1 đơn vị; hở ra là thành ba đoạn cành rời.
      */}
      <path
        d="M0 60C36 58 74 50 108 40 136 32 164 27 194 25 202 24.5 210 23.9 218 23.3"
        stroke="var(--color-decor-than)"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M214 23.6C230 22.5 246 21.3 262 20.1"
        stroke="var(--color-decor-than)"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M258 20.4C272 19.5 282 18.9 294 18.2"
        stroke="var(--color-decor-than)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Bốn nhánh con, xen kẽ lên xuống dọc thân cành. Hai cái ngoài ngọn mảnh
          hơn hai cái trong gốc, vì nhánh mọc ở khúc cành đã thon thì không thể to
          bằng nhánh mọc ở khúc gốc. */}
      <path
        d="M62 54C74 40 88 31 104 25"
        stroke="var(--color-decor-than)"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M96 44C106 58 118 68 132 74"
        stroke="var(--color-decor-than)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M212 24C224 14 238 8 252 5"
        stroke="var(--color-decor-than)"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M232 22C240 34 250 42 262 48"
        stroke="var(--color-decor-than)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />

      {LA_TREN_CANH.map(([lx, ly, g, t, s], i) => (
        <La key={i} x={lx} y={ly} g={g} t={t} s={s} />
      ))}
      </g>

      {/*
        HOA VÀ QUẢ NẰM NGOÀI NHÓM LẬT. Chúng có chiều đúng - sai, thân với lá thì
        không: lá nằm kiểu nào cũng ra lá, còn quả táo lật ngược là quả dựng đứng
        với cái cuống chĩa xuống đất, và hoa lật ngược là hoa nở úp mặt xuống.

        Nên chỗ DÍNH vào cành thì soi gương theo cành (`guong`), còn bản thân bông
        hoa với quả táo thì vẽ đứng nguyên chiều. Quả luôn treo XUỐNG khỏi chỗ dính
        một đoạn cuống, dù cành chĩa lên hay rủ xuống.
      */}
      {HOA_TREN_CANH.map(([hx, hy, mau], i) => (
        <Hoa key={i} x={hx} y={guong(hy)} mau={mau} />
      ))}
      {TAO_TREN_CANH.map(([tx, yGan, dai], i) => (
        <Tao key={i} x={tx} y={guong(yGan) + dai} />
      ))}
    </g>
  );
}

/**
 * Một cành đặt ở mép trái hoặc mép phải, tại một độ cao cho trước.
 *
 * Bề rộng = ĐÚNG bề rộng bên lề: `(100vw − 64rem) / 2`, vì nội dung rộng tối đa
 * `max-w-5xl` = 64rem. Chốt cứng theo pixel thì trên màn rộng cành chỉ chiếm một
 * góc và bên lề lại trơ ra — đúng cái đã phải sửa.
 *
 * viewBox bắt đầu ở y = −13 chứ không phải 0: chiếc lá ngả lên cao nhất trên nhánh
 * ngọn nhô lên trên đường cành 10 đơn vị, và khung bắt đầu đúng ở 0 thì nó bị cắt
 * cụt đỉnh. Con số 13 là đo ra rồi chừa thêm 3, không phải chừa cho chắc.
 *
 * `ru` cho ra cành RỦ XUỐNG. Cành vẽ ra là cành chĩa lên — gốc ở y=60 rồi vươn lên
 * 18 ở ngọn. Bảy cành cùng chĩa lên xếp thành một chồng thì ra cái lược, không ra
 * tán cây. Cành rủ lại là cành thật: cành nào trĩu quả thì nó cong xuống. Xen kẽ
 * lên xuống thì bảy cành đọc ra là bảy cành.
 *
 * Việc lật làm BÊN TRONG `Canh`, không phải bằng `-scale-y-100` ở thẻ <svg> này —
 * lật cả thẻ là lật luôn quả táo với bông hoa, mà hai thứ đó có chiều đúng - sai.
 */
function CanhVien({
  ben,
  top,
  delay,
  co = 1,
  ru = false,
}: {
  ben: 'trai' | 'phai';
  top: string;
  delay: number;
  co?: number;
  ru?: boolean;
}) {
  return (
    <svg
      viewBox="0 -13 300 116"
      // Bề rộng đặt thẳng bằng style chứ không dùng RONG_LE: `co` là một con số
      // chạy, mà Tailwind sinh class lúc BIÊN DỊCH — `w-[calc(...*${co})]` thì
      // class ấy không tồn tại và cành mất tăm. Cùng công thức với RONG_LE, chỉ
      // nhân thêm `co`.
      style={{
        top,
        width: `calc((min((100vw - 64rem) / 2, 32rem) + var(--kg-lan)) * ${co})`,
        // Cành nhỏ hơn thì lan ra ngoài ít hơn, đúng theo `co` — không thì cành
        // co=0.7 bị đẩy ra ngoài quá nửa gốc trong khi cành co=1 chỉ mất một khúc.
        [ben === 'trai' ? 'left' : 'right']: `calc(var(--kg-lan) * ${co} * -1)`,
      }}
      className={`absolute ${ben === 'phai' ? '-scale-x-100' : ''}`}
      fill="none"
      focusable="false"
    >
      <Canh delay={delay} ru={ru} />
    </svg>
  );
}

/**
 * Vầng trăng khuyết CÓ QUẦNG SÁNG, và đung đưa cả cụm.
 *
 * Quầng là BẢN SAO LÀM MỜ của chính vầng khuyết, không phải một hình tròn đặt phía sau.
 * Bản đầu dùng hình tròn và nhìn ra là sai ngay: một đĩa xám viền cứng, mà chỗ trăng bị
 * "cắn" lại để lộ đĩa ấy ra — thành một vầng trăng tròn xám có mảnh khuyết sáng, đọc
 * như sơ đồ tuần trăng chứ không phải ánh sáng tỏa ra. Làm mờ đúng hình lưỡi liềm thì
 * ánh sáng ôm theo mép trăng, chỗ bị cắn vẫn tối.
 *
 * `id` phải KHÁC NHAU giữa các chỗ dùng: `url(#...)` tìm theo id trên cả trang, không
 * theo thẻ <svg> chứa nó. Hai bộ lọc trùng id thì cái sau dùng nhầm bộ lọc của cái
 * trước — và nếu cái trước đang `display: none` (tranh bên lề trên màn hẹp) thì quầng
 * biến mất mà không có lỗi nào.
 *
 * Vùng lọc nới ra 200%: mặc định chỉ chừa 10% quanh hình, và vệt mờ bị xén thành một
 * khung chữ nhật mờ có cạnh thẳng.
 */
function QuangTrang({ id, d, mo }: { id: string; d: string; mo: number }) {
  return (
    <g className="kg-trang-dua">
      <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={mo} />
      </filter>
      <path className="kg-quang-trang" d={d} fill="var(--color-decor-troi)" filter={`url(#${id})`} />
      {/* Trăng khuyết: một hình tròn bị một hình tròn nền "cắn" mất một miếng. */}
      <path d={d} fill="var(--color-decor-troi)" />
    </g>
  );
}

/** Hình đám mây, vẽ một lần để dùng hai lần: một lớp bóng và một lớp thân. */
function HinhMay() {
  return (
    <>
      <circle cx="0" cy="0" r="13" />
      <circle cx="16" cy="4" r="10" />
      <circle cx="-15" cy="5" r="9" />
      <rect x="-15" y="1" width="32" height="13" rx="6.5" />
    </>
  );
}

/**
 * Đám mây hai tông: CÙNG một hình, lớp bóng hạ xuống 2.5 đơn vị, lớp thân trắng đè lên.
 *
 * Phần bóng lộ ra đúng ở bụng mây — chỗ mây thật tối nhất vì ánh sáng đến từ trên. Vẽ
 * lại hình lần hai thay vì vẽ một dải bóng riêng: dải riêng thì phải khớp tay với đường
 * cong của ba cục tròn, lệch một chút là thò ra ngoài mép thân thành một vệt xanh lạ.
 * Cùng hình dịch xuống thì bóng tự ôm theo mép.
 */
function May({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g transform="translate(0 2.5)" fill="var(--color-decor-may-bong)">
        <HinhMay />
      </g>
      <g fill="var(--color-decor-may)">
        <HinhMay />
      </g>
    </g>
  );
}

/**
 * Mây của lớp trời chung: vị trí dọc, cỡ, thời gian một lượt bay, độ mờ.
 *
 * NĂM đám, không hơn. Mỗi đám là một hoạt ảnh vô hạn chạy suốt lúc trang mở, và bài
 * học từ cành cây ở thẻ game vẫn còn đó: hơn trăm hoạt ảnh chạy nền là quạt máy tính
 * bảng cũ kêu và pin tụt. Năm cái chỉ đổi `transform` thì trình duyệt đẩy hết sang
 * GPU, không vẽ lại trang.
 *
 * CÀNG NHỎ CÀNG CHẬM VÀ CÀNG MỜ, và ba thứ phải đi cùng nhau. Đó là cách mắt đọc ra
 * chiều sâu: vật ở xa thì nhỏ, nhạt và trôi qua chậm. Cho một đám nhỏ bay nhanh là nó
 * đọc ra như một đám mây con đang chạy, không phải một đám mây ở xa.
 *
 * `tre` ÂM là để lúc mở trang mây ĐÃ nằm rải khắp trời. Trễ dương (hoặc không trễ) thì
 * cả năm đám cùng xuất phát ngoài mép phải, và trong phút đầu tiên trời trống trơn —
 * đúng phút người ta vừa mở trang ra nhìn.
 *
 * Trễ cũng không được là bội số chung của thời gian bay, không thì sau vài vòng hai
 * đám trùng nhịp và dính thành một cục bay cùng nhau.
 */
const MAY_BAY: Array<{ tren: string; rong: string; giay: number; tre: number; mo: number }> = [
  { tren: '9%', rong: '9rem', giay: 95, tre: -22, mo: 0.95 },
  { tren: '27%', rong: '5rem', giay: 150, tre: -97, mo: 0.7 },
  { tren: '46%', rong: '7rem', giay: 115, tre: -61, mo: 0.85 },
  { tren: '66%', rong: '4.5rem', giay: 170, tre: -33, mo: 0.65 },
  { tren: '83%', rong: '8rem', giay: 105, tre: -78, mo: 0.9 },
];

/**
 * Lớp TRỜI chung: mây bay từ mép phải qua mép trái, ngang cả khung nhìn, ở MỌI cỡ màn.
 *
 * Nó thay cho mấy đám mây đứng yên từng nằm trong tranh hai bên lề và dải đất chân
 * trang. Những đám đó chỉ đung đưa ±6px trong 34 giây — đo ra thì có chuyển động,
 * nhìn thì không ai thấy — và chúng bị nhốt trong khung hình nhỏ của mình, nên không
 * đám nào bay ĐI được đâu. Mây bay đi thì phải có cả bầu trời để bay qua.
 *
 * ĐI SAU NỘI DUNG, không bao giờ đè lên. `fixed -z-10` như `SiteDecor`, và đặt TRƯỚC
 * `SiteDecor` trong layout: cùng một tầng z thì cái đứng trước trong DOM nằm dưới, tức
 * mây ở xa hơn đồi, cây và cành. Thẻ game nền đục che mây; chữ nằm thẳng trên nền
 * trang thì mây đi qua sau lưng chữ — `contrast-check` đo chữ trên màu mây.
 *
 * CÓ CẢ BAN NGÀY LẪN BAN ĐÊM. Ban đêm mây là mây được trăng rọi — lam nhạt, sáng hơn
 * trời một chút — và bay qua SAU trăng sao, vì lớp này đứng trước `SiteDecor` trong DOM.
 * Bản đầu chỉ cho ban ngày với lý do mây tối trên nền tối là vệt bẩn; đúng với màu mây
 * cũ (tách nền 1.25:1), không còn đúng khi màu mây đêm được chỉnh riêng — xem
 * `--toi-decor-may` trong `globals.css`.
 *
 * Mỗi đám đặt `left: 100%` rồi dịch sang trái đúng `100vw + bề rộng của chính nó`:
 * xuất phát khi vừa khuất ngoài mép phải, kết thúc khi vừa khuất ngoài mép trái. Không
 * đám nào hiện ra hay biến mất giữa trời.
 */
export function MayBay() {
  return (
    <div
      aria-hidden="true"
      data-kg-decor="may"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {MAY_BAY.map((m, i) => (
        <svg
          key={i}
          viewBox="-25 -14 52 31"
          className="kg-may-bay absolute left-full"
          style={
            {
              top: m.tren,
              width: m.rong,
              opacity: m.mo,
              '--kg-bay-giay': `${m.giay}s`,
              animationDelay: `${m.tre}s`,
            } as React.CSSProperties
          }
          fill="none"
          focusable="false"
        >
          <May x={0} y={0} />
        </svg>
      ))}
    </div>
  );
}

export function SiteDecor() {
  return (
    <div
      aria-hidden="true"
      // `--kg-lan` khai ở đây một lần cho cả sáu hình bên dưới. Đặt trên khung
      // ngoài chứ không lặp ở từng svg: sáu hình cùng nằm trên một lề thì phải lan
      // ra ngoài cùng một khoảng, không thì cái nọ lệch khỏi cái kia.
      style={{ '--kg-lan': LAN } as React.CSSProperties}
      data-kg-decor="le"
      className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden xl:block"
    >
      {/*
        THỨ TỰ TRONG KHỐI NÀY LÀ THỨ TỰ XA GẦN, đừng đảo: trời trước, rồi mặt đất,
        rồi cành. SVG vẽ theo thứ tự trong DOM nên cái sau nằm trên cái trước, tức
        là mây với mặt trời ở xa nhất, đồi và cây ở giữa, cành sát mặt người xem
        nhất.

        Bản trước xếp cành LÊN ĐẦU và cả hai chuyện sai đều từ đó: cành nào hạ thấp
        quá là bị quả đồi che mất một khúc, nên không dám xếp cành xuống dưới 47%;
        còn đám mây thì nổi lên trước chùm lá, mây bay trước cành cây. Đưa cành ra
        sau cùng thì cành thành lớp tiền cảnh thật — hạ xuống 56% vẫn thấy nguyên
        vì nó vắt qua trước tán cây, và chính chỗ đó mới là chỗ để thêm cành.
      */}

      {/* --- Trời, góc trên bên phải ---
             viewBox chừa 8 đơn vị phía trên: tia nắng thẳng đứng vươn tới y=−3 và
             nét vẽ dày 6 nên nó chạm −6. Khung bắt đầu ở 0 thì tia trên cùng bị
             cắt bằng đầu, mặt trời hoá ra thiếu một tia. --- */}
      <svg
        viewBox="0 -8 120 152"
        className="absolute right-1 top-24 w-24 2xl:right-6 2xl:w-32"
        fill="none"
        focusable="false"
      >
        <g className="kg-ngay">
          {/* Lõi và vòng tia là HAI nhóm riêng vì chúng chuyển động khác nhau: tia
              xoay, lõi thì phập phồng. Gộp một nhóm là lõi tròn cũng quay theo — quay
              một hình tròn thì không ai thấy gì, nhưng trình duyệt vẫn phải tính. */}
          <circle className="kg-loi-nang" cx="72" cy="34" r="20" fill="var(--color-decor-troi)" />
          <g
            className="kg-tia-nang"
            stroke="var(--color-decor-troi)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.8"
          >
            <path d="M72-3v10M72 61v10M35 34h10M99 34h10" />
            <path d="M45 7l7 7M92 54l7 7M99 7l-7 7M52 54l-7 7" />
          </g>
          {/* Hai con chim, nét chữ "m" — cách vẽ chim ít nét nhất mà vẫn ra chim. */}
          <g
            stroke="var(--color-decor-chim)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            opacity="0.75"
          >
            <path d="M14 84c4-5 8-5 11 0 3-5 7-5 11 0" />
            <path d="M40 104c3-4 6-4 8 0 2-4 5-4 8 0" />
          </g>
        </g>

        <g className="kg-dem">
          <QuangTrang id="kg-mo-trang-le" d="M84 20a22 22 0 1 0 0 34 26 26 0 0 1 0-34Z" mo={5} />
          <g fill="var(--color-decor-troi)" opacity="0.9">
            {/* Trễ so le để ba sao không cùng sáng cùng tắt — cùng nhịp thì đọc ra như
                một bóng đèn chứ không phải ba ngôi sao. */}
            <path className="kg-lap-lanh" d="M28 26l2.4 5.4 5.4 2.4-5.4 2.4L28 42l-2.4-5.8-5.4-2.4 5.4-2.4Z" />
            <path className="kg-lap-lanh" style={{ animationDelay: '-1.6s' }} d="M46 74l1.8 4 4 1.8-4 1.8L46 86l-1.8-4.4-4-1.8 4-1.8Z" />
            <path className="kg-lap-lanh" style={{ animationDelay: '-3.1s' }} d="M16 100l1.5 3.4 3.4 1.5-3.4 1.5L16 110l-1.5-3.6-3.4-1.5 3.4-1.5Z" />
          </g>
        </g>
      </svg>

      {/* --- Mây, góc trên bên trái. Ban đêm thay bằng sao. --- */}
      <svg
        viewBox="0 0 120 130"
        className="absolute left-1 top-14 w-24 2xl:left-6 2xl:w-32"
        fill="none"
        focusable="false"
      >
        <g className="kg-dem" fill="var(--color-decor-troi)" opacity="0.9">
          <path className="kg-lap-lanh" style={{ animationDelay: '-0.8s' }} d="M70 24l2.2 5 5 2.2-5 2.2L70 39l-2.2-5.6-5-2.2 5-2.2Z" />
          <path className="kg-lap-lanh" style={{ animationDelay: '-2.4s' }} d="M40 62l1.6 3.6 3.6 1.6-3.6 1.6L40 73l-1.6-4-3.6-1.6 3.6-1.6Z" />
          <path className="kg-lap-lanh" style={{ animationDelay: '-3.7s' }} d="M84 94l1.4 3.2 3.2 1.4-3.2 1.4L84 104l-1.4-3.6-3.2-1.4 3.2-1.4Z" />
        </g>
      </svg>

      {/* --- Mặt đất bên trái: đồi, một cây tán rộng, bụi cỏ, hoa --- */}
      <svg
        viewBox="0 0 300 290"
        className={`absolute bottom-0 left-[calc(var(--kg-lan)*-1)] ${RONG_LE}`}
        fill="none"
        focusable="false"
      >
        {/*
          Đồi là một đường XUÔI XUỐNG, không phải hình elip.
          Elip thì mép trong của nó bị khung SVG cắt phăng thành một nhát thẳng
          đứng giữa trang — nhìn ra ngay là hình bị xén. Vẽ thành sườn đồi tự hạ
          xuống chạm đáy ở phía trong thì không còn chỗ nào để cắt: đất kết thúc
          vì nó thoải hết, chứ không vì hết khung.

          Sườn phải CHẠM ĐÁY ĐÚNG Ở GÓC (300, 290), không phải ở đơn vị 208 như
          bản trước — dừng sớm thì phần thừa bị xén thành một nhát dọc cao chừng
          25px, mà đó chính là chỗ mắt đang nhìn vì nó nằm ngay cạnh nội dung.

          Đầu ngoài chạy quá mép (−10) cho cạnh sát mép màn hình cũng không lộ
          vết cắt; chỗ đó tràn ra được vì nó nằm ngoài tầm mắt.
        */}
        <path
          d="M-10 290V222c54-26 128-28 186-6 58 22 92 46 124 74Z"
          fill="var(--color-decor-doi)"
        />
        {/*
          BA cây, và thứ tự vẽ là một phần của hình.
          Hồi khung còn 200 đơn vị thì ở đây chỉ vẽ được một cây: nhét hai cái vào
          là cả hai đều bé lại và không cái nào ra hình. Khung 300 đơn vị đổi hẳn
          chuyện đó — cây to chiếm 14 tới 206, còn lại cả khúc sườn thoải phía
          trong bỏ không.

          BA LUẬT khi thêm cây, sai một cái là ra rừng cây dán chồng lên nhau:

          1. Cây NHỎ vẽ TRƯỚC, cây to vẽ SAU. Tán có chồng nhau thì cây to phải
             che cây nhỏ; đảo lại là cây con nổi lên trên cây lớn, mắt đọc ra ngay
             là hình sai mà không chỉ được sai ở đâu.
          2. Cây càng nhỏ thì gốc càng CAO trên sườn — nhỏ và ở xa đi cùng nhau.
             Cây bé mà gốc thấp hơn cây lớn thì nó thành cây gần mà lại tí xíu.
          3. Gốc phải LÚN vào sườn đồi chừng mươi đơn vị. Đặt đúng trên đường viền
             đồi thì cây như dán lên, mà lún sâu quá thì thành cây đứng trước đồi.

          Cỡ 0.32 / 0.4 / 0.6 / 0.94 — chênh nhau hẳn một bậc. Bốn cây xấp xỉ cỡ
          nhau thì không ra bụi cây, chỉ ra một cây bị nhân bản bốn lần.

          BỐN cây bên này, bên phải chỉ HAI. Số lượng lệch nhau là chủ ý: hai bên
          bằng nhau thì thành ảnh soi gương, mà cảnh soi gương thì đọc ra là hoa
          văn viền trang chứ không phải một khung cảnh.
        */}
        <Cay x={44} y={214} s={0.4} delay={-5} lat />
        <Cay x={262} y={268} s={0.32} delay={-7} />
        <Cay x={206} y={236} s={0.6} delay={-2.5} />
        <Cay x={110} y={215} s={0.94} delay={0} />
        <circle cx="20" cy="262" r="15" fill="var(--color-decor-co)" />
        <circle cx="176" cy="268" r="12" fill="var(--color-decor-co)" />
        <Hoa x={48} y={268} mau="var(--color-decor-hoa-hong)" />
        <Hoa x={70} y={274} mau="var(--color-decor-hoa-vang)" />
        <Hoa x={152} y={272} mau="var(--color-decor-hoa-hong)" />
        {/* Khúc sườn thoải phía trong, chỗ trước đây là dải trống. Bụi cỏ nhỏ dần
            và hoa thưa dần ra mép trong: đất hết thì cảnh cũng phải nhạt dần đi
            chứ không đứt đột ngột. */}
        <circle cx="236" cy="252" r="13" fill="var(--color-decor-co)" />
        {/* Bụi cỏ này trước ở x=272, đúng chỗ cây nhỏ thứ tư giờ đứng. Dời ra 292
            cho nó đừng mọc chồm lên gốc cây. */}
        <circle cx="292" cy="282" r="8" fill="var(--color-decor-co)" />
        <Hoa x={252} y={258} mau="var(--color-decor-hoa-vang)" />
        <Hoa x={282} y={282} mau="var(--color-decor-hoa-hong)" />
      </svg>

      {/* --- Mặt đất bên phải. Khác cỡ, khác dáng, khác thứ tự cây: hai bên đối
             xứng y hệt thì thành ảnh soi gương chứ không ra khung cảnh. --- */}
      <svg
        viewBox="0 0 300 290"
        className={`absolute bottom-0 right-[calc(var(--kg-lan)*-1)] ${RONG_LE}`}
        fill="none"
        focusable="false"
      >
        {/* Cùng một quả đồi, lật lại: sườn cao ở mép NGOÀI (bên phải) và thoải
            xuống chạm đáy đúng ở góc (0, 290) phía nội dung. */}
        <path
          d="M310 290V218c-54-26-128-28-186-6-58 22-92 48-124 78Z"
          fill="var(--color-decor-doi)"
        />
        {/* HAI cây thôi, bên trái bốn — xem ghi chú bên đó về luật thứ tự vẽ.
            Bên này thưa nên bù bằng bốn cành ở trên, và cây to cũng nhỏ hơn bên
            kia (0.87 so với 0.94). Cây to lật, cây vừa không: hai cái cạnh nhau
            mà cùng dáng thì lộ ra là một hình dùng hai lần. */}
        <Cay x={78} y={242} s={0.55} delay={-1} />
        <Cay x={190} y={220} s={0.87} delay={-4} lat />
        <circle cx="284" cy="262" r="14" fill="var(--color-decor-co)" />
        <circle cx="118" cy="268" r="11" fill="var(--color-decor-co)" />
        <Hoa x={250} y={270} mau="var(--color-decor-hoa-vang)" />
        <Hoa x={228} y={276} mau="var(--color-decor-hoa-hong)" />
        <Hoa x={142} y={272} mau="var(--color-decor-hoa-vang)" />
        {/* Khúc sườn thoải phía trong — bên này là phía TRÁI của hình. */}
        <circle cx="64" cy="250" r="12" fill="var(--color-decor-co)" />
        <circle cx="30" cy="272" r="10" fill="var(--color-decor-co)" />
        <Hoa x={48} y={258} mau="var(--color-decor-hoa-hong)" />
        <Hoa x={20} y={280} mau="var(--color-decor-hoa-vang)" />
      </svg>

      {/*
        Cành mọc ra từ hai mép, rải theo chiều cao — LỚP GẦN NHẤT, nên vẽ sau cùng.

        Đặt bằng phần trăm chứ không phải pixel: màn hình cao thấp khác nhau, mà
        chốt cứng theo pixel thì trên màn 1080 các cành dồn hết lên nửa trên và
        nửa dưới trơ ra.

        HAI BÊN KHÁC NHAU MỌI ĐƯỜNG — khác số cành, khác độ cao, khác cỡ, khác
        chiều lật. Bằng nhau y hệt thì hai mép thành một cặp ngoặc đơn đóng lấy
        nội dung chứ không ra khung cảnh.

        Bên nào nhiều CÂY thì ít CÀNH: bên trái đã có 4 cây nên nặng ở dưới, để
        3 cành; bên phải 2 cây nên bù bằng 4 cành. Cả hai bên đều rậm thì mắt bị
        kéo hẳn ra khỏi nội dung — trang trí đầy chỗ trống là việc của nó, giành
        chỗ với nội dung thì không.

        CÀNH BÊN PHẢI KHÔNG CÁI NÀO LÊN TRÊN 26%. Mặt trời (và vầng trăng ban đêm)
        nằm ở góc trên bên phải, khoảng 96–256px; cành giờ là lớp gần nhất nên đặt
        cành lên đó là lá phủ kín mặt trời, mất luôn cái cảnh ngày đổi thành đêm.
        Bên trái không có ràng buộc đó, chỉ có mấy đám mây nhạt, cành vắt qua mây
        thì lại đúng — mây ở xa.

        Cỡ 0.7 / 0.8 / 0.95 / 1 xen nhau: bốn cành cùng cỡ xếp dọc một mép thì ra
        cái lược. Cành nhỏ đọc ra là cành ở xa, và nó vừa đủ nhét vào khoảng giữa
        hai cành lớn.
      */}
      <CanhVien ben="trai" top="8%" delay={0} co={0.7} ru />
      <CanhVien ben="trai" top="24%" delay={-3} />
      <CanhVien ben="trai" top="44%" delay={-6} co={0.85} />
      <CanhVien ben="phai" top="26%" delay={-1.5} />
      <CanhVien ben="phai" top="38%" delay={-4.5} co={0.7} ru />
      <CanhVien ben="phai" top="50%" delay={-7.5} co={0.95} />
      <CanhVien ben="phai" top="64%" delay={-2.2} co={0.8} ru />
    </div>
  );
}

/**
 * Một BỤI nhỏ: mấy cụm cỏ và vài bông hoa, không có cây.
 *
 * Tách ra vì cả ba chỗ đứng trong dải đất cuối trang đều cần đúng một thứ này ở ba
 * cỡ khác nhau, và vì bụi cỏ là thứ duy nhất nhét được vào khe giữa hai cái cây.
 */
function BuiCoHoa({
  co,
  hoa,
}: {
  co: Array<[number, number, number]>;
  hoa: Array<[number, number, string, number]>;
}) {
  return (
    <>
      {co.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="var(--color-decor-co)" />
      ))}
      {hoa.map(([x, y, mau, s], i) => (
        <Hoa key={i} x={x} y={y} mau={mau} s={s} />
      ))}
    </>
  );
}


/**
 * Một cây ở XA: nhỏ, hạ tương phản, đứng trên quả đồi phía sau.
 *
 * `opacity` chứ không phải một bảng màu nhạt riêng. Hai lý do: một bảng thứ hai là
 * hai chỗ phải sửa mỗi lần đổi màu lá, và `opacity` trộn cây với đúng cái nền nó
 * đang đứng trên — nền trang ở giao diện sáng, nền tối ở giao diện tối — nên hiệu
 * ứng "xa thì mờ" đúng ở cả hai mà không phải khai màu nào.
 */
function CayXa({ s, delay, lat = false }: { s: number; delay: number; lat?: boolean }) {
  return (
    <g opacity="0.62">
      <Cay x={0} y={0} s={s} delay={delay} lat={lat} />
    </g>
  );
}

/**
 * Dải đất cuối trang — tranh trang trí cho MÀN HÌNH HẸP, nơi `SiteDecor` không vẽ.
 *
 * VÌ SAO PHẢI LÀ MỘT HÌNH KHÁC, không phải `SiteDecor` bỏ `hidden`: ràng buộc số 4
 * ở đầu file vẫn đúng nguyên — dưới 1280px KHÔNG có lề nào để vẽ, nội dung chiếm
 * suốt bề ngang. Bỏ `hidden` là cây đứng đè lên chữ. Trên điện thoại chỗ thừa không
 * nằm hai bên nữa, nó nằm ở ĐÁY: trang hết, và trước bản này nó hết bằng một khoảng
 * kem trơn — đúng "dải trắng trơn" mà cả file này tồn tại để tránh, chỉ là trên đúng
 * cái khổ màn hình mà phần lớn trẻ em sẽ dùng.
 *
 * ĐỨNG TRONG DÒNG, KHÔNG `fixed`. Đây là chỗ đã cân và chọn:
 *
 *   Bản `fixed` ở đáy khung nhìn thì lúc nào cũng thấy — nghe đúng ý "ở nền" hơn.
 *   Nhưng trang trên điện thoại là một cột dọc cuộn dài, nên dải đó nằm sau BẤT KỲ
 *   đoạn chữ nào đang trôi qua đáy màn hình: chữ `ink` trên sườn đồi `decor-doi`.
 *   Web này đo từng cặp màu để không có chữ nào nằm trên nền sai, và một quả đồi chạy
 *   sau chữ là đúng loại lỗi đó, chỉ khác là nó di động nên không cặp nào đo được.
 *   Đứng trong dòng thì nó không bao giờ ở sau chữ: nó LÀ đoạn kết của trang.
 *
 * HAI TẦNG ĐẤT, và đấy là toàn bộ khác biệt so với bản đầu.
 *
 * Bản đầu có một quả đồi cao 40px với ba cái cây đứng trên: đo ra thì đúng, nhìn thì
 * là một vạch xanh có cây dán lên. Cảnh có chiều sâu cần ít nhất hai mặt phẳng cách
 * nhau — nên nay là đồi XA (mờ 55%, cây nhỏ mờ 62%) và mặt đất GẦN, cách nhau 28px
 * chiều cao. Cùng một luật đã ghi ở `SiteDecor`: cây nhỏ thì gốc cao hơn trên sườn,
 * vì nhỏ và ở xa đi cùng nhau.
 *
 * Lớp dày lên từ 144px thành 200px cũng vì thế: không phải để đất to hơn mà để có
 * TRỜI. Trước đó khoảng trống trên ngọn cây chỉ 24px, không đủ chỗ cho một đám mây,
 * nên dải đọc ra là mặt đất bị cắt rời chứ không phải một khung cảnh.
 *
 * TRỜI ĐỔI THEO GIAO DIỆN, dùng lại `.kg-ngay` / `.kg-dem` của `globals.css`: ngày
 * có hai đám mây và hai con chim, đêm có trăng khuyết và ba ngôi sao. Đúng cặp class
 * mà tranh hai bên lề dùng, nên không có luật mới nào để nhớ.
 *
 * MẶT ĐẤT GIÃN NGANG, CÂY CỎ THÌ KHÔNG — cùng kỹ thuật hai lớp như `VienDat` ở chân
 * trang, và cùng lý do: `preserveAspectRatio="none"` trên một đường đồi thoải thì
 * giãn bao nhiêu cũng không ai thấy, còn bông hoa bị bóp ngang thành hình bầu dục
 * là nhìn ra ngay. Mây và trăng cũng vậy: chúng là svg cỡ cố định, đặt theo phần trăm.
 *
 * ĐỒI Ở ĐÂY PHẢI THOẢI HƠN ĐỒI BÊN LỀ, và đây là chỗ tính chứ không phải chọn cho
 * đẹp. Khung 1000 đơn vị ngang giãn ra đúng bề rộng khung nhìn, còn chiều dọc thì
 * 1 đơn vị = 1px (viewBox cao 200, lớp cao 200px). Nên độ nhấp nhô của đường đồi là
 * số pixel THẬT, còn bụi cây thì rộng cố định — trên màn 390px một bụi 146px phủ tới
 * 37% bề ngang, tức nó vắt qua cả một khúc đồi. Đo trên đường ban đầu (biên độ 20
 * đơn vị): hai đầu bụi lệch nhau 15px, gốc cây một bên lún vào đất một bên lơ lửng.
 * Đường gần hiện tại nhấp nhô trong khoảng y 150–155, nên lệch tối đa 4px và bị chính
 * cái mép đất che đi. Đường xa được phép nhấp nhô gấp đôi (y 117–127) vì thứ đứng
 * trên nó chỉ rộng 40px, tức chỉ vắt qua một khúc đồi ngắn.
 *
 * Mọi bụi trên cùng một tầng vì thế dùng CÙNG một `bottom`, và đó là hệ quả trực tiếp
 * của việc trên: đất phẳng thì không cần tính lại độ cao cho từng chỗ đứng. Hai con
 * số 32px và 64px không chọn cho tròn — chúng là mặt đất (48px và 76px tính từ đáy
 * lớp) trừ đi phần gốc lún vào sườn và phần khung svg chừa dưới đường đất.
 *
 * THỨ TỰ VẼ vẫn là luật của `SiteDecor`: xa trước gần sau, nhỏ trước to sau. Trên màn
 * 320px bụi giữa và bụi trái chồng lên nhau 23px — vẽ bụi giữa sau là bông hoa nổi lên
 * trên tán cây, đọc ra ngay là hình sai.
 */
export function DatCuoiTrang() {
  return (
    <div
      aria-hidden="true"
      data-kg-decor="dat"
      /* `overflow-hidden`: ràng buộc số 3 ở đầu file. Một cái cây thò ra ngoài mép
         là cả trang phải vuốt ngang, và có một bộ kiểm tràn ngang đang canh đúng
         chuyện đó. */
      className="pointer-events-none relative h-50 w-full overflow-hidden xl:hidden"
    >
      {/*
        TRỜI — vẽ trước tất cả, vì nó ở xa nhất.

        Mây và trăng là svg RIÊNG cỡ cố định chứ không nằm trong svg đồi: svg đồi
        giãn ngang (`preserveAspectRatio="none"`), mà một đám mây bị bóp ngang thì
        đọc ra ngay là hình méo — cùng lý do đã ghi cho bông hoa.
      */}
      <svg
        viewBox="0 0 120 60"
        className="absolute bottom-33 left-[8%] h-15 w-30"
        fill="none"
        focusable="false"
      >
        <g className="kg-ngay">
          {/* Hai con chim, nét chữ "m" — dùng lại đúng cách vẽ của tranh bên lề. */}
          <g
            stroke="var(--color-decor-chim)"
            strokeWidth="2.6"
            strokeLinecap="round"
            fill="none"
            opacity="0.7"
          >
            <path d="M74 40c3.5-4.5 7-4.5 10 0 2.5-4.5 6-4.5 9 0" />
            <path d="M96 54c2.5-3.5 5-3.5 7 0 2-3.5 4.5-3.5 6.5 0" />
          </g>
        </g>
        <g className="kg-dem">
          {/* Trăng khuyết: một hình tròn bị một hình tròn nền "cắn" mất một miếng —
              cùng cách dựng như vầng trăng ở tranh bên lề. */}
          <QuangTrang id="kg-mo-trang-dat" d="M44 12a17 17 0 1 0 0 26 20 20 0 0 1 0-26Z" mo={4} />
          <g fill="var(--color-decor-troi)" opacity="0.9">
            <path className="kg-lap-lanh" d="M82 20l1.8 4 4 1.8-4 1.8L82 32l-1.8-4.4-4-1.8 4-1.8Z" />
            <path className="kg-lap-lanh" style={{ animationDelay: '-2.2s' }} d="M104 44l1.4 3.2 3.2 1.4-3.2 1.4L104 54l-1.4-3.6-3.2-1.4 3.2-1.4Z" />
          </g>
        </g>
      </svg>
      <svg
        viewBox="0 0 90 46"
        className="absolute bottom-38 right-[6%] h-11.5 w-22.5"
        fill="none"
        focusable="false"
      >
        <g className="kg-dem" fill="var(--color-decor-troi)" opacity="0.85">
          <path className="kg-lap-lanh" style={{ animationDelay: '-1.3s' }} d="M30 14l2 4.6 4.6 2-4.6 2L30 27l-2-4.4-4.6-2 4.6-2Z" />
        </g>
      </svg>

      {/*
        HAI ĐƯỜNG ĐẤT trong cùng một svg giãn ngang. Cùng một svg vì cả hai phải
        giãn y hệt nhau: tách ra hai thẻ là sớm muộn một cái đổi bề rộng mà cái kia
        không, và lúc đó chân đồi xa hở ra khỏi mặt đất gần.

        Đồi xa mờ 55% chứ không phải một màu nhạt khai riêng — cùng lý do như `CayXa`.
      */}
      <svg
        viewBox="0 0 1000 200"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        fill="none"
        focusable="false"
      >
        <path
          d="M-10 200V124C120 117 240 129 380 123 520 117 640 127 780 121 880 117 940 123 1010 120V200Z"
          fill="var(--color-decor-doi)"
          opacity="0.55"
        />
        <path
          d="M-10 200V152C130 149 230 155 350 152 470 149 580 150 700 153 820 155 920 152 1010 151V200Z"
          fill="var(--color-decor-doi)"
        />
      </svg>

      {/* Hai cây trên đồi XA. Chúng đứng cao hơn và nhỏ hơn hẳn một bậc so với cây
          gần: nhỏ và ở xa phải đi cùng nhau, không thì cây bé đọc ra là cây gần mà
          lại tí xíu.

          Đứng ở 43% và 66% vì đó là khoảng TRỐNG trên màn điện thoại. Bản đầu đặt cây
          xa thứ nhất ở 24%: trên màn 390px chỗ đó là 94px, nằm gọn sau tán cây to của
          bụi trái (8–154px, tán cao 120px), nên cái cây ấy vẽ ra mà không ai thấy —
          một tầng chiều sâu bỏ tiền vẽ rồi cất đi. */}
      <svg
        viewBox="-22 -46 44 54"
        className="absolute bottom-16 left-[43%] h-13.5 w-11 -translate-x-1/2"
        fill="none"
        focusable="false"
      >
        <CayXa s={0.18} delay={-4.5} />
      </svg>
      <svg
        viewBox="-22 -46 44 54"
        className="absolute bottom-16 left-[66%] h-13.5 w-11 -translate-x-1/2"
        fill="none"
        focusable="false"
      >
        <CayXa s={0.15} delay={-1.5} lat />
      </svg>

      {/*
        Hai bụi xen giữa, ở 32% và 68%. Lý do là khổ máy tính bảng: đo ở 820px thì
        bụi trái dừng ở 162px và bụi giữa mới bắt đầu ở 379px, tức 217px mặt đất trơn
        nằm ngay giữa dải — đúng cái dải trơn thu nhỏ lại. Trên điện thoại 390px hai
        bụi này chồng một phần vào hai bụi lớn, và chồng thì không sao: chúng vẽ TRƯỚC
        nên tán cây phủ lên, hoa nằm sau cây là đúng chiều xa gần.

        Khác nhau về số cụm cỏ và cỡ hoa — hai bụi giống nhau đặt cách đều thì đọc ra
        là hoa văn lặp chứ không ra cỏ mọc.
      */}
      <svg
        viewBox="-24 -20 50 30"
        className="absolute bottom-8 left-[32%] h-7.5 w-12.5 -translate-x-1/2"
        fill="none"
        focusable="false"
      >
        <BuiCoHoa
          co={[[2, -2, 6]]}
          hoa={[
            [-14, 1, 'var(--color-decor-hoa-hong)', 0.7],
            [16, 0, 'var(--color-decor-hoa-vang)', 0.85],
          ]}
        />
      </svg>
      <svg
        viewBox="-24 -20 50 30"
        className="absolute bottom-8 left-[68%] h-7.5 w-12.5 -translate-x-1/2"
        fill="none"
        focusable="false"
      >
        <BuiCoHoa
          co={[
            [-6, -1, 5],
            [14, -3, 7],
          ]}
          hoa={[[-18, 0, 'var(--color-decor-hoa-vang)', 0.75]]}
        />
      </svg>

      {/* Bụi phải: MỘT cây. Bên trái hai — số lượng lệch nhau là chủ ý, hai bên bằng
          nhau thì dải đất thành một hoa văn soi gương chứ không ra khung cảnh. */}
      <svg
        viewBox="-52 -76 114 86"
        className="absolute bottom-8 right-[2%] h-21.5 w-28.5"
        fill="none"
        focusable="false"
      >
        <BuiCoHoa
          co={[
            [-26, -2, 7],
            [30, -3, 9],
          ]}
          hoa={[
            [-42, 0, 'var(--color-decor-hoa-hong)', 0.85],
            [16, 2, 'var(--color-decor-hoa-vang)', 0.7],
            [48, 1, 'var(--color-decor-hoa-vang)', 1],
          ]}
        />
        <Cay x={0} y={0} s={0.33} delay={-3.5} />
      </svg>

      {/* Bụi trái: cây to nhất của cả dải, kèm một cây con. Cây con KHÔNG lật, cây to
          thì lật — hai cái cạnh nhau mà cùng dáng thì lộ ra là một hình dùng hai lần,
          khác cỡ cũng không cứu được vì mắt nhận ra hình dáng trước kích thước. */}
      <svg
        viewBox="-46 -90 146 100"
        className="absolute bottom-8 left-[2%] h-25 w-36.5"
        fill="none"
        focusable="false"
      >
        <BuiCoHoa
          co={[
            [-30, -3, 8],
            [24, -2, 6],
          ]}
          hoa={[
            [-12, 0, 'var(--color-decor-hoa-vang)', 1],
            [44, 1, 'var(--color-decor-hoa-hong)', 0.8],
            [92, 0, 'var(--color-decor-hoa-hong)', 0.9],
          ]}
        />
        {/* Cây con vẽ TRƯỚC cây to: tán có chồng nhau thì cây to phải che cây nhỏ. */}
        <Cay x={62} y={0} s={0.26} delay={-6} />
        <Cay x={0} y={0} s={0.4} delay={0} lat />
      </svg>
    </div>
  );
}

/**
 * Dây leo hai bên MÉP MÀN HÌNH — tranh trang trí thứ ba, chỉ cho màn hình hẹp.
 *
 * Ở đây có đúng 20px để vẽ, và con số đó không phải tôi chọn: nội dung dùng `px-5`
 * (xem `page.tsx`), nên hai dải 20px sát mép là chỗ DUY NHẤT trên màn điện thoại mà
 * không dòng chữ nào chạm tới. Thẻ game thì đục và nằm trên, nên vẽ lấn vào trong
 * cũng chỉ bị thẻ che; nhưng tiêu đề "Game mới nhất" và mấy dòng chữ thường nằm
 * THẲNG trên nền và bắt đầu đúng ở 20px, nên lấn một pixel là một chiếc lá nằm sau
 * chữ cái đầu của một tiêu đề. Đó là lằn ranh, không phải một lề an toàn.
 *
 * VẼ ÍT HƠN, KHÔNG VẼ NHỎ HƠN — luật đã ghi ở đầu file, và lề 20px là ca cực đoan
 * của nó. Không phải cái cây thu nhỏ (ở cỡ đó cả tán lá thành một đốm 6px), mà là
 * một thứ KHÁC: một sợi dây leo, vốn dĩ mảnh và dài, với lá và hoa đúng cỡ đọc được.
 *
 * TÔ BẰNG `<pattern>` LẶP DỌC, không phải một danh sách toạ độ.
 *
 * Bên lề rộng thì `CanhVien` đặt tay từng cành theo phần trăm chiều cao, được, vì
 * ở đó có 3–4 cành. Dây leo thì phải LIÊN TỤC suốt chiều cao khung nhìn, mà chiều
 * cao ấy đổi theo máy và theo cả thanh địa chỉ của trình duyệt di động. Đặt tay thì
 * hoặc dây đứt quãng ở máy cao, hoặc phải giãn hình — mà giãn là bông hoa bị bóp.
 * Một ô hoa văn 20×120 lặp lại thì cao bao nhiêu cũng kín, và không hình nào méo.
 *
 * Ô phải NỐI ĐƯỢC VỚI CHÍNH NÓ: sợi dây vào ô ở (10,0) và ra ở (10,120), cùng một x.
 * Lệch một đơn vị là mỗi 120px có một chỗ gấp khúc, và mắt bắt được ngay cái nhịp
 * đều đặn ấy — đó là lúc hoa văn tự tố nó là hoa văn.
 *
 * HAI BÊN LỆCH PHA 46px, và đó không phải cho đẹp. Bên phải là bên trái lật ngang
 * (`-scale-x-100`), nên nếu cùng pha thì mỗi chiếc lá bên này có một chiếc đối xứng
 * y hệt bên kia — thành hai dấu ngoặc đơn đóng lấy nội dung, đúng cái mà ghi chú ở
 * `CanhVien` đã cảnh báo. Lệch pha bằng cách cho hình chữ nhật tô hoa văn bắt đầu ở
 * y = −46 chứ không phải 0; phần thừa phía dưới bị thẻ <svg> xén, đó là chủ ý.
 *
 * KHÔNG có viewBox trên hai thẻ <svg> này, cố ý: một đơn vị người dùng thành đúng
 * một CSS px, nên `patternUnits="userSpaceOnUse"` với ô 20×120 là 20×120 pixel thật.
 * Có viewBox là hình co giãn theo chiều cao khung nhìn, tức quay lại đúng cái phải
 * tránh.
 */
const O_DAY_LEO = 'kg-o-day-leo';

function OHoaVan() {
  return (
    <pattern
      id={O_DAY_LEO}
      patternUnits="userSpaceOnUse"
      width="20"
      height="120"
      /* Lá và hoa vẽ trong ô nào thì nằm trong ô đó; thứ nhô ra khỏi ô sẽ bị chính
         `<pattern>` xén, không phải bị thẻ svg xén — nên `overflow: visible` ở đây
         là bắt buộc, thiếu nó là mất đầu mấy chiếc lá chìa ra ngoài ô. */
      overflow="visible"
    >
      {/* Sợi dây: một đường lượn nhẹ, vào ô ở x=10 và ra ở x=10. */}
      <path
        d="M10 0C14 20 6 40 10 60 14 80 6 100 10 120"
        stroke="var(--color-decor-la-dam)"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
      {/* Tua cuốn: một vòng xoắn nhỏ, thứ làm dây leo ra dây leo chứ không ra sợi
          chỉ có lá dính vào. */}
      <path
        d="M11 74c4 2 5 6 2 7-2 1-3-2-1-3"
        stroke="var(--color-decor-la-dam)"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Lá so le hai phía. Góc và cỡ khác nhau từng chiếc: sáu chiếc cùng góc là
          sáu bản sao, và ô lặp lại thì cái nhịp đó nhân lên suốt chiều cao trang. */}
      <La x={10} y={13} g={-34} t={1} s={0.42} />
      <La x={9} y={31} g={148} t={0} s={0.4} />
      <La x={11} y={64} g={-24} t={2} s={0.44} />
      <La x={9} y={92} g={156} t={1} s={0.42} />
      <La x={10} y={108} g={-42} t={0} s={0.38} />
      <Hoa x={13} y={52} mau="var(--color-decor-hoa-hong)" s={0.7} />
      <Hoa x={7} y={120} mau="var(--color-decor-hoa-vang)" s={0.62} />
    </pattern>
  );
}

export function DayLeoVien() {
  return (
    <div
      aria-hidden="true"
      data-kg-decor="vien"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden xl:hidden"
    >
      <svg className="absolute inset-y-0 left-0 h-full w-5" fill="none" focusable="false">
        <defs>
          <OHoaVan />
        </defs>
        <rect x="0" y="0" width="20" height="4000" fill={`url(#${O_DAY_LEO})`} />
      </svg>
      {/*
        Bên phải: cùng một ô hoa văn, lật ngang và lệch pha 46px.

        Dùng lại `url(#...)` của thẻ svg bên trên — một `<pattern>` khai một lần thì
        mọi thẻ trong tài liệu tô được, và đó là điểm chính: hai bản vẽ tay của cùng
        một sợi dây thì sớm muộn lệch nhau, y như ghi chú ở `Canh` đã nói.
      */}
      <svg
        className="absolute inset-y-0 right-0 h-full w-5 -scale-x-100"
        fill="none"
        focusable="false"
      >
        <rect x="0" y="-46" width="20" height="4000" fill={`url(#${O_DAY_LEO})`} />
      </svg>
    </div>
  );
}
