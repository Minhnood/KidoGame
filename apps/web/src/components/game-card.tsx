import Link from 'next/link';
import { AnhBia } from './anh-bia';
import { KHUNG_THE } from './card';
import { Hoa, La } from './site-decor';
import { TheDangMo } from './the-dang-mo';

/**
 * Năm tông nền thẻ, chọn theo MÃ GAME.
 *
 * Phải là một hàm thuần dựa trên dữ liệu, không được dùng `Math.random()` hay thứ tự
 * trong lưới: trang này render ở server rồi hydrate lại ở client, nên một màu ngẫu
 * nhiên sẽ khác nhau giữa hai lần và React báo lệch hydration. Theo mã game thì màu
 * còn ổn định cả khi game đổi chỗ trong lưới — hôm nay xem "cái game màu mint" thì
 * mai nó vẫn màu mint.
 */
const TONG_THE = ['bg-the-1', 'bg-the-2', 'bg-the-3', 'bg-the-4', 'bg-the-5'] as const;

function tongCuaThe(id: string): string {
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n = (n + id.charCodeAt(i)) % TONG_THE.length;
  return TONG_THE[n];
}

/**
 * Một vòng dây leo bò quanh mép thẻ, VẼ DẦN THEO CHIỀU KIM ĐỒNG HỒ từ góc trên bên
 * trái — fen chốt 22/9.
 *
 * Tổng thời gian một vòng, và là mốc chung: độ trễ của từng chiếc lá đều tính từ con
 * số này, nên lá không bao giờ bật ra trước khi dây bò tới chỗ nó. Hai con số riêng thì
 * sớm muộn cũng lệch, và lúc lệch thì lá mọc trên hư không.
 */
const VONG_MS = 900;

/**
 * `preserveAspectRatio="none"` là mấu chốt, không phải cẩu thả.
 *
 * Thẻ game cao thấp khác nhau (tên game một dòng hay hai dòng) và rộng khác nhau theo
 * số cột, nên không có tỉ lệ cố định nào để khai. Cho khung 100×100 giãn tự do theo hộp
 * thì bốn cạnh của `<rect>` LUÔN nằm đúng bốn mép thẻ. Cái giá là nét vẽ bị kéo méo —
 * trả bằng `vector-effect="non-scaling-stroke"`, nhờ đó độ dày nét tính theo pixel màn
 * hình chứ không theo khung đã giãn.
 *
 * `pathLength="100"` đổi chiều dài đường thành 100 đơn vị, bất kể thẻ to nhỏ. Nhờ vậy
 * `stroke-dashoffset` chạy 100 → 0 là vẽ hết đúng một vòng, và vị trí của một chiếc lá
 * tính theo phần trăm cũng chính là mốc thời gian của nó.
 *
 * `<rect>` của SVG vẽ THEO CHIỀU KIM ĐỒNG HỒ và bắt đầu ở cạnh trên bên trái — đúng
 * chiều fen muốn, nên không phải tự viết path.
 */
function DayLeo() {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-0 size-full"
      fill="none"
    >
      {/* Nét nằm ĐÚNG TRÊN mép thẻ (x=0, y=0, phủ hết 100×100), không thụt vào trong.
          Thụt 1 đơn vị như bản đầu là thụt ~3px trên thẻ thật, và thẻ hiện ra hai đường
          viền song song — đọc như lỗi bố cục chứ không ra dây leo. */}
      <rect
        x="0"
        y="0"
        width="100"
        height="100"
        rx="5"
        pathLength="100"
        vectorEffect="non-scaling-stroke"
        stroke="var(--color-decor-than)"
        strokeWidth="2"
        strokeLinecap="round"
        /* Vẽ dần bằng `transition` chứ không bằng `@keyframes`: khối
           `prefers-reduced-motion` chung ở cuối `globals.css` ép mọi transition về
           0,01ms, nên người xin ít chuyển động thấy dây hiện ra ngay, đứng yên. Dùng
           animation thì phải nhớ thêm tên class vào danh sách tắt ở đó — một chỗ nữa
           để quên. */
        data-testid="day-leo"
        className="[stroke-dasharray:100] [stroke-dashoffset:100] transition-[stroke-dashoffset] ease-out group-hover:[stroke-dashoffset:0]"
        style={{ transitionDuration: `${VONG_MS}ms` }}
      />
    </svg>
  );
}

