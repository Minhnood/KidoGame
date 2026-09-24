import { KHUNG_THE } from './card';


/**
 * Khung chờ lúc chuyển trang.
 *
 * ═══ VÌ SAO CẦN, ĐO BẰNG SỐ ═══
 *
 * Trước khi có file này, trang không có một file `loading.tsx` nào. Đo trên production
 * với prefetch bị chặn — tức đứa trẻ vừa cuộn tới đã bấm, chưa kịp tải sẵn:
 *
 *     mạng nhanh        987 ms màn hình đứng im
 *     3G chậm         2.776 ms màn hình đứng im
 *
 * Gần ba giây không một pixel nào đổi sau một cú chạm. Đứa trẻ bấm lại — và đó đúng
 * là cách nó học được rằng trang này hỏng. Cùng một họ lỗi với cái nút render đúng mà
 * không làm gì ở `/admin/loi`, chỉ khác là ở cấp cả trang.
 *
 * ═══ VÌ SAO LÀ KHUNG XÁM CHỨ KHÔNG PHẢI MỘT VÒNG XOAY GIỮA MÀN HÌNH ═══
 *
 * Khung xám dựng đúng hình hài trang sắp tới: tiêu đề ở đâu, khung game to cỡ nào,
 * hàng nút nằm chỗ nào. Nên lúc nội dung thật tới, nó điền vào chỗ trống chứ không
 * đẩy mọi thứ nhảy một cái — mà cú nhảy đó là thứ làm người ta bấm nhầm.
 *
 * Một vòng xoay giữa màn hình thì không nói được gì về trang sắp tới, và khi nó biến
 * mất thì cả trang xuất hiện cùng lúc, tức vẫn còn nguyên cú nhảy.
 *
 * ═══ CHỮ, KHÔNG CHỈ HÌNH ═══
 *
 * `role="status"` mang một câu thật. Một màn hình toàn ô xám thì trình đọc màn hình
 * không có gì để đọc — người dùng nó sẽ nghe thấy đúng sự im lặng mà khung này sinh
 * ra để xoá đi.
 */

/** Một ô chờ. `w`/`h` là lớp Tailwind, vì mỗi chỗ một hình dạng khác nhau. */
export function O({ className }: { className: string }) {
  return <div aria-hidden="true" className={`kg-o-cho ${className}`} />;
}

/**
 * Ô chờ nằm ĐÈ LÊN một ô chờ khác — viên thuốc, nhãn, nút chơi trên ảnh thẻ game.
 *
 * Tông riêng vì cùng một màu đặt lên nhau thì không có mép nào: dùng `O` ở đây là
 * bốn chi tiết ấy có trong DOM mà không ai nhìn thấy, tức vẫn là cái thẻ hai gạch.
 */
export function ONet({ className }: { className: string }) {
  return <div aria-hidden="true" className={`kg-o-net ${className}`} />;
}

/** Một viên thuốc bo tròn — nút, chip lọc, nhãn. Cao 48px đúng như `min-h-touch`. */
export function Vien({ className }: { className: string }) {
  return <O className={`min-h-touch rounded-full ${className}`} />;
}

/**
 * Phần đầu trang: tiêu đề + nét gạch + dòng phụ, dựng bằng ô xám.
 *
 * DỰNG THEO ĐÚNG CẤU TRÚC CỦA `PageTitle`, từng lớp một — `mb-5 mt-7` ở vỏ, `h-9` cho
 * `text-3xl` (dòng cao 36px), `mt-1.5 h-2.5 w-16` cho nét gạch tay, `mt-2 h-6` cho
 * dòng phụ.
 *
 * Bản đầu ước lượng bằng mấy con số tròn (`pt-8`, hai ô) và BỎ QUA nét gạch. Đo được:
 * khung game tụt **12px** đúng lúc nội dung thật tới. Không ai thấy 12px là xấu, nhưng
 * cả khung chờ này sinh ra để không có cú xê dịch nào — nên chép cấu trúc thật rẻ hơn
 * là canh cho gần đúng, và nó còn tự đi theo khi ai đó sửa `PageTitle`.
 */
export function DauTrangCho({ canhGiua = false }: { canhGiua?: boolean }) {
  const giua = canhGiua ? 'mx-auto' : '';
  return (
    <div className={`mb-5 mt-7 ${canhGiua ? 'text-center' : ''}`}>
      <O className={`h-9 w-64 max-w-full ${giua}`} />
      <O className={`mt-1.5 h-2.5 w-16 ${giua}`} />
      <O className={`mt-2 h-6 w-48 max-w-full ${giua}`} />
    </div>
  );
}

/**
 * Khung chờ của MỘT thẻ game — dựng lại ĐÚNG thẻ thật, chỉ bỏ màu và chữ.
 *
 * Bản đầu chỉ có một ô ảnh và hai gạch. Nhìn cạnh thẻ thật thì nó không phải "thẻ
 * chưa có màu", nó là một thứ khác: thẻ thật còn bốn chi tiết nổi trên tấm ảnh —
 * hai viên thuốc số ở góc trên trái, nhãn loại ở góc dưới trái, nút chơi tròn ở góc
 * dưới phải — và chính bốn cái đó làm nó ra hình một thẻ game. Thiếu chúng thì lúc
 * ảnh thật tới, bốn thứ hiện ra cùng lúc từ hư không.
 *
 * Mọi lớp đặt chỗ chép thẳng từ `GameCard`: `p-2`, `rounded-xl` quanh ảnh, `aspect-4/3`,
 * `left-2 top-2`, `bottom-2 right-2`, `size-9`, `px-1.5 pb-1 pt-2.5`. Chép chứ không
 * canh cho gần đúng — canh gần đúng là cách sinh ra cú xê dịch 12px đã phải sửa ở
 * phần đầu trang.
 *
 * NỀN THẺ LÀ `surface`, KHÔNG phải một trong năm tông thẻ. Fen chốt: khung chờ là
 * trang đã tải xong nhưng **chưa có màu**. Tông thẻ chọn theo mã game, mà lúc này ta
 * còn chưa biết có game nào — đoán một tông rồi đổi sang tông khác là một cú nhấp
 * màu ngay giữa lưới.
 */
