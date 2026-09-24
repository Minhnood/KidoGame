/**
 * Hai biểu đồ của tab Tổng quan, vẽ bằng SVG viết tay.
 *
 * VÌ SAO KHÔNG DÙNG THƯ VIỆN. CSP của app không có `script-src 'unsafe-inline'` và
 * không cho host ngoài, nên một thư viện chart phải vào qua bundle — thêm vài trăm KB
 * JS cho một trang nội bộ mà cả hai hình ở đây là ba mươi dòng hình học. Cả hai
 * component là SERVER component: chúng không gửi một byte JS nào xuống trình duyệt.
 *
 * KHÔNG có tooltip dựng bằng JS, cố ý: mỗi hình mang `<title>` — trình duyệt hiện nó
 * khi trỏ chuột và trình đọc màn hình đọc nó, không cần script. Và không có giá trị
 * nào CHỈ đọc được bằng cách trỏ chuột: chú giải của donut là một bảng số đầy đủ, còn
 * cột có bảng số trong `<details>`. Một biểu đồ mà phải trỏ chuột mới biết số là biểu
 * đồ không dùng được bằng bàn phím.
 *
 * Quy cách hình (giữ nguyên, đừng "làm dày cho dễ thấy"):
 *  · khe 2px MÀU NỀN giữa hai hình cạnh nhau — không vẽ viền quanh hình để tách chúng,
 *    vì một nét viền là mực không mang dữ liệu;
 *  · cột dày tối đa 24px, đầu trên bo 4px, chân vuông trên đường đáy;
 *  · lưới và trục là nét 1px LIỀN, một bậc lệch khỏi nền — không bao giờ nét đứt, vì
 *    nét đứt đọc như "ngưỡng" hoặc "dự báo" trong khi nó chỉ là cái lưới;
 *  · chữ KHÔNG bao giờ mang màu dữ liệu; nhãn và số dùng màu chữ, còn danh tính do ô
 *    màu bên cạnh mang.
 *
 * Màu lấy từ nhóm `--color-bd-*` trong `globals.css`, đã đo bằng validator ở cả hai
 * giao diện — đọc chú thích ở đó trước khi đổi bất cứ màu nào.
 */
import { LinkCho } from '@/components/link-cho';

export interface MucDonut {
  nhan: string;
  so: number;
  /** Class Tailwind cho `fill`, ví dụ `fill-bd-hien`. */
  mau: string;
  /** Class Tailwind cho `bg`, dùng cho ô màu trong chú giải. */
  mauO: string;
  /** Bấm vào chú giải thì đi đâu. */
  href: string;
}