/**
 * LÁ PHỦ KÍN VIỀN, không còn khe hở — fen chốt 22/9, sau bản 28 chiếc còn thưa.
 *
 * 26 chiếc mỗi cạnh là con số ĐO RA, không tính ra. Phép tính tay bảo 22 chiếc là đủ
 * (thẻ lớn nhất 234×266px, chỗ mỗi lá chiếm dọc viền là `cỡ × (14·cos θ + 22·sin|θ|)`
 * ≈ 17,6 / 14,4 / 11,6px, cặp xấu nhất cần bước ≤ 13px, 266 ÷ 13 = 20,5). Đo thật thì
 * 22 chiếc vẫn hở 0,8px — phép tính bỏ sót rằng lá không rải đều theo cỡ, nên chỗ xấu
 * nhất xấu hơn trung bình. Khe hở lớn nhất đo trên sáu khổ màn từ 360 đến 1920px:
 *
 *     28 chiếc: 26,7px · 48: 10,3px · 64: 5,3px · 80: 2,0px
 *     88: 0,8px · 96: −0,2px · 104: −1,0px · 112: −1,8px
 *
 * Số âm là lá chồng nhau, tức viền kín. Ngưỡng kín rơi vào 96, và chọn 104 để có biên
 * 1px chứ không phải 0,2px — thẻ đổi cỡ đôi chút là con số đó ăn hết.
 *
 * Kín ở thẻ LỚN NHẤT thì kín ở mọi khổ: thẻ nhỏ hơn chỉ làm lá chồng nhau dày hơn.
 * Thẻ trong cùng một hàng luôn cao bằng nhau nhờ `h-full`, nên không có thẻ nào cao
 * bất thường để hở thêm.
 *
 * Sinh bằng hàm chứ không liệt kê tay như bản 28 chiếc: 104 dòng toạ độ thì không ai
 * đọc được, và sửa một con số trong đó là sửa 104 chỗ.
 *
 * Mỗi phần tử: [phần trăm dọc đường đi, trái %, trên %, góc xoay, cỡ].
 * Phần trăm dọc đường đi vừa là chỗ đứng vừa là MỐC THỜI GIAN — cạnh trên chiếm 0–25,
 * phải 25–50, dưới 50–75, trái 75–100, đúng như `<rect>` tự vẽ.
 *
 * LÁ NẰM SAU THẺ (fen chốt 22/9), nên chỉ nửa ngoài của mỗi chiếc ló ra khỏi mép —
 * đọc ra là lá mọc từ phía sau thẻ chứ không phải dán lên mặt thẻ. Vì vậy góc xoay
 * phải CHĨA RA NGOÀI: chĩa vào trong thì nửa hiện ra là phần cuống, nhìn như cỏ dại.
 */
const LA_MOI_CANH = 26;

/**
 * Cỡ so le và góc lệch so le, hai chu kỳ ĐỘ DÀI NGUYÊN TỐ CÙNG NHAU (3 và 7).
 *
 * Đều một cỡ thì viền thành hàng răng cưa máy cắt; ba cỡ xen nhau mới ra dáng lá thật.
 * Hai chu kỳ lệch nhau thì cặp (cỡ, góc) chỉ lặp lại sau 21 chiếc — tức gần hết một
 * cạnh — nên mắt không bắt được nhịp lặp. Cùng độ dài thì cả bốn cạnh giống hệt nhau.
 *
 * Ba cỡ GIỮ NGUYÊN như bản 28 chiếc — đây là thẩm mỹ fen đã chốt, không phải nút vặn
 * để bịt khe. Đã thử nới chiếc bé lên 0,70 cho kín viền: bịt được 0,33px trong khi chỗ
 * hở là 0,53px, tức vẫn hở mà lại đổi một thứ fen không yêu cầu đổi. Thứ fen yêu cầu
 * đổi là SỐ LÁ, nên chỗ để vặn là `LA_MOI_CANH`.
 */
const CO_LA = [1, 0.66, 0.82] as const;
const LECH_GOC = [6, -14, 18, -6, 10, -14, 14] as const;

/** Góc chĩa ra ngoài của từng cạnh, theo chiều kim đồng hồ từ cạnh trên. */
const GOC_CANH = [-90, 0, 90, 180] as const;

function raLaVien(): Array<[number, number, number, number, number]> {
  const ds: Array<[number, number, number, number, number]> = [];
  for (let canh = 0; canh < 4; canh += 1) {
    for (let j = 0; j < LA_MOI_CANH; j += 1) {
      const i = canh * LA_MOI_CANH + j;
      // Đặt vào GIỮA ô của mình (j + 0,5) chứ không ở mép ô: hai chiếc ở hai đầu một
      // cạnh vì thế cách góc thẻ nửa bước, nên bốn góc không bị hở cũng không bị dồn.
      const doc = (j + 0.5) / LA_MOI_CANH; // 0 → 1 dọc cạnh này
      const moc = (canh + doc) * 25;
      const p = doc * 100;
      const [trai, tren] =
        canh === 0 ? [p, 0] : canh === 1 ? [100, p] : canh === 2 ? [100 - p, 100] : [0, 100 - p];
      ds.push([
        moc,
        trai,
        tren,
        GOC_CANH[canh] + LECH_GOC[i % LECH_GOC.length],
        CO_LA[i % CO_LA.length],
      ]);
    }
  }
  return ds;
}

const LA_VIEN = raLaVien();