export function TheGameCho() {
  return (
    /* `data-testid` để phép kiểm bám được: từ 23/9 ô chờ này không chỉ hiện lúc mở
       trang nữa, nó còn hiện mỗi lần đổi bộ lọc hay sang trang (ranh giới `Suspense`
       trong `(trang-chu)/page.tsx`), và "có hiện không" là thứ phải đo bằng cách bấm
       thật chứ không đọc được từ mã nguồn. */
    <div className={`${KHUNG_THE} bg-surface p-2`} data-testid="the-game-cho">
      <div className="relative overflow-hidden rounded-xl">
        <O className="aspect-4/3 w-full rounded-xl" />

        {/* Hai viên thuốc số: lượt chơi và số icon. */}
        <span className="absolute left-2 top-2 flex items-center gap-1">
          <ONet className="h-5 w-11 rounded-full" />
          <ONet className="h-5 w-9 rounded-full" />
        </span>

        {/* Nhãn loại game ở góc dưới trái. */}
        <ONet className="absolute bottom-2 left-2 h-5 w-16 rounded-full" />

        {/* Nút chơi tròn ở góc dưới phải — `size-9` đúng như thẻ thật. */}
        <ONet className="absolute bottom-2 right-2 size-9 rounded-full" />
      </div>

      {/*
        KHỐI CHỮ: mỗi gạch nằm TRONG một hộp cao đúng bằng hộp dòng của chữ thật, chứ
        không phải một gạch với `margin` canh bằng mắt.
        Đo trên trang thật: tên game `text-lg leading-snug` cho hộp dòng 25px, tên bé
        `text-sm` cho 20px, cả khối `px-1.5 pb-1 pt-2.5` cao 61px với tên một dòng.
        Bản trước canh bằng `mt-*` và ra 74px thay vì 86px của thẻ hai dòng — thẻ chờ
        thấp hơn thẻ thật 19px.
        HAI DÒNG tên game, cố ý: ô lưới bị kéo cao bằng thẻ CAO NHẤT trong hàng, mà
        chỉ cần một tên game dài là cả hàng thành hai dòng. Dựng một dòng thì khung
        chờ thấp hơn hàng thật gần như mọi lúc.
      */}
      <div className="px-1.5 pb-1 pt-2.5">
        <div className="mb-0.5">
          <div className="flex h-6.25 items-center">
            <O className="h-4 w-full" />
          </div>
          <div className="flex h-6.25 items-center">
            <O className="h-4 w-3/5" />
          </div>
        </div>
        <div className="flex h-5 items-center">
          <O className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

/**
 * Lưới thẻ game đang chờ.
 *
 * SÁU thẻ, không phải hai chục: khung chờ chỉ cần lấp đủ một màn hình đầu. Dựng đủ
 * số thẻ thật là vẽ ra một lời hứa mà ta chưa biết có giữ được không — trang chủ có
 * thể chỉ có một game, và lúc đó hai chục ô xám co lại còn một là một cú tụt dài hơn
 * hẳn cái nó định che.
 */
export function LuoiGameCho({ so = 6 }: { so?: number }) {
  return (
    /* Đúng lớp lưới của trang chủ, chép nguyên: lệch một bước ngắt là lúc thẻ thật
       tới, số cột đổi và cả lưới sắp lại. */
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: so }, (_, i) => (
        <TheGameCho key={i} />
      ))}
    </div>
  );
}

/**
 * Vỏ ngoài dùng chung cho mọi `loading.tsx`.
 *
 * `role="status"` + `aria-live="polite"`: polite chứ không phải assertive. Một câu
 * "đang tải" cắt ngang thứ người dùng đang nghe dở là thô, và nó lặp lại mỗi lần
 * chuyển trang.
 */
export function KhungCho({ cauNoi, children }: { cauNoi: string; children: React.ReactNode }) {
  return (
    /*
     * KHÔNG bọc `<Wrap>` ở đây, dù mọi trang đều nằm trong một cái.
     *
     * `layout.tsx` đã bọc sẵn (`{laKhuQuanTri ? children : <Wrap>{children}</Wrap>}`),
     * và `loading.tsx` là con của đúng cái layout đó — nên thêm một `Wrap` nữa là
     * cộng thêm `px-5` lần thứ hai ở mỗi bên.
     *
     * Đo được khi còn bọc: thẻ game chờ rộng 224px cạnh thẻ thật 234px, tức khung chờ
     * hẹp hơn trang nó đang giả vờ là. Loại lệch này không bao giờ tự lộ ra — khung
     * chờ nhìn vẫn cân đối, chỉ là cân đối trong một bề rộng khác.
     */
    <div role="status" aria-live="polite" data-testid="dang-tai">
      {/* Câu này CHỈ cho trình đọc màn hình. Hiện nó ra màn hình là thêm một dòng
          chữ sẽ biến mất sau một giây — tức thêm đúng một cú nhảy nữa. */}
      <span className="sr-only">{cauNoi}</span>
      {children}
    </div>
  );
}
