import Link from 'next/link';
import { AnhBia } from './anh-bia';
import { KHUNG_THE } from './card';
import { La } from './site-decor';
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
 * Lá mọc dọc bốn cạnh: [phần trăm dọc đường đi, trái %, trên %, góc xoay, cỡ].
 *
 * Phần trăm dọc đường đi vừa là chỗ đứng vừa là mốc thời gian — cạnh trên chiếm 0–25,
 * phải 25–50, dưới 50–75, trái 75–100, đúng như `<rect>` tự vẽ.
 *
 * LÁ NẰM SAU THẺ (fen chốt 22/9), nên chỉ nửa ngoài của mỗi chiếc ló ra khỏi mép —
 * đọc ra là lá mọc từ phía sau thẻ chứ không phải dán lên mặt thẻ. Vì vậy góc xoay
 * phải CHĨA RA NGOÀI: chĩa vào trong thì nửa hiện ra là phần cuống, nhìn như cỏ dại.
 *
 * Bảy chiếc mỗi cạnh, cỡ so le 1 / 0,82 / 0,66. Đều một cỡ thì viền thành một hàng răng
 * cưa máy cắt; ba cỡ xen nhau mới ra dáng lá thật.
 */
const LA_VIEN: Array<[number, number, number, number, number]> = [
  // Cạnh trên, trái → phải
  [2, 8, 0, -84, 1],
  [5.25, 21, 0, -100, 0.66],
  [8.5, 34, 0, -72, 0.82],
  [11.75, 47, 0, -96, 1],
  [15, 60, 0, -80, 0.66],
  [18.25, 73, 0, -104, 0.82],
  [21.5, 86, 0, -76, 1],
  // Cạnh phải, trên → dưới
  [27, 100, 8, 6, 0.82],
  [30.25, 100, 21, -14, 1],
  [33.5, 100, 34, 18, 0.66],
  [36.75, 100, 47, -6, 0.82],
  [40, 100, 60, 14, 1],
  [43.25, 100, 73, -16, 0.66],
  [46.5, 100, 86, 8, 0.82],
  // Cạnh dưới, phải → trái
  [52, 92, 100, 96, 1],
  [55.25, 79, 100, 76, 0.66],
  [58.5, 66, 100, 104, 0.82],
  [61.75, 53, 100, 84, 1],
  [65, 40, 100, 100, 0.66],
  [68.25, 27, 100, 80, 0.82],
  [71.5, 14, 100, 98, 1],
  // Cạnh trái, dưới → lên
  [77, 0, 92, 186, 0.82],
  [80.25, 0, 79, 166, 1],
  [83.5, 0, 66, 194, 0.66],
  [86.75, 0, 53, 174, 0.82],
  [90, 0, 40, 190, 1],
  [93.25, 0, 27, 170, 0.66],
  [96.5, 0, 14, 196, 0.82],
];

function LaVien() {
  return (
    <>
      {LA_VIEN.map(([moc, trai, tren, g, co], i) => (
        /*
         * HAI TẦNG, cùng cái bẫy đã ghi ở lá rơi: tầng ngoài giữ phép đặt chỗ (dịch về
         * đúng mép, xoay ra ngoài), tầng trong mới mang hiệu ứng nở. Gộp một tầng thì
         * `scale-0` của Tailwind ghi đè `translate`+`rotate` và cả hai mươi tám chiếc lá
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
      <LaVien />

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