function LaVien() {
  return (
    <>
      {LA_VIEN.map(([moc, trai, tren, g, co], i) => (
        /*
         * HAI TẦNG, cùng cái bẫy đã ghi ở lá rơi: tầng ngoài giữ phép đặt chỗ (dịch về
         * đúng mép, xoay ra ngoài), tầng trong mới mang hiệu ứng nở. Gộp một tầng thì
         * `scale-0` của Tailwind ghi đè `translate`+`rotate` và cả trăm lẻ tư chiếc lá
         * nhảy về góc trên bên trái thẻ.
         */
        <span
          key={i}
          aria-hidden="true"
          data-testid="la-vien"
          className="pointer-events-none absolute"
          /*
           * NEO Ở GỐC LÁ, không phải ở tâm lá.
           *
           * Bản đầu đặt tâm lá trên đường viền: một nửa nằm khuất sau thẻ nên chỉ hở
           * đúng cái chóp — đo được 7,7px ló ra trên một chiếc cao 23px, nhìn như vụn
           * rác chứ không ra lá. Nay `transform-origin` về mép trái giữa, tức gốc lá,
           * và cả thân vươn ra ngoài theo hướng xoay.
           *
           * `translateX(-22%)` kéo gốc thụt vào trong thẻ một chút, nên chỗ lá dính vào
           * vẫn bị thẻ che — đó là thứ làm nó đọc ra "mọc từ phía sau" thay vì "dán vào
           * mép". Thứ tự phép biến hình phải là dịch → xoay → thụt, vì phép cuối tính
           * theo trục ĐÃ XOAY của chính chiếc lá.
           */
          style={{
            left: `${trai}%`,
            top: `${tren}%`,
            transformOrigin: 'left center',
            transform: `translateY(-50%) rotate(${g}deg) translateX(-22%)`,
          }}
        >
          <svg
            viewBox="0 -8 26 16"
            className="block scale-0 opacity-0 transition-all duration-200 ease-out group-hover:scale-100 group-hover:opacity-100"
            /* Lá bật ra ĐÚNG LÚC dây bò tới chỗ nó. Trừ đi một nhịp ngắn để lá nhú
               ngay sau nét vẽ chứ không lẽo đẽo phía sau. */
            style={{
              width: `${co * 22}px`,
              height: `${co * 14}px`,
              transitionDelay: `${Math.max(0, (moc / 100) * VONG_MS - 60)}ms`,
            }}
            fill="none"
          >
            <La
              x={0}
              y={0}
              g={0}
              s={1}
              mau={i % 3 === 0 ? 'var(--color-decor-la-dam)' : i % 3 === 1 ? 'var(--color-decor-la)' : 'var(--color-decor-la-sang)'}
            />
          </svg>
        </span>
      ))}
    </>
  );
}

/**
 * HOA XEN VÀO VIỀN, năm bông mỗi cạnh — fen chốt 23/9.
 *
 * THÊM một lớp riêng chứ KHÔNG đổi vài chiếc lá thành hoa. Bông hoa hẹp hơn chiếc lá
 * (18 đơn vị so với 26) nên mỗi chỗ đổi là một chỗ viền hở lại, đúng cái vừa đo công
 * mới bịt xong. Lá giữ nguyên 104 chiếc lo phần kín; hoa nằm đè lên, lo phần màu.
 *
 * Năm bông mỗi cạnh chứ không dày hơn: hoa là điểm nhấn, rải đặc thì viền thành một
 * vòng hoa và mất hẳn cái dáng dây leo mọc lá.
 *
 * Mốc thời gian tính CÙNG một công thức với lá, nên bông hoa cũng bung ra đúng lúc dây
 * leo bò tới chỗ nó — chung một vòng 900ms, không phải nhịp thứ hai.
 */
const HOA_MOI_CANH = 5;
const MAU_HOA = ['var(--color-decor-hoa-hong)', 'var(--color-decor-hoa-vang)'] as const;
/** Cỡ so le, lệch chu kỳ với số bông mỗi cạnh (3 và 5) nên bốn cạnh không giống nhau. */
const CO_HOA = [1, 0.78, 0.9] as const;

function raHoaVien(): Array<[number, number, number, number, number]> {
  const ds: Array<[number, number, number, number, number]> = [];
  for (let canh = 0; canh < 4; canh += 1) {
    for (let j = 0; j < HOA_MOI_CANH; j += 1) {
      const i = canh * HOA_MOI_CANH + j;
      /* Lệch 0,32 thay vì 0,5: đặt đúng giữa ô thì bông hoa rơi trùng tâm một chiếc lá
         và che mất nó. Lệch đi thì hoa nhú lên từ KẼ giữa hai chiếc lá. */
      const doc = (j + 0.32) / HOA_MOI_CANH;
      const moc = (canh + doc) * 25;
      const p = doc * 100;
      const [trai, tren] =
        canh === 0 ? [p, 0] : canh === 1 ? [100, p] : canh === 2 ? [100 - p, 100] : [0, 100 - p];
      ds.push([moc, trai, tren, GOC_CANH[canh] + LECH_GOC[i % LECH_GOC.length], CO_HOA[i % CO_HOA.length]]);
    }
  }
  return ds;
}

const HOA_VIEN = raHoaVien();

