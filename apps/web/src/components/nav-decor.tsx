import { Hoa, La } from './site-decor';

/** Bông hoa hạ tông cho nền tối. Cùng bông hoa của tranh hai bên lề, đổi ba màu. */
function HoaMo({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <Hoa
      x={x}
      y={y}
      s={s}
      mau="var(--color-nav-hoa)"
      cuong="var(--color-nav-la-dam)"
      tam="var(--color-nav-hoa-tam)"
    />
  );
}

/**
 * Hai nhánh lá nhỏ ở hai đầu thanh điều hướng, cộng mấy ngôi sao lấp lánh.
 *
 * Vì sao đặt được: nội dung thanh nav rộng tối đa 1024px và nằm giữa, nên từ 1280px
 * trở lên hai đầu thanh có chỗ trống thật — 128px mỗi bên ở 1280px, 448px ở 1920px.
 * Chính hai khoảng đó, và chỉ hai khoảng đó, là nơi vẽ được mà không đụng vào chữ.
 *
 * BỐN RÀNG BUỘC, giống hệt tranh hai bên lề — và vì cùng lý do:
 *
 * 1. `aria-hidden`, không phần tử nào focus được. `a11y-check` đếm số điểm Tab mỗi
 *    trang, và thanh nav là chỗ người dùng bàn phím đi qua đầu tiên ở MỌI trang.
 * 2. `pointer-events-none`. Nó nằm đè lên thanh nav; thiếu dòng này là nó ăn cú bấm
 *    vào logo hoặc nút "Bé đăng nhập".
 * 3. `hidden xl:block` — dưới 1280px hai đầu thanh không còn chỗ trống nào, lá sẽ
 *    nằm đè lên tên trang.
 *
 *    Và BỀ RỘNG PHẢI THEO LỀ, `min(calc((100vw-64rem)/2), …)`, đúng công thức của
 *    tranh hai bên lề. Chốt cứng 160px thì ở đúng mốc 1280px lề chỉ có 128px, ngọn
 *    nhánh chạm tới 142px, tức nó bò vào đúng chỗ chữ "KidoGame" bắt đầu — hụt
 *    nhau đúng 2px nhờ `px-5` của khung nội dung, mà 2px thì không phải là một
 *    khoảng cách, đó là một sự tình cờ.
 *
 *    Nhưng khác tranh hai bên lề ở một điểm: ở đây bề rộng có TRẦN (10rem / 8rem),
 *    nên trên màn 1920 nhánh chỉ chiếm 142px trong 448px lề và giữa nhánh với logo
 *    còn một khoảng trống lớn. Ở tranh hai bên lề, khoảng trống đó là lỗi phải sửa;
 *    ở đây thì không. Thanh điều hướng không phải một bức tranh — nó là một thanh
 *    công cụ, chỗ trống trên nó là chỗ nghỉ cho mắt. Kéo cành dài ra kín 448px là
 *    thêm một rừng lá vào đúng nơi người ta đang tìm nút bấm.
 * 4. Thẻ <header> phải có `overflow-hidden`. Nhánh vẽ tràn ra khỏi mép trên và mép
 *    dưới thanh là CỐ Ý (nó chạy tiếp ra ngoài chứ không cụt lại ở đúng mép), nên
 *    không có nó thì lá đổ xuống đè lên nội dung trang.
 *
 * HAI BÊN KHÁC NHAU: bên trái nhánh dài hơn và có một quả; bên phải ngắn hơn, không
 * quả, bù bằng hai ngôi sao. Lật gương một nhánh sang bên kia thì thanh nav thành
 * một cặp ngoặc đơn — đúng cái đã tránh ở tranh hai bên lề.
 */

/**
 * Ngôi sao bốn cánh, lấp lánh chậm. Nét mảnh dần ra bốn đầu nên vẽ bằng path chứ
 * không dùng chữ ✦ — chữ thì phụ thuộc phông của máy người xem.
 *
 * Mỗi ngôi một `delay` khác nhau. Ba ngôi sáng tối cùng nhịp thì thành một cái đèn
 * ba bóng bật tắt đồng loạt, không ra bầu trời.
 */
