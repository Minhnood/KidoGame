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
 * BỀ RỘNG PHẢI THEO MÀN HÌNH. Ở đúng 1280px mỗi bên lề chỉ có (1280−1024)/2 = 128px,
 * nên tranh phải hẹp hơn thế; tới 1536px thì lề rộng 256px và tranh mới được to ra.
 * Bản đầu tiên vẽ cứng 144px và đã lấn vào nội dung ở đúng mốc 1280px.
 *
 * Màu lấy từ nhóm token `--color-decor-*`, tách hẳn khỏi bảng màu giao diện. Việc
 * đổi cảnh ngày/đêm nằm ở `.kg-ngay` / `.kg-dem` trong `globals.css`.
 */

/** Cây tán tròn. `kg-dua` cho tán đu nhẹ, thân đứng yên. */
function CayTron({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-7" y="-46" width="14" height="52" rx="7" fill="var(--color-decor-than)" />
      <g className="kg-dua" style={{ animationDelay: `${delay}s` }}>
        <circle cx="18" cy="-62" r="20" fill="var(--color-decor-la-dam)" />
        <circle cx="-20" cy="-58" r="23" fill="var(--color-decor-la)" />
        <circle cx="2" cy="-84" r="28" fill="var(--color-decor-la)" />
      </g>
    </g>
  );
}

/** Cây thông — dáng nhọn, để hai bên lề không chỉ toàn một kiểu cây tròn. */
function CayThong({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-5" y="-16" width="10" height="22" rx="5" fill="var(--color-decor-than)" />
      <g className="kg-dua" style={{ animationDelay: `${delay}s` }}>
        <path d="M0-86 24-44H-24Z" fill="var(--color-decor-la)" />
        <path d="M0-58 28-14H-28Z" fill="var(--color-decor-la-dam)" />
      </g>
    </g>
  );
}

/** Bông hoa năm cánh. Chi tiết nhỏ nhất trong tranh, và là thứ làm nó bớt trơ. */
function Hoa({ x, y, mau }: { x: number; y: number; mau: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0v-9" stroke="var(--color-decor-la-dam)" strokeWidth="2" strokeLinecap="round" />
      {[0, 72, 144, 216, 288].map((g) => (
        <circle key={g} cx={0} cy={-13} r="3.4" fill={mau} transform={`rotate(${g} 0 -9)`} />
      ))}
      <circle cx="0" cy="-9" r="2.6" fill="var(--color-decor-troi)" />
    </g>
  );
}

/**
 * Cành mọc NGANG ra từ mép màn hình.
 *
 * Vẽ cho mép TRÁI; bên phải dùng lại chính nó rồi lật bằng `scaleX(-1)` chứ không
 * vẽ bản thứ hai — hai bản vẽ tay của cùng một cái cành thì sớm muộn sẽ lệch nhau,
 * và lệch ở đây nghĩa là nửa màn hình bên kia trông sai mà không ai biết vì sao.
 *
 * Cả cành NẰM TRONG nhóm `kg-dua-canh`, kể cả khúc gốc: nhờ vậy hộp bao bắt đầu
 * đúng ở x=0, tức đúng chỗ cành dính vào mép, nên nó đu quanh gốc như gió thổi chứ
 * không quay quanh giữa chùm lá như một cái chong chóng.
 */
function Canh({ delay = 0 }: { delay?: number }) {
  return (
    <g className="kg-dua-canh" style={{ animationDelay: `${delay}s` }}>
      <path
        d="M0 66C26 64 44 54 62 38"
        stroke="var(--color-decor-than)"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M22 65C34 78 48 88 62 96"
        stroke="var(--color-decor-than)"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="44" cy="22" r="15" fill="var(--color-decor-la-dam)" />
      <circle cx="86" cy="48" r="14" fill="var(--color-decor-la-dam)" />
      <circle cx="64" cy="34" r="22" fill="var(--color-decor-la)" />
      <circle cx="88" cy="88" r="12" fill="var(--color-decor-la-dam)" />
      <circle cx="66" cy="100" r="18" fill="var(--color-decor-la)" />
    </g>
  );
}

/** Một cành đặt ở mép trái hoặc mép phải, tại một độ cao cho trước. */
function CanhVien({ ben, top, delay }: { ben: 'trai' | 'phai'; top: string; delay: number }) {
  return (
    <svg
      viewBox="0 0 110 130"
      style={{ top }}
      className={`absolute w-20 2xl:w-28 ${ben === 'trai' ? 'left-0' : 'right-0 -scale-x-100'}`}
      fill="none"
      focusable="false"
    >
      <Canh delay={delay} />
    </svg>
  );
}

function May({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="var(--color-decor-may)">
      <circle cx="0" cy="0" r="13" />
      <circle cx="16" cy="4" r="10" />
      <circle cx="-15" cy="5" r="9" />
      <rect x="-15" y="1" width="32" height="13" rx="6.5" />
    </g>
  );
}