function HoaVien() {
  return (
    <>
      {HOA_VIEN.map(([moc, trai, tren, g, co], i) => (
        /* Hai tầng như lá, cùng lý do: tầng ngoài đặt chỗ, tầng trong nở. */
        <span
          key={i}
          aria-hidden="true"
          data-testid="hoa-vien"
          className="pointer-events-none absolute"
          style={{
            left: `${trai}%`,
            top: `${tren}%`,
            transformOrigin: 'left center',
            /* Thụt SÂU hơn lá (−34% so với −22%): cuống hoa ngắn hơn thân lá nhiều, để
               nguyên mức của lá thì cả bông nổi hẳn ra ngoài mép, trông như dán lên
               chứ không phải mọc lên từ sau thẻ. */
            transform: `translateY(-50%) rotate(${g}deg) translateX(-34%)`,
          }}
        >
          <svg
            viewBox="0 -9 18 18"
            className="block scale-0 opacity-0 transition-all duration-200 ease-out group-hover:scale-100 group-hover:opacity-100"
            style={{
              width: `${co * 18}px`,
              height: `${co * 18}px`,
              transitionDelay: `${Math.max(0, (moc / 100) * VONG_MS - 60)}ms`,
            }}
            fill="none"
          >
            {/* `Hoa` vẽ cuống chĩa LÊN (theo −y), mà chỗ này cần nó chĩa RA NGOÀI theo
                +x như chiếc lá. Xoay 90° một lần ở đây, thay vì vẽ lại một bông hoa thứ
                hai nằm ngang — hai bản vẽ của cùng một bông thì sớm muộn lệch nhau. */}
            <g transform="rotate(90)">
              <Hoa x={0} y={0} mau={MAU_HOA[i % MAU_HOA.length]} s={1} />
            </g>
          </svg>
        </span>
      ))}
    </>
  );
}

/**
 * Lá trên cành mọc: [x, y, góc xoay, cỡ]. Vẽ cho cành CHĨA LÊN PHẢI, gốc ở góc dưới
 * bên trái khung 100×72; ba cành còn lại dùng lại đúng hình này rồi lật.
 */
const LA_CANH_MOC: Array<[number, number, number, number]> = [
  [10, 60, -34, 0.6],
  [20, 68, 26, 0.52],
  [26, 52, -40, 0.58],
  [36, 60, 22, 0.5],
  [42, 44, -32, 0.56],
  [52, 52, 26, 0.48],
  [58, 36, -36, 0.54],
  [68, 44, 22, 0.46],
  [72, 28, -30, 0.5],
  [82, 34, 24, 0.44],
  [86, 20, -28, 0.46],
  // Trên nhánh con chĩa xuống.
  [50, 60, 46, 0.46],
  [58, 68, 40, 0.42],
];

/**
 * MỘT cành mọc ra từ một góc thẻ khi trỏ chuột vào.
 *
 * BỐN CÀNH GÓC QUAY LẠI — fen chốt 23/9. Chúng từng bị bỏ ở `7420bdf` khi lá viền thay
 * chỗ, nhưng giờ chạy CÙNG lá viền chứ không thay nhau: lá viền lo cái mép thẻ, cành lo
 * bốn góc chìa hẳn ra ngoài. Hai thứ không tranh chỗ vì cành neo ở NGOÀI hộp thẻ
 * (`bottom-full`, `left-full`…) còn lá viền neo đúng trên mép.
 *
 * `origin-*` đặt ở đúng góc cành dính vào thẻ, rồi `scale-0` → `scale-100`: nó lớn dần
 * RA TỪ chỗ đó nên đọc ra là MỌC, không phải hiện ra. Gốc phóng đặt sai chỗ (giữa
 * khung chẳng hạn) thì cả cành phình ra từ hư không.
 *
 * Cành nào cũng là cùng một hình vẽ, chỉ LẬT: `lat` lật ngang, `doc` lật dọc. Lật bằng
 * thuộc tính `transform` của thẻ <g> BÊN TRONG svg, không bằng class CSS ở ngoài —
 * `scale-0`/`scale-100` của hiệu ứng mọc cũng là `transform` trên chính thẻ svg, hai
 * cái đặt cùng chỗ thì cái sau xoá cái trước.
 *
 * HAI TẦNG <g>: tầng ngoài LẬT, tầng trong RUNG. Gộp một tầng thì hai cành lật dọc bay
 * đi mất, và lý do rất kín:
 *
 *   `.kg-rung-canh` phải đặt `transform-box: fill-box` + `transform-origin: 0% 100%` để
 *   rung quanh gốc cành. Mà thuộc tính `transform` của SVG cũng chỉ là thuộc tính CSS
 *   `transform` viết tắt, nên nó chịu luôn cái `transform-origin` ấy. Bình thường gốc
 *   biến hình của phần tử SVG là (0,0) của viewBox, phép lật vì thế soi gương đúng trục
 *   mình tính; đổi gốc sang góc dưới bên trái HỘP BAO thì cùng một phép lật cho ra chỗ
 *   khác hẳn. Đo được: cành lật dọc rơi xuống đơn vị y = 148 trên khung cao 72 — tức
 *   nằm ngoài khung nhìn và bị svg cắt sạch, không còn một nét nào. Đó là vì sao trước
 *   đây chỉ thấy hai cành trên, và cả thẻ đọc ra như cành của thẻ hàng trên chĩa xuống.
 *
 * Tầng trong nằm TRONG tầng lật nên hộp bao của nó là hình vẽ gốc, góc dưới bên trái
 * của hộp ấy đúng là chỗ cành dính vào thẻ — nhịp rung vì thế pivot đúng gốc ở cả bốn
 * hướng lật.
 *
 * Cùng một cái bẫy "CSS transform ghi đè transform của SVG" đã gặp ở mấy ngôi sao trên
 * thanh nav và ở lá rơi bên dưới. Cách chữa cũng vẫn thế: tách tầng.
 */