function Sao({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <path
      d="M0-10 2.6 -2.6 10 0 2.6 2.6 0 10 -2.6 2.6 -10 0 -2.6 -2.6Z"
      transform={`translate(${x} ${y}) scale(${s})`}
      fill="var(--color-nav-sao)"
      className="kg-lap-lanh"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

/** Quả táo hạ tông: cùng dáng với quả trên tranh hai bên lề, chỉ tối hơn. */
function TaoMo({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0-11v5" stroke="var(--color-nav-canh)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="0" cy="0" r="6.5" fill="var(--color-nav-tao)" />
    </g>
  );
}

const LA_TRAI: Array<[number, number, number, number]> = [
  // [x, y, góc xoay, cỡ] — so le trên dưới dọc nhánh, nhỏ dần ra ngọn.
  [10, 44, -32, 0.62],
  [22, 54, 26, 0.55],
  [32, 40, -38, 0.6],
  [44, 51, 22, 0.5],
  [54, 36, -30, 0.58],
  [66, 46, 26, 0.5],
  [76, 32, -34, 0.54],
  [88, 42, 22, 0.46],
  [100, 29, -28, 0.5],
  [112, 38, 24, 0.44],
  [124, 27, -26, 0.44],
];

const LA_PHAI: Array<[number, number, number, number]> = [
  [8, 40, -30, 0.58],
  [20, 50, 24, 0.5],
  [30, 36, -36, 0.55],
  [42, 46, 22, 0.46],
  [52, 32, -28, 0.5],
  [64, 41, 24, 0.44],
  [74, 29, -26, 0.44],
];

export function NavDecor() {
  return (
    <>
      {/* Nhánh bên trái: mọc từ mép màn hình vào, chếch lên. */}
      <svg
        viewBox="0 0 160 76"
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="xMinYMid meet"
        className="pointer-events-none absolute inset-y-0 left-0 hidden w-[min(calc((100vw-64rem)/2),10rem)] xl:block"
      >
        {/*
          Cành, lá và quả nằm trong nhóm `kg-dua-canh` — cùng một hoạt ảnh đu qua đu
          lại với cành ngoài lề trang, nên hai chỗ động cùng một nhịp gió.

          SAO THÌ NẰM NGOÀI nhóm này. Sao ở trên trời, nó không dính vào cành; cho nó
          đu theo là cả bầu trời lắc lư mỗi lần có gió.
        */}
        <g className="kg-dua-canh" style={{ animationDelay: '-2s' }}>
          <path
            d="M-4 52C22 50 52 44 78 38 104 32 124 28 142 26"
            stroke="var(--color-nav-canh)"
            strokeWidth="4.5"
            strokeLinecap="round"
            fill="none"
          />
          {/* Một nhánh con rủ xuống, mang quả — cùng luật với tranh hai bên lề: quả
              treo XUỐNG khỏi chỗ dính, không bao giờ dựng lên. */}
          <path
            d="M56 44C62 52 68 57 76 60"
            stroke="var(--color-nav-canh)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          {LA_TRAI.map(([x, y, g, s], i) => (
            <La
              key={i}
              x={x}
              y={y}
              g={g}
              s={s}
              mau={i % 2 ? 'var(--color-nav-la-dam)' : 'var(--color-nav-la)'}
            />
          ))}
          <TaoMo x={76} y={66} />
          <HoaMo x={40} y={38} s={0.8} />
          <HoaMo x={96} y={28} s={0.65} />
        </g>
        <Sao x={116} y={14} s={0.5} />
        <Sao x={138} y={40} s={0.3} delay={-2.4} />
      </svg>

      {/* Nhánh bên phải: cùng một hình lật gương, nhưng ngắn hơn, không quả, và có
          hai ngôi sao thay vì một. */}
      <svg
        viewBox="0 0 160 76"
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="xMinYMid meet"
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[min(calc((100vw-64rem)/2),8rem)] -scale-x-100 xl:block"
      >
        {/* Lệch nhịp với nhánh bên trái (−5.5s so với −2s): hai bên đu đúng cùng lúc
            thì cả thanh nav thở lên xuống như một khối, nhìn ra ngay là máy làm. */}
        <g className="kg-dua-canh" style={{ animationDelay: '-5.5s' }}>
          <path
            d="M-4 48C20 46 46 41 68 36 86 32 98 30 110 29"
            stroke="var(--color-nav-canh)"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          {LA_PHAI.map(([x, y, g, s], i) => (
            <La
              key={i}
              x={x}
              y={y}
              g={g}
              s={s}
              mau={i % 2 ? 'var(--color-nav-la-dam)' : 'var(--color-nav-la)'}
            />
          ))}
          <HoaMo x={34} y={34} s={0.7} />
        </g>
        <Sao x={92} y={18} s={0.46} delay={-1.6} />
        <Sao x={112} y={44} s={0.32} delay={-3.2} />
        <Sao x={128} y={22} s={0.24} delay={-0.8} />
      </svg>
    </>
  );
}