export function SiteDecor() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden xl:block"
    >
      {/*
        Cành mọc ra từ hai mép, rải theo chiều cao.
        Đặt bằng phần trăm chứ không phải pixel: màn hình cao thấp khác nhau, mà
        chốt cứng theo pixel thì trên màn 1080 các cành dồn hết lên nửa trên và
        nửa dưới trơ ra.
        Hai bên lệch độ cao nhau (26/50/72 với 34/58/78) — trùng nhau là hai mép
        thành một cặp ngoặc đơn chứ không ra hàng cây.
      */}
      <CanhVien ben="trai" top="26%" delay={0} />
      <CanhVien ben="trai" top="50%" delay={-3} />
      <CanhVien ben="trai" top="72%" delay={-6} />
      <CanhVien ben="phai" top="34%" delay={-1.5} />
      <CanhVien ben="phai" top="58%" delay={-4.5} />
      <CanhVien ben="phai" top="78%" delay={-7.5} />

      {/* --- Trời, góc trên bên phải --- */}
      <svg
        viewBox="0 0 120 150"
        className="absolute right-1 top-24 w-24 2xl:right-6 2xl:w-32"
        fill="none"
        focusable="false"
      >
        <g className="kg-ngay">
          <circle cx="72" cy="34" r="20" fill="var(--color-decor-troi)" />
          <g
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
          <g className="kg-may-troi">
            <May x={30} y={122} s={0.9} />
          </g>
        </g>

        <g className="kg-dem">
          {/* Trăng khuyết: một hình tròn bị một hình tròn nền "cắn" mất một miếng. */}
          <path
            d="M84 20a22 22 0 1 0 0 34 26 26 0 0 1 0-34Z"
            fill="var(--color-decor-troi)"
          />
          <g fill="var(--color-decor-troi)" opacity="0.9">
            <path d="M28 26l2.4 5.4 5.4 2.4-5.4 2.4L28 42l-2.4-5.8-5.4-2.4 5.4-2.4Z" />
            <path d="M46 74l1.8 4 4 1.8-4 1.8L46 86l-1.8-4.4-4-1.8 4-1.8Z" />
            <path d="M16 100l1.5 3.4 3.4 1.5-3.4 1.5L16 110l-1.5-3.6-3.4-1.5 3.4-1.5Z" />
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
        <g className="kg-ngay kg-may-troi">
          <May x={62} y={26} s={1.05} />
          <May x={34} y={86} s={0.75} />
        </g>
        <g className="kg-dem" fill="var(--color-decor-troi)" opacity="0.9">
          <path d="M70 24l2.2 5 5 2.2-5 2.2L70 39l-2.2-5.6-5-2.2 5-2.2Z" />
          <path d="M40 62l1.6 3.6 3.6 1.6-3.6 1.6L40 73l-1.6-4-3.6-1.6 3.6-1.6Z" />
          <path d="M84 94l1.4 3.2 3.2 1.4-3.2 1.4L84 104l-1.4-3.6-3.2-1.4 3.2-1.4Z" />
        </g>
      </svg>

      {/* --- Mặt đất bên trái: đồi, hai cây, bụi cỏ, hoa --- */}
      <svg
        viewBox="0 0 150 200"
        className="absolute bottom-0 left-0 w-28 2xl:w-44"
        fill="none"
        focusable="false"
      >
        {/* Đồi vẽ TRƯỚC để nằm sau cây. Bo tròn rộng hơn khung để hai mép không
            thành hai đầu cụt lơ lửng. */}
        <ellipse cx="60" cy="215" rx="130" ry="60" fill="var(--color-decor-doi)" />
        <CayTron x={44} y={168} s={1} delay={0} />
        <CayThong x={104} y={176} s={0.85} delay={-3.5} />
        <circle cx="16" cy="184" r="15" fill="var(--color-decor-co)" />
        <circle cx="130" cy="190" r="12" fill="var(--color-decor-co)" />
        <Hoa x={76} y={190} mau="var(--color-decor-hoa-hong)" />
        <Hoa x={92} y={196} mau="var(--color-decor-hoa-vang)" />
        <Hoa x={34} y={196} mau="var(--color-decor-hoa-hong)" />
      </svg>

      {/* --- Mặt đất bên phải. Khác cỡ, khác dáng, khác thứ tự cây: hai bên đối
             xứng y hệt thì thành ảnh soi gương chứ không ra khung cảnh. --- */}
      <svg
        viewBox="0 0 150 200"
        className="absolute bottom-0 right-0 w-28 2xl:w-44"
        fill="none"
        focusable="false"
      >
        <ellipse cx="90" cy="215" rx="130" ry="58" fill="var(--color-decor-doi)" />
        <CayThong x={40} y={180} s={1} delay={-1.5} />
        <CayTron x={104} y={172} s={0.8} delay={-5} />
        <circle cx="136" cy="186" r="13" fill="var(--color-decor-co)" />
        <circle cx="14" cy="192" r="11" fill="var(--color-decor-co)" />
        <Hoa x={66} y={194} mau="var(--color-decor-hoa-vang)" />
        <Hoa x={80} y={188} mau="var(--color-decor-hoa-hong)" />
        <Hoa x={124} y={198} mau="var(--color-decor-hoa-vang)" />
      </svg>
    </div>
  );
}