function CanhMoc({
  o,
  rong,
  lat = false,
  doc = false,
  cham = 0,
  moc = 0,
}: {
  /** Lớp Tailwind đặt chỗ: góc nào của thẻ, và gốc phóng ở đâu. */
  o: string;
  rong: string;
  lat?: boolean;
  doc?: boolean;
  /** Lệch pha nhịp rung, giây. Ba cành rung cùng nhịp thì cả thẻ giật như một khối. */
  cham?: number;
  /** Góc này nằm ở đâu trên vòng dây leo, phần trăm — quyết định lúc cành bung ra. */
  moc?: number;
}) {
  return (
    <svg
      viewBox="0 0 100 72"
      aria-hidden="true"
      focusable="false"
      data-testid="canh-goc"
      className={`pointer-events-none absolute scale-0 opacity-0 transition-all duration-300 ease-out group-hover:scale-100 group-hover:opacity-100 ${o} ${rong}`}
      style={{ transitionDelay: `${(moc / 100) * VONG_MS}ms` }}
      fill="none"
    >
      <g
        transform={`scale(${lat ? -1 : 1} ${doc ? -1 : 1}) translate(${lat ? -100 : 0} ${doc ? -72 : 0})`}
      >
        <g className="kg-rung-canh" style={{ animationDelay: `${cham}s` }}>
          <path
            d="M-4 72C16 66 40 54 60 40 74 30 86 22 96 16"
            stroke="var(--color-decor-than)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          {/* Một nhánh con chĩa xuống. Cành trơ một nhánh thì đọc ra là cái gậy có lá
              dán hai bên. */}
          <path
            d="M44 52C50 60 56 66 64 70"
            stroke="var(--color-decor-than)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          {LA_CANH_MOC.map(([x, y, g, s], i) => (
            <La
              key={i}
              x={x}
              y={y}
              g={g}
              s={s}
              mau={i % 2 ? 'var(--color-decor-la-dam)' : 'var(--color-decor-la)'}
            />
          ))}
          {/*
            SÁU bông mỗi cành, fen chốt 23/9 — trước là hai. Năm bám thân, một trên
            nhánh con.
            Bám dọc thân cành (đường cong từ góc dưới trái lên góc trên phải) và NHỎ DẦN
            về phía ngọn: bông to ở ngọn thì cành trông như bị bẻ gập vì đầu nặng. Một
            bông đặt trên nhánh con chĩa xuống để nhánh ấy không còn trơ.
          */}
          <Hoa x={20} y={58} mau="var(--color-decor-hoa-vang)" s={0.72} />
          <Hoa x={34} y={48} mau="var(--color-decor-hoa-hong)" s={0.7} />
          <Hoa x={54} y={38} mau="var(--color-decor-hoa-vang)" s={0.64} />
          <Hoa x={76} y={26} mau="var(--color-decor-hoa-hong)" s={0.6} />
          <Hoa x={90} y={18} mau="var(--color-decor-hoa-vang)" s={0.52} />
          <Hoa x={56} y={64} mau="var(--color-decor-hoa-hong)" s={0.54} />
        </g>
      </g>
    </svg>
  );
}

/**
 * Lá rớt từ trên xuống, trôi chéo qua mặt thẻ.
 *
 * Nằm TRƯỚC thẻ (vẽ sau thẻ trong DOM) chứ không sau như lá viền: lá rơi mà bị thẻ che
 * thì chỉ thấy nó ở dải hẹp ngoài mép, tức gần như không thấy gì. Lá viền thì ngược
 * lại — phải nằm sau để trông như mọc từ phía sau thẻ ra.
 *
 * Bốn chiếc, mỗi chiếc một chỗ và một nhịp. Rơi cùng lúc thì thành một cơn mưa lá đều
 * tăm tắp, mà lá rụng thật thì không bao giờ đều.
 *
 * HAI TẦNG <g> lồng nhau cho mỗi chiếc, và đây là chỗ dễ sai nhất: tầng ngoài giữ
 * `transform` đặt chỗ, tầng trong mới mang hoạt ảnh. Gộp một tầng thì `transform` của
 * keyframes ghi đè `transform` đặt chỗ, và cả bốn chiếc lá nhảy về gốc toạ độ ngay
 * khung hình đầu — cùng cái bẫy đã gặp ở mấy ngôi sao trên thanh nav.
 */
const LA_ROI: Array<[number, number, number, number]> = [
  // [x, y, cỡ, lệch pha giây]
  [62, 6, 0.62, 0],
  [78, 2, 0.5, -0.9],
  [46, 12, 0.56, -1.7],
  [88, 16, 0.44, -2.3],
];

function LaRoi() {
  return (
    <svg
      viewBox="0 0 100 150"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMin meet"
      className="pointer-events-none absolute inset-0 size-full"
      fill="none"
    >
      {LA_ROI.map(([x, y, s, cham], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <g className="kg-la-roi" style={{ animationDelay: `${cham}s` }}>
            <La
              x={0}
              y={0}
              g={i % 2 ? 20 : -30}
              s={s}
              mau={i % 2 ? 'var(--color-decor-la)' : 'var(--color-decor-la-sang)'}
            />
          </g>
        </g>
      ))}
    </svg>
  );
}