/** Điểm trên cung tròn, góc tính từ 12 giờ theo chiều kim đồng hồ. */
function diem(cx: number, cy: number, r: number, gocDo: number): [number, number] {
  const rad = ((gocDo - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Đường viền một múi vành khuyên, từ `tu` tới `den` độ. */
function cungVanhKhuyen(
  cx: number,
  cy: number,
  rNgoai: number,
  rTrong: number,
  tu: number,
  den: number
): string {
  const [x1, y1] = diem(cx, cy, rNgoai, tu);
  const [x2, y2] = diem(cx, cy, rNgoai, den);
  const [x3, y3] = diem(cx, cy, rTrong, den);
  const [x4, y4] = diem(cx, cy, rTrong, tu);
  const lon = den - tu > 180 ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${rNgoai} ${rNgoai} 0 ${lon} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rTrong} ${rTrong} 0 ${lon} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

/**
 * Donut phần-trên-tổng, kèm chú giải là một bảng số.
 *
 * Donut hợp ở đây vì bốn trạng thái là một PHÂN HOẠCH thật — mỗi game nằm đúng một
 * trạng thái và bốn số cộng lại bằng tổng — và vì câu hỏi người trực hỏi là "phần lớn
 * game đang ở đâu", một câu trả lời được bằng cách nhìn tỉ lệ. Nếu câu hỏi là "so
 * ba con số gần nhau" thì donut là hình sai, và chú giải bên cạnh mới là chỗ đọc.
 *
 * Bốn múi là ngưỡng trên: quá sáu múi thì các múi nhỏ mảnh tới mức không đọc được, và
 * chỗ đúng là một bảng.
 */
export function DonutTrangThai({
  muc,
  tong,
  nhanTong,
}: {
  muc: MucDonut[];
  tong: number;
  nhanTong: string;
}) {
  const KHE_DO = 2.2; // khe giữa hai múi, tính bằng ĐỘ — xấp xỉ 2px ở bán kính này
  const CX = 110;
  const CY = 110;
  const R_NGOAI = 102;
  const R_TRONG = 76; // vành dày 26px: đủ thấy, không thành khối màu

  /* Khe tính bằng ĐỘ nên bán kính lớn hơn thì cùng số độ ra khe RỘNG hơn trên màn
     hình. Vành to lên từ 84 sang 102 nên khe hạ từ 2.4 xuống 2.2 độ để bề rộng thật
     của nó vẫn quanh 2px — khe là chỗ tách hai múi, không phải một nét trang trí, nên
     nó phải giữ nguyên bề rộng khi hình đổi cỡ. */

  const coSo = muc.filter((m) => m.so > 0);

  /*
   * Một trạng thái duy nhất chiếm 100% thì vẽ VÒNG TRÒN ĐẦY, không vẽ cung.
   *
   * Một cung 360 độ có điểm đầu trùng điểm cuối, nên `A` không biết đi đường nào và
   * SVG vẽ ra... không gì cả: vành biến mất hoàn toàn. Đây là trạng thái THƯỜNG GẶP
   * NHẤT của trang này (một trang mới thì mọi game đều đang hiện), tức nếu không xử lý
   * thì biểu đồ trắng trơn đúng vào ngày bình thường nhất.
   */
  const motMuc = coSo.length === 1 ? coSo[0] : null;

  let goc = 0;
  const cung = coSo.map((m) => {
    const doDai = (m.so / tong) * 360;
    /* Khe chỉ cắt vào cung, không dồn các múi lại — nên tổng vẫn đúng 360 độ và không
       múi nào bị vẽ dài hơn tỉ lệ của nó. Múi quá mảnh thì thu khe lại thay vì để cung
       thành âm và mất hẳn khỏi hình. */
    const khe = Math.min(KHE_DO, doDai / 3);
    const d = cungVanhKhuyen(CX, CY, R_NGOAI, R_TRONG, goc + khe / 2, goc + doDai - khe / 2);
    goc += doDai;
    return { ...m, d, phanTram: (m.so / tong) * 100 };
  });

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <svg
        viewBox="0 0 220 220"
        className="h-56 w-56 shrink-0 sm:h-64 sm:w-64"
        role="img"
        aria-label={`${nhanTong}: ${muc.map((m) => `${m.nhan} ${m.so}`).join(', ')}`}
      >
        {motMuc ? (
          <circle
            cx={CX}
            cy={CY}
            r={(R_NGOAI + R_TRONG) / 2}
            fill="none"
            strokeWidth={R_NGOAI - R_TRONG}
            className={motMuc.mau.replace('fill-', 'stroke-')}
          >
            <title>{`${motMuc.nhan}: ${motMuc.so} (100%)`}</title>
          </circle>
        ) : (
          cung.map((c) => (
            <path key={c.nhan} d={c.d} className={c.mau}>
              <title>{`${c.nhan}: ${c.so} (${c.phanTram.toFixed(0)}%)`}</title>
            </path>
          ))
        )}
        {/*
          Số tổng nằm giữa vành. Đây là con số dẫn của cả hình, nên nó dùng chữ số
          THEO TỈ LỆ chứ không `tabular-nums`: ở cỡ lớn, chữ số đều bề ngang làm một
          số như 121 trông rời rạc. Chỉ cột số xếp thẳng hàng mới cần đều bề ngang.
        */}
        <text
          x={CX}
          y={CY - 4}
          textAnchor="middle"
          fontSize={38}
          className="fill-ink font-extrabold"
        >
          {tong}
        </text>
        <text x={CX} y={CY + 22} textAnchor="middle" fontSize={15} className="fill-ink-soft">
          {nhanTong}
        </text>
      </svg>

      {/*
        Chú giải LÀ bảng số, không phải bốn ô màu để đối chiếu bằng mắt. Nó mang cả
        nhãn chữ, số, và phần trăm — nên không giá trị nào chỉ đọc được bằng màu, và
        bảng màu tối (tách biệt mù màu 6.7, trong dải phải có mã hoá thứ hai) hợp lệ
        đúng nhờ khối này. Xoá nó là làm bảng màu tối không còn hợp lệ.
      */}
      <ul className="m-0 min-w-44 flex-1 list-none space-y-1.5 p-0">
        {muc.map((m) => (
          <li key={m.nhan}>
            <LinkCho
              href={m.href}
              className="flex items-baseline gap-2.5 rounded-field px-2 py-1 no-underline hover:bg-bg"
            >
              <span
                className={`mt-1.5 size-3 shrink-0 rounded-full ${m.mauO}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 text-ink">{m.nhan}</span>
              <span className="tabular-nums font-bold text-ink">{m.so}</span>
              <span className="w-11 text-right tabular-nums text-sm text-ink-soft">
                {tong === 0 ? '—' : `${((m.so / tong) * 100).toFixed(0)}%`}
              </span>
            </LinkCho>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface CotNgay {
  /** Nhãn ngắn cho trục, ví dụ `6/9`. */
  nhan: string;
  /** Nhãn đầy đủ cho tooltip. */
  nhanDay: string;
  so: number;
}

/**
 * Cột theo ngày. MỘT chuỗi số, nên không có chú giải — tiêu đề thẻ đã nói đang đếm gì.
 *
 * Nhãn số đặt CHỌN LỌC: chỉ ngày cao nhất và ngày cuối (hôm nay). Ghi số trên mọi cột
 * là mười bốn con số chen nhau ở cỡ chữ nhỏ, và rồi không ai đọc cái nào — trục và
 * bảng số mang phần còn lại.
 */
export function CotTheoNgay({ ngay, nhanBang }: { ngay: CotNgay[]; nhanBang: string }) {
  /*
   * `W` HẸP và bề rộng hiển thị bị chặn trên, vì `viewBox` scale CẢ CHỮ.
   *
   * Bản đầu dùng W=560 rồi để svg `w-full`: ở thẻ 350px trên điện thoại, tỉ lệ tụt về
   * 0.62 và nhãn ngày 0.8rem hiển thị ra ~8px — đo bằng ảnh chụp thật, gần như không
   * đọc được, trong khi ở màn rộng nó vừa. Một biểu đồ mà trục chỉ đọc được ở một khổ
   * màn hình là biểu đồ chỉ đúng một nửa.
   *
   * Nên: `W` đặt gần bề rộng NHỎ NHẤT mà nó phải sống (thẻ ~330px), và bọc ngoài
   * `max-w-[560px]` để tỉ lệ chỉ chạy trong khoảng 0.70–1.27. Trần ấy có lý do đo
   * được: để `max-w` ở 700px thì ở thẻ rộng nhãn trục ra ~20px — TO HƠN cả tiêu đề
   * thẻ, tức thứ bậc đọc bị đảo, cái phụ hét lớn hơn cái chính. Cỡ chữ khai bằng
   * `fontSize` theo user-space chứ không bằng class `rem`: đơn vị của viewBox mới là
   * đơn vị mà mọi thứ khác trong hình đang dùng — và nó phải TĂNG THEO khi `W` tăng,
   * không thì hình to lên mà trục lại nhỏ đi. Ngưỡng phải giữ: chữ hiển thị ≥9px ở
   * 390px, có phép kiểm ghim con số đó.
   *
   * `mx-auto` chứ không dàn trái: ở thẻ rộng hơn 520px thì phần dư chia đều hai bên,
   * còn dàn trái thì hình dính mép trái và để trống một dải bên phải — đọc như thiếu
   * mất một đoạn dữ liệu.
   */
  const W = 440;
  const H = 190;
  const DAY_TRUC = 26; // chỗ cho nhãn ngày, nằm TRONG viewBox chứ không tràn ra ngoài
  const CAO_PLOT = H - DAY_TRUC;
  const max = Math.max(1, ...ngay.map((d) => d.so));
  const khoang = W / ngay.length;
  const rongCot = Math.min(24, khoang - 7); // khe 7px giữa hai cột, và trần 24px
  const iMax = ngay.reduce((tot, d, i) => (d.so > ngay[tot].so ? i : tot), 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto h-auto w-full max-w-[560px]"
        role="img"
        aria-label={`${nhanBang}. Cao nhất ${ngay[iMax]?.so ?? 0} ngày ${ngay[iMax]?.nhanDay ?? ''}.`}
      >
        {/* Đường đáy: nét 1px LIỀN, một bậc lệch khỏi nền. Không có lưới ngang nào
            khác — mười bốn cột thấp thì một cái lưới chỉ thêm mực. */}
        <line
          x1="0"
          y1={CAO_PLOT}
          x2={W}
          y2={CAO_PLOT}
          className="stroke-border"
          strokeWidth="1"
        />
        {ngay.map((d, i) => {
          const cao = max === 0 ? 0 : (d.so / max) * (CAO_PLOT - 22);
          const x = i * khoang + (khoang - rongCot) / 2;
          const y = CAO_PLOT - cao;
          const nhanSo = i === iMax || i === ngay.length - 1;
          return (
            <g key={d.nhan}>
              {/*
                Vùng bắt chuột TRONG SUỐT phủ cả khoảng của ngày, vẽ TRƯỚC cột.
                Hai việc cùng lúc: đích trỏ chuột rộng bằng cả khoảng chứ không bằng
                bề ngang cột (một cột 1 game cao 20px là đích gần như không trỏ trúng),
                và ngày BẰNG KHÔNG cũng có tooltip — không có nó thì mười bốn ngày mà
                ba ngày trống là ba khoảng trắng không nói được gì.

                Bản đầu vẽ cho ngày 0 một vạch mỏng màu `border` sát đáy. Nhìn ảnh
                chụp thật thì nó làm ĐƯỜNG ĐÁY trông đứt khúc — dày ở chỗ có ngày
                trống, mảnh ở giữa — và một trục nhìn như nét đứt thì đọc thành
                "ngưỡng" hoặc "dự báo". Đường đáy liền đã nói đủ rằng trục có mặt.
              */}
              <rect
                x={i * khoang}
                y="0"
                width={khoang}
                height={CAO_PLOT}
                fill="transparent"
              >
                <title>{`${d.nhanDay}: ${d.so}`}</title>
              </rect>
              {d.so > 0 && (
                /* Đầu trên bo 4px, chân VUÔNG trên đường đáy: `rx` bo cả bốn góc nên
                   phải vẽ thêm một hình chữ nhật che nửa dưới. Bo cả chân thì cột như
                   trôi khỏi trục. */
                <>
                  <rect
                    x={x}
                    y={y}
                    width={rongCot}
                    height={Math.max(cao, 4)}
                    rx="4"
                    className="fill-bd-cot"
                  />
                  <rect
                    x={x}
                    y={CAO_PLOT - Math.min(4, Math.max(cao, 4))}
                    width={rongCot}
                    height={Math.min(4, Math.max(cao, 4))}
                    className="fill-bd-cot"
                  />
                </>
              )}
              {nhanSo && d.so > 0 && (
                <text
                  x={x + rongCot / 2}
                  y={y - 7}
                  textAnchor="middle"
                  fontSize={14}
                  className="fill-ink font-bold tabular-nums"
                >
                  {d.so}
                </text>
              )}
              {/* Nhãn ngày: chỉ ngày đầu, giữa và cuối. Mười bốn nhãn ở cỡ này thì
                  chúng chồng lên nhau và trục thành một dải xám. */}
              {(i === 0 || i === ngay.length - 1 || i === Math.floor(ngay.length / 2)) && (
                <text
                  x={x + rongCot / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={14}
                  className="fill-ink-soft tabular-nums"
                >
                  {d.nhan}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Bảng số: mọi giá trị phải đọc được mà không cần trỏ chuột. Đóng sẵn để không
          chiếm chỗ, nhưng có mặt — tooltip là thứ thêm vào, không phải cửa duy nhất. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-ink-soft">Xem số theo ngày</summary>
        <table className="mt-2 w-full border-collapse text-sm">
          <caption className="sr-only">{nhanBang}</caption>
          <tbody>
            {ngay.map((d) => (
              <tr key={d.nhan} className="border-b border-border last:border-0">
                <th scope="row" className="py-1 text-left font-normal text-ink-soft">
                  {d.nhanDay}
                </th>
                <td className="py-1 text-right tabular-nums font-bold text-ink">{d.so}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
