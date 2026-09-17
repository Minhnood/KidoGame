import Link from 'next/link';
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
}: {
  /** Lớp Tailwind đặt chỗ: góc nào của thẻ, và gốc phóng ở đâu. */
  o: string;
  rong: string;
  lat?: boolean;
  doc?: boolean;
  /** Lệch pha nhịp rung, giây. Ba cành rung cùng nhịp thì cả thẻ giật như một khối. */
  cham?: number;
}) {
  return (
    <svg
      viewBox="0 0 100 72"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none absolute scale-0 opacity-0 transition-all duration-300 ease-out group-hover:scale-100 group-hover:opacity-100 ${o} ${rong}`}
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
          <Hoa x={34} y={48} mau="var(--color-decor-hoa-hong)" s={0.7} />
          <Hoa x={76} y={26} mau="var(--color-decor-hoa-vang)" s={0.6} />
        </g>
      </g>
    </svg>
  );
}

/**
 * Lá rớt khỏi cành, trôi chéo xuống qua mặt thẻ.
 *
 * Nằm TRƯỚC thẻ (vẽ sau thẻ trong DOM) chứ không sau như mấy cành: lá rơi mà bị thẻ
 * che thì chỉ thấy nó ở dải hẹp ngoài mép thẻ, tức gần như không thấy gì. Cành thì
 * ngược lại — phải nằm sau để trông như mọc từ phía sau thẻ ra.
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
     * Cành phải nằm SAU thẻ mới ra vẻ mọc từ phía sau. Cách hiển nhiên là đặt cành làm
     * con của thẻ rồi cho `-z-10`, và cách đó SAI: thẻ có `hover:-translate-y-1`, mà
     * một phần tử có `transform` thì tự thành stacking context, nên đúng lúc trỏ chuột
     * vào — đúng lúc cành cần hiện — mọi con z-index âm bị kẹt lại phía sau nền thẻ và
     * biến mất sạch.
     *
     * Nên cành là con của LỚP BỌC, không phải con của thẻ. Thứ tự trong DOM lo phần
     * còn lại: cành vẽ trước → thẻ vẽ sau và che gốc cành → lá rơi vẽ sau cùng nên nó
     * trôi qua trước mặt thẻ.
     *
     * `group` và `kg-the-game` đặt ở lớp bọc, nhưng vùng chuột vẫn đúng bằng cái thẻ:
     * cành và lá đều `absolute` nên chúng không nới hộp của lớp bọc ra.
     */
    <div className="kg-the-game group relative">
      <CanhMoc o="bottom-full left-full -mb-6 -ml-10 origin-bottom-left" rong="w-28" />
      <CanhMoc
        o="top-full right-full -mr-9 -mt-6 origin-top-right"
        rong="w-24"
        lat
        doc
        cham={-0.7}
      />
      <CanhMoc
        o="bottom-full right-full -mb-5 -mr-8 origin-bottom-right"
        rong="w-20"
        lat
        cham={-1.4}
      />
      <CanhMoc
        o="top-full left-full -ml-8 -mt-5 origin-top-left"
        rong="w-16"
        doc
        cham={-2.1}
      />

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
       * ô lưới. Mà hai cành dưới đặt chỗ bằng `top-full` — tức mép dưới của LỚP BỌC.
       * Đo được: thẻ hết ở 579 mà lớp bọc hết ở 607, hai cành dưới mọc ra từ chỗ trống
       * giữa hai hàng, cách thẻ 28px. `h-full` cho hai mép trùng nhau.
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
            đã là webp rồi, không cần tối ưu thêm.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={game.thumbUrl}
            alt=""
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

      {/* Lá rơi vẽ SAU CÙNG nên nó trôi qua trước mặt thẻ — xem ghi chú ở `LaRoi`. */}
      <LaRoi />
    </div>
  );
}