export interface GameCardData {
  id: string;
  title: string;
  authorName: string;
  thumbUrl: string;
  playCount: number;
  /** Nhãn loại game, ví dụ "Giải đố". Thẻ chỉ hiện CÁI ĐẦU TIÊN — xem `NhanLoai`. */
  tagLabels?: string[];
  /**
   * TỔNG số icon đã thả, gộp cả năm loại. LUÔN hiện, kể cả 0.
   *
   * Tổng chứ không tách từng loại: thẻ game to bằng ngón tay cái, năm con số nhỏ trên
   * đó không đọc được và cũng không ai cần đọc ở đây — muốn biết bạn bè thả gì thì vào
   * trang game. Ở danh sách, câu hỏi duy nhất là "cái này có được yêu thích không".
   *
   * TỪNG ẩn ở 0, với lý lẽ: một dãy thẻ mà thẻ nào cũng đeo "❤ 0" đọc lên là bảng xếp
   * hạng những game không ai thích, mà mỗi thẻ ở đây là công của một đứa trẻ. Fen nhìn
   * thẻ thật của một game mới và chốt ngược lại: chỗ đó trông trống, và "❤ 0" nói thẳng
   * rằng game này CÓ chỗ để thả icon, chưa ai thả. Đánh đổi vẫn còn đó, đừng đảo lại mà
   * không hỏi fen.
   */
  reactionCount?: number;
}

/**
 * Tam giác nút chơi, dùng ở hai cỡ: nút chơi to trên ảnh và viên thuốc số lượt chơi.
 *
 * Dấu hiệu logo ĐÃ ĐỔI sang đầu mèo, nên hai hình giờ khác nhau — và khác là đúng. Ở
 * đây tam giác mang nghĩa "bấm vào là chạy", một hành động; trên thanh nav nó phải mang
 * nghĩa "đây là trang nào", một danh tính. Một hình gánh hai nghĩa thì cái nào cũng mờ.
 */
function TamGiac({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} focusable="false" aria-hidden="true">
      <path
        d="M9 6.8 18.2 12 9 17.2Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Nhãn loại game: một viên thuốc viền cam.
 *
 * CHỈ hiện nhãn ĐẦU TIÊN dù game được gắn tối đa hai loại. Thẻ ở cột hẹp nhất chỉ
 * rộng khoảng 160px, mà hai viên thuốc cạnh nhau là đủ đẩy tên bé xuống dòng hoặc bị
 * cắt cụt — mất một thông tin chắc chắn có ích để lấy một thông tin có thể có ích.
 *
 * ĐẶT TRÊN ẢNH, không phải dưới tiêu đề — và đây là chỗ đã thử rồi phải sửa. Đặt nó
 * cạnh tên bé thì ở khổ 2 cột (điện thoại, thẻ rộng chừng 150px) tên bé bị cắt thành
 * "Bé Khá…". Đổi một thông tin chắc chắn có ích (game này của ai) lấy một thông tin
 * có thể có ích thì không đáng, mà điện thoại lại là thiết bị chính của trẻ.
 *
 * Nền `chrome` ĐẶC với chữ `accent`, cùng lý do như viên thuốc số lượt chơi: ảnh game
 * là ảnh gì thì không biết trước, nên chữ đặt thẳng lên ảnh là chữ nằm trên một màu
 * không đoán được. Chữ CAM (không phải trắng như viên kia) để hai viên thuốc cùng nền
 * tối vẫn phân biệt được ngay: một cái là con số, một cái là cái nhãn.
 */
function NhanLoai({ labels }: { labels?: string[] }) {
  const nhan = labels?.[0];
  if (!nhan) return null;
  return (
    <span className="absolute bottom-2 left-2 max-w-[calc(100%-4rem)] truncate rounded-full bg-chrome px-2 py-0.5 text-xs font-bold text-accent shadow-sm">
      {nhan}
    </span>
  );
}

/**
 * Thẻ game trên trang chủ.
 *
 * Cả thẻ là một link chứ không phải chỉ tiêu đề — vùng bấm to hơn nhiều,
 * quan trọng với trẻ dùng điện thoại.
 */
export function GameCard({ game }: { game: GameCardData }) {
  return (
    /*
     * BỌC MỘT LỚP NGOÀI THẺ, và lớp này bắt buộc phải có — không phải để cho gọn.
     *
     * Lá viền phải nằm SAU thẻ mới ra vẻ mọc từ phía sau. Cách hiển nhiên là đặt lá làm
     * con của thẻ rồi cho `-z-10`, và cách đó SAI: thẻ có `hover:-translate-y-1`, mà
     * một phần tử có `transform` thì tự thành stacking context, nên đúng lúc trỏ chuột
     * vào — đúng lúc lá cần hiện — mọi con z-index âm bị kẹt lại phía sau nền thẻ và
     * biến mất sạch.
     *
     * Nên lá là con của LỚP BỌC, không phải con của thẻ. Thứ tự trong DOM lo phần còn
     * lại: lá viền vẽ trước → thẻ vẽ sau và che nửa trong của mỗi chiếc → dây leo và lá
     * rơi vẽ sau cùng nên chúng nằm trước mặt thẻ.
     *
     * `group` và `kg-the-game` đặt ở lớp bọc, nhưng vùng chuột vẫn đúng bằng cái thẻ:
     * lá và dây leo đều `absolute` nên chúng không nới hộp của lớp bọc ra.
     */
    <div className="kg-the-game group relative">
      {/*
        LÁ VIỀN vẽ TRƯỚC thẻ trong DOM, tức nằm PHÍA SAU mặt thẻ (fen chốt 22/9). Mỗi
        chiếc đặt tâm đúng trên đường viền nên chỉ nửa ngoài ló ra — đọc ra là lá mọc từ
        sau thẻ chứ không phải hình dán lên mặt thẻ. Nằm trước mặt thẻ thì lá che mất
        ảnh bìa và tên game của bé, tức trang trí ăn mất nội dung.
      */}
      {/*
        BỐN CÀNH GÓC, mỗi cành bung ra đúng lúc dây leo bò tới góc của nó, theo chiều
        kim đồng hồ: trên-trái (0) → trên-phải (25) → dưới-phải (50) → dưới-trái (75).
        Trước đây cả bốn mọc cùng lúc, và cùng lúc thì thẻ chỉ "nở bụp" một cái chứ
        không đọc ra là có thứ gì đang bò quanh.

        Vẽ TRƯỚC lá viền trong DOM, nên cành nằm dưới cùng: chỗ gốc cành gặp góc thẻ có
        lá viền phủ lên, và chỗ nối ấy khuất đi thay vì hở ra một đầu cành cụt.
      */}
      <CanhMoc o="bottom-full left-full -mb-6 -ml-10 origin-bottom-left" rong="w-28" moc={25} />
      <CanhMoc
        o="top-full right-full -mr-9 -mt-6 origin-top-right"
        rong="w-24"
        lat
        doc
        cham={-0.7}
        moc={75}
      />
      <CanhMoc
        o="bottom-full right-full -mb-5 -mr-8 origin-bottom-right"
        rong="w-20"
        lat
        cham={-1.4}
        moc={0}
      />
      <CanhMoc
        o="top-full left-full -ml-8 -mt-5 origin-top-left"
        rong="w-16"
        doc
        cham={-2.1}
        moc={50}
      />

      <LaVien />
      {/* Hoa vẽ SAU lá nhưng vẫn trước thẻ trong DOM: nó nằm trên nền lá (không bị một
          chiếc lá nào che mất) mà vẫn khuất nửa trong sau mặt thẻ như lá. */}
      <HoaVien />

      <Link
        href={`/game/${game.id}`}
        data-testid="game-card"
      /*
       * Ảnh nằm LỌT TRONG thẻ (thẻ có padding, ảnh tự bo góc) chứ không dán sát mép.
       * Bản cũ để ảnh chạm ba cạnh nên chỗ ảnh gặp phần chữ thành một đường cắt
       * ngang, và thẻ trông như hai mảnh dán lại. Một khung đệm quanh ảnh làm cả thẻ
       * thành một mặt liền.
       *
       * Hover nhấc 4px chứ không phải 2px: 2px là thứ người lớn ngồi gần màn hình
       * mới nhận ra. Trẻ cần phản hồi rõ ràng để biết cái này bấm được.
       *
       * `h-full` KHÔNG phải để cho các thẻ trong một hàng cao bằng nhau — cái đó chỉ là
       * phần thưởng kèm theo. Lớp bọc bên ngoài là một ô lưới, nên nó bị kéo cao bằng
       * hàng, còn cái thẻ này thì cao theo nội dung: tên game một dòng thì thẻ ngắn hơn
       * ô lưới. Mà lá viền và dây leo đặt chỗ theo phần trăm của LỚP BỌC. Đo được hồi
       * còn bốn cành góc: thẻ hết ở 579 mà lớp bọc hết ở 607, nên trang trí mọc ra từ
       * chỗ trống giữa hai hàng, cách thẻ 28px. `h-full` cho hai mép trùng nhau.
       */
        className={`relative block h-full p-2 no-underline transition duration-150 hover:-translate-y-1 hover:border-accent hover:shadow-lg ${KHUNG_THE} ${tongCuaThe(game.id)}`}
      >
        {/*
          `overflow-hidden` ở khung ngoài ảnh, không phải `rounded-xl` trên chính ảnh.
          Ảnh nhích to ra 4% khi trỏ vào, mà bo góc trên ảnh thì bốn góc phóng to theo
          và tràn ra ngoài khung — khung bo góc rồi cắt thì góc đứng yên.
        */}
        <div className="relative overflow-hidden rounded-xl">
          {/*
            Ảnh nằm trên player origin nên dùng <img> thường thay vì next/image:
            next/image sẽ đòi cấu hình remotePatterns, mà ảnh đã đúng kích thước và
            đã là webp rồi, không cần tối ưu thêm. `AnhBia` vẽ ô thay thế khi ảnh hỏng.
          */}
          <AnhBia
            src={game.thumbUrl}
            ten={game.title}
            loading="lazy"
            width={480}
            height={360}
            className="block aspect-4/3 w-full bg-bg object-cover transition-transform duration-300 group-hover:scale-104"
          />
          {/*
            Viền mảnh CHỒNG LÊN ảnh, vẽ vào trong (`ring-inset`).
            Ảnh game của các bé phần lớn là nền pastel rất nhạt, gần bằng nền thẻ, nên
            không có viền này thì mép ảnh biến mất và thẻ trông như một mảng trắng có
            chữ. Dùng token `border` chứ không phải một màu đen mờ: `border` tự đảo theo
            giao diện, còn màu đen mờ thì ở giao diện tối là đen trên tối, mất hút.
          */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-border"
          />
          {/*
            Nút chơi ở góc ảnh — LUÔN hiện, không phải chỉ hiện khi trỏ chuột vào.
            Phần lớn người dùng trang này ngồi trên máy tính bảng hoặc điện thoại, ở đó
            KHÔNG có trạng thái hover: một nút chơi chỉ hiện lúc hover là một nút không
            bao giờ tồn tại với đúng những đứa trẻ dùng thiết bị cảm ứng.

            Cùng hình tam giác với dấu hiệu logo, cùng nền cam: bấm vào ô này là game
            chạy, và đó là điều duy nhất cái thẻ này cần nói.
          */}
          <span
            aria-hidden="true"
            className="absolute bottom-2 right-2 grid size-9 place-items-center rounded-full bg-accent text-chrome shadow-md transition-transform duration-150 group-hover:scale-110"
          >
            <TamGiac className="size-4" />
          </span>

          {/*
            SỐ LƯỢT CHƠI nằm trên ảnh, trong một viên thuốc tối.

            Trước đây nó là chữ xám ở dòng cuối, sau tên bé, ngang hàng với mọi thứ
            khác — tức là một con số không ai đọc. Với trẻ con thì đây lại đúng là con
            số đáng đọc nhất: "bạn nào cũng chơi cái này" là lý do bấm vào.

            Nền `chrome` ĐẶC, không phải đen mờ. Ảnh game là ảnh gì thì không ai biết
            trước, nên nền mờ nghĩa là chữ nằm trên một màu không đoán được — đúng chỗ
            `contrast-check` bó tay. Nền đặc thì cặp `chrome-ink` trên `chrome` đã đo:
            15.3:1.
          */}
          {/* Hai viên thuốc nằm cùng một hàng ở góc trên trái. Đặt viên icon ở góc
              khác thì nó đụng `NhanLoai`, và ba thứ nổi trên một tấm ảnh nhỏ bằng
              ngón tay cái là quá đông. */}
          <span className="absolute left-2 top-2 flex items-center gap-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-chrome px-2 py-0.5 text-xs font-bold text-chrome-ink shadow-sm">
              <TamGiac className="size-2.5" />
              {game.playCount}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full bg-chrome px-2 py-0.5 text-xs font-bold text-chrome-ink shadow-sm"
              data-testid="the-so-icon"
              aria-label={
                (game.reactionCount ?? 0) === 0
                  ? 'Chưa bạn nào thả icon'
                  : `${game.reactionCount} bạn đã thả icon`
              }
            >
                {/*
                  `❤` (U+2764) TRẦN, cố ý không kèm U+FE0F.

                  Thiếu ký tự chọn kiểu ấy thì đa số hệ điều hành vẽ nó như MỘT CHỮ
                  trong font của trang — nhận màu `chrome-ink` như con số bên cạnh, và
                  cao đúng bằng dòng chữ. Thêm U+FE0F vào là ép sang emoji màu, mà
                  emoji màu thì mỗi hệ một hình và trên viên thuốc cỡ này nó nhô cao
                  hơn con số, làm hàng bị lệch.

                  Đây KHÁC với hàng icon ở trang game: chỗ đó cần emoji màu thật vì
                  chính hình vẽ là nội dung. Ở đây hình chỉ là nhãn cho con số.

                  `aria-hidden` vì câu đọc cho trình đọc màn hình nằm ở `aria-label`
                  của cả viên thuốc — không thì nó đọc "trái tim hai" cụt lủn.
                */}
              <span aria-hidden="true">❤</span>
              {game.reactionCount ?? 0}
            </span>
          </span>

          <NhanLoai labels={game.tagLabels} />

          {/* Phản hồi cho chính cú chạm vừa rồi — xem `the-dang-mo.tsx`. Đặt TRONG
              khung ảnh (không phải trong cả thẻ) để lớp phủ bo đúng góc ảnh và không
              đè lên tên game — tên game là thứ giúp bé biết mình có bấm nhầm không. */}
          <TheDangMo />
        </div>

        <div className="px-1.5 pb-1 pt-2.5">
          {/* 2 dòng thay vì cắt cụt: tên game bị cắt thì trẻ không biết game gì. */}
          <p className="mb-0.5 line-clamp-2 text-lg font-bold leading-snug group-hover:text-accent-text">
            {game.title}
          </p>
          <p className="truncate text-sm text-ink-soft">{game.authorName}</p>
        </div>
      </Link>

      {/*
        DÂY LEO vẽ sau thẻ trong DOM, tức nằm TRƯỚC mặt thẻ: nó bò đúng trên đường viền,
        nằm sau thì bị chính thẻ che kín và không thấy nét nào.
      */}
      <DayLeo />

      {/* Lá rơi vẽ SAU CÙNG nên nó trôi qua trước mặt thẻ — xem ghi chú ở `LaRoi`. */}
      <LaRoi />
    </div>
  );
}
