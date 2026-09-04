/**
 * Đo tương phản của bảng màu, theo WCAG 2.1, cho CẢ hai giao diện.
 *
 * Vì sao cần một script riêng thay vì tin mắt mình: tương phản là con số, không phải
 * cảm giác. Một màu chữ xám nhạt trên nền trắng nhìn "vẫn đọc được" trên màn hình
 * MacBook trong phòng sáng, rồi thành vô hình trên máy tính bảng cũ của bé ngoài
 * hiên. Mắt của người viết code không phải mắt của người dùng.
 *
 * Đọc giá trị THẲNG từ `globals.css` chứ không chép lại vào đây: chép là sớm muộn hai
 * bên lệch, và lúc đó script sẽ báo xanh cho một bảng màu không còn tồn tại.
 *
 * Ngưỡng dùng ở đây CAO HƠN mức tối thiểu của WCAG AA (4.5:1) cho chữ thường, vì
 * người đọc là trẻ em đang học đọc: chúng chưa đoán được từ theo hình dạng như người
 * lớn, nên phải nhìn rõ từng chữ.
 *
 * Chạy:
 *   node infra/contrast-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const CSS = path.join(import.meta.dirname, '..', 'apps', 'web', 'src', 'app', 'globals.css');
const css = fs.readFileSync(CSS, 'utf8');

/** Moi mọi `--ten: #hex;` trong file. Đủ vì bảng màu chỉ viết bằng hex. */
function docToken() {
  const out = new Map();
  for (const m of css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out.set(m[1], m[2]);
  }
  return out;
}

const token = docToken();

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** Độ sáng tương đối theo WCAG: tuyến tính hoá sRGB rồi trộn theo hệ số cảm nhận. */
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Trộn màu có alpha lên nền — cần cho những chỗ dùng `text-chrome-ink/80`. */
function over(fg, bg, alpha) {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
}

function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Bảng SÁNG dùng token gốc; bảng TỐI dùng `--toi-*` nếu có, không thì rơi về token
 * gốc (đúng như CSS: khối tối chỉ ghi đè một phần).
 */
function mau(ten, toi) {
  const hex = toi ? (token.get(`--toi-${ten}`) ?? token.get(`--color-${ten}`)) : token.get(`--color-${ten}`);
  if (!hex) throw new Error(`Không thấy token cho "${ten}"`);
  return hexToRgb(hex);
}

/*
 * Danh sách cặp màu THẬT SỰ xuất hiện trên giao diện.
 *
 * `min` khác nhau theo vai, không phải một con số cho tất cả:
 *  - 7.0 cho chữ nội dung: đây là mức AAA của WCAG. Trẻ đang học đọc thì phải nhìn
 *    rõ từng chữ chứ không đoán được từ theo hình dạng.
 *  - 4.5 cho chữ phụ và chữ to (nhãn, gợi ý, chữ trên nút cỡ lớn).
 *  - 3.0 cho thứ không phải chữ: viền ô nhập, viền focus. WCAG 1.4.11.
 */
const CAP = [
  { ten: 'Chữ chính trên nền trang', fg: 'ink', bg: 'bg', min: 7 },
  { ten: 'Chữ chính trên thẻ/khung', fg: 'ink', bg: 'surface', min: 7 },
  { ten: 'Chữ phụ trên nền trang', fg: 'ink-soft', bg: 'bg', min: 4.5 },
  { ten: 'Chữ phụ trên thẻ/khung', fg: 'ink-soft', bg: 'surface', min: 4.5 },
  /* NĂM TÔNG NỀN THẺ GAME. Tiêu đề game và tên bé nằm thẳng trên nền này, nên mỗi
     tông phải qua cả hai ngưỡng — và phải qua ở CẢ HAI giao diện, vì tông thẻ có bản
     tối riêng. Đây là 10 phép đo, và chúng tồn tại để không ai đổi một tông cho "đẹp
     hơn" rồi vô tình đẩy chữ xuống dưới ngưỡng đọc được. */
  { ten: 'Tiêu đề game trên thẻ tông 1', fg: 'ink', bg: 'the-1', min: 7 },
  { ten: 'Tiêu đề game trên thẻ tông 2', fg: 'ink', bg: 'the-2', min: 7 },
  { ten: 'Tiêu đề game trên thẻ tông 3', fg: 'ink', bg: 'the-3', min: 7 },
  { ten: 'Tiêu đề game trên thẻ tông 4', fg: 'ink', bg: 'the-4', min: 7 },
  { ten: 'Tiêu đề game trên thẻ tông 5', fg: 'ink', bg: 'the-5', min: 7 },
  { ten: 'Tên bé trên thẻ tông 1', fg: 'ink-soft', bg: 'the-1', min: 4.5 },
  { ten: 'Tên bé trên thẻ tông 2', fg: 'ink-soft', bg: 'the-2', min: 4.5 },
  { ten: 'Tên bé trên thẻ tông 3', fg: 'ink-soft', bg: 'the-3', min: 4.5 },
  { ten: 'Tên bé trên thẻ tông 4', fg: 'ink-soft', bg: 'the-4', min: 4.5 },
  { ten: 'Tên bé trên thẻ tông 5', fg: 'ink-soft', bg: 'the-5', min: 4.5 },
  { ten: 'Chữ placeholder trong ô nhập', fg: 'ink-faint', bg: 'surface', min: 4.5 },
  { ten: 'Chữ trên nút cam (nút chính)', fg: 'chrome', bg: 'accent', min: 4.5 },
  /* Dấu hiệu logo tô bằng dải chuyển sắc `accent` → `accent-dark`, nên hình nút chơi
     bên trong nó nằm một phần trên chặng TỐI. Chặng tối mới là trường hợp xấu cho
     một hình màu tối, không phải chặng sáng. */
  { ten: 'Hình tối trên chặng tối của dải cam', fg: 'chrome', bg: 'accent-dark', min: 4.5 },
  /* Nhãn loại game trên thẻ game: chữ cam trên viên thuốc nền tối. Đây là chỗ DUY
     NHẤT được dùng `accent` làm màu chữ — trên nền tối nó đạt ngưỡng, còn trên nền
     sáng thì chỉ 2.18:1, nên chỗ khác phải dùng `accent-text`. */
  { ten: 'Chữ cam trên viên thuốc nền tối', fg: 'accent', bg: 'chrome', min: 4.5 },
  { ten: 'Chữ trên thanh điều hướng', fg: 'chrome-ink', bg: 'chrome', min: 7 },
  /* Nền nhấc lên: vệt sáng ở góc thanh điều hướng, và nền lúc trỏ vào một mục.
     Chữ vẫn nằm trên nó nên vẫn phải đo — nền sáng hơn thì chữ sáng tương phản
     KÉM đi, tức đây mới là trường hợp xấu nhất của thanh điều hướng. */
  { ten: 'Chữ trên nền nhấc của thanh điều hướng', fg: 'chrome-ink', bg: 'chrome-lift', min: 7 },
  /* Nền thanh nav là một dải chuyển sắc, nên phải đo ở CHẶNG SÁNG NHẤT chứ không
     phải ở `chrome`. Đo chặng tối thì cả dải coi như không được kiểm — và chỗ sáng
     nhất lại đúng là chỗ đặt logo với tên trang. */
  { ten: 'Chữ trên chặng sáng nhất của nền nav', fg: 'chrome-ink', bg: 'nav-3', min: 7 },
  { ten: 'Chữ trên vệt sáng quanh logo', fg: 'chrome-ink', bg: 'nav-glow', min: 7 },
  { ten: 'Link cam trên nền trang', fg: 'accent-text', bg: 'bg', min: 4.5 },
  { ten: 'Link cam trên thẻ/khung', fg: 'accent-text', bg: 'surface', min: 4.5 },
  /*
   * HAI ĐẦU DẢI NỀN Ở MÀN HÌNH HẸP (`--color-bg-troi`, `--color-bg-dat`).
   *
   * Dưới 1280px nền trang là một dải chuyển sắc, nên `bg` không còn là màu duy nhất
   * nằm dưới chữ — đo mỗi `bg` thì hai đầu dải không được kiểm gì cả.
   *
   * Cặp CHẶN ở giao diện sáng là `accent-text`, không phải `ink`: nền đậm thêm thì
   * chữ cam đậm tụt trước, hiện 4.95 so với ngưỡng 4.5, trong khi `ink` còn 14.7. Ai
   * nhìn con số của `ink` rồi kết luận "còn nhiều chỗ để đậm thêm" là nhìn sai cột.
   *
   * KHÔNG đo `ink-faint` ở đây, và đó là một lựa chọn: nó chỉ hơn ngưỡng 0.09 trên
   * nền cũ nên nó loại sạch mọi sắc màu đáng nhìn, mà nó lại đo một thứ không có trên
   * giao diện — `ink-faint` dùng đúng một chỗ, `placeholder:text-ink-faint` trong
   * `field.tsx`, và ô nhập có nền `surface`. Danh sách này là "cặp THẬT SỰ xuất hiện";
   * thêm một cặp không có thật thì không được thêm hàng rào nào, chỉ mất chỗ để làm.
   */
  { ten: 'Chữ chính trên chặng trời của nền', fg: 'ink', bg: 'bg-troi', min: 7 },
  { ten: 'Chữ phụ trên chặng trời của nền', fg: 'ink-soft', bg: 'bg-troi', min: 4.5 },
  { ten: 'Link cam trên chặng trời của nền', fg: 'accent-text', bg: 'bg-troi', min: 4.5 },
  { ten: 'Chữ chính trên chặng đất của nền', fg: 'ink', bg: 'bg-dat', min: 7 },
  { ten: 'Chữ phụ trên chặng đất của nền', fg: 'ink-soft', bg: 'bg-dat', min: 4.5 },
  { ten: 'Link cam trên chặng đất của nền', fg: 'accent-text', bg: 'bg-dat', min: 4.5 },
  /*
   * THẺ CÒN PHẢI NỔI LÊN KHỎI NỀN — hai cặp không phải chữ, ngưỡng 1.05 là của riêng
   * dự án.
   *
   * Đây là cặp CHẶN của giao diện tối, và nó chặn theo chiều ngược với mọi cặp khác
   * trong file: ở đó nền đậm thêm thì chữ càng dễ đọc, nên nếu chỉ đo chữ thì bầu
   * trời đêm được phép sáng lên bao nhiêu cũng xanh. Mà `--toi-surface` chỉ hơn
   * `--toi-bg` 1.107:1 — nền sáng lên một chút là thẻ game phẳng bằng nền, đúng ở đầu
   * trang nơi có nhiều thẻ nhất. Đo được hiện tại: trời 1.119, đất 1.106.
   */
  { ten: 'Thẻ nổi trên chặng trời của nền', fg: 'surface', bg: 'bg-troi', min: 1.05 },
  { ten: 'Thẻ nổi trên chặng đất của nền', fg: 'surface', bg: 'bg-dat', min: 1.05 },
  { ten: 'Chữ lỗi trong hộp lỗi', fg: 'danger', bg: 'danger-bg', min: 4.5 },
  { ten: 'Chữ trên nút danger lúc hover', fg: 'surface', bg: 'danger', min: 4.5 },
  { ten: 'Chữ cảnh báo trong hộp cảnh báo', fg: 'warn-ink', bg: 'warn-bg', min: 4.5 },
  /*
   * Viền hộp cảnh báo. Ngưỡng 2.5 là của riêng dự án, không phải WCAG — viền hộp
   * không phải thành phần cần nhận diện. Nhưng có nó vì cặp này đã từng tụt xuống
   * 1.25:1 (sáng) và 1.77:1 (tối) mà không gì báo: hộp vẫn "có viền" trong mã
   * nguồn, chỉ là mắt không thấy đường nào, và hộp đọc ra một vũng màu loang.
   */
  { ten: 'Viền hộp cảnh báo trên nền hộp', fg: 'warn-border', bg: 'warn-bg', min: 2.5 },
  { ten: 'Viền hộp lỗi trên nền hộp', fg: 'danger-border', bg: 'danger-bg', min: 2.5 },
  /* Cùng token đó là viền nút danger, và nút là CONTROL — chỗ duy nhất trong nhóm
     viền này mà 3:1 là ngưỡng WCAG thật, không phải ngưỡng tự đặt. Đo trên nền
     trang vì nút danger đứng trên nền trang, không phải trong hộp lỗi. */
  { ten: 'Viền nút danger trên nền trang', fg: 'danger-border', bg: 'bg', min: 3 },
  { ten: 'Viền ô nhập trên thẻ/khung', fg: 'field-border', bg: 'surface', min: 3 },
  { ten: 'Viền ô nhập trên nền trang', fg: 'field-border', bg: 'bg', min: 3 },
  { ten: 'Viền focus trên nền trang', fg: 'focus', bg: 'bg', min: 3 },
  { ten: 'Viền focus trên thẻ/khung', fg: 'focus', bg: 'surface', min: 3 },
  /*
   * Viền TRANG TRÍ (mép thẻ). WCAG không đòi gì ở đây vì nó không phải thành phần
   * cần nhận diện — ngưỡng 1.3 dưới đây là của riêng dự án, chỉ để cạnh thẻ còn
   * nhận ra được: nền thẻ chỉ hơn nền trang 1.05:1, nên nếu cả viền cũng mờ thì
   * trang thành một mảng phẳng không thấy đâu là một thẻ.
   */
  { ten: 'Viền thẻ trang trí trên nền trang', fg: 'border', bg: 'bg', min: 1.3 },
];

/** Chữ mờ trên thanh nav (`text-chrome-ink/80`) — phải trộn alpha mới đo được. */
const CAP_ALPHA = [
  { ten: 'Chữ mờ 80% trên thanh điều hướng', fg: 'chrome-ink', bg: 'chrome', alpha: 0.8, min: 4.5 },
  { ten: 'Chữ mờ 70% trên thanh điều hướng', fg: 'chrome-ink', bg: 'chrome', alpha: 0.7, min: 4.5 },
  /* Cùng hai mức mờ đó nhưng trên nền đã nhấc lên — đây là lúc trỏ chuột vào mục,
     và cũng là nền tối nhất mà chữ mờ phải sống trên đó. */
  {
    ten: 'Chữ mờ 80% trên nền nhấc của thanh điều hướng',
    fg: 'chrome-ink',
    bg: 'chrome-lift',
    alpha: 0.8,
    min: 4.5,
  },
  {
    ten: 'Chữ mờ 70% trên nền nhấc của thanh điều hướng',
    fg: 'chrome-ink',
    bg: 'chrome-lift',
    alpha: 0.7,
    min: 4.5,
  },
  /* Và trên vệt sáng quanh logo — nền sáng nhất của cả thanh. Mục "Bố mẹ" (chữ mờ
     80%) trên màn rộng nằm ngoài vùng vệt sáng, nhưng vệt loang tới đâu thì phụ
     thuộc bề rộng màn hình, nên cứ đo như thể nó chạm tới. */
  {
    ten: 'Chữ mờ 80% trên vệt sáng quanh logo',
    fg: 'chrome-ink',
    bg: 'nav-glow',
    alpha: 0.8,
    min: 4.5,
  },
  {
    ten: 'Chữ mờ 70% trên vệt sáng quanh logo',
    fg: 'chrome-ink',
    bg: 'nav-glow',
    alpha: 0.7,
    min: 4.5,
  },
];

let hong = 0;
for (const [nhan, toi] of [
  ['SÁNG', false],
  ['TỐI', true],
]) {
  console.log(`\n=== Giao diện ${nhan} ===`);
  for (const c of CAP) {
    const r = ratio(mau(c.fg, toi), mau(c.bg, toi));
    const ok = r >= c.min;
    if (!ok) hong++;
    console.log(`${ok ? '✅' : '❌'} ${r.toFixed(2)}:1 (cần ${c.min}) — ${c.ten}`);
  }
  for (const c of CAP_ALPHA) {
    const bg = mau(c.bg, toi);
    const r = ratio(over(mau(c.fg, toi), bg, c.alpha), bg);
    const ok = r >= c.min;
    if (!ok) hong++;
    console.log(`${ok ? '✅' : '❌'} ${r.toFixed(2)}:1 (cần ${c.min}) — ${c.ten}`);
  }
}

console.log(hong === 0 ? '\nTất cả cặp màu đạt ngưỡng.' : `\n${hong} cặp màu KHÔNG đạt.`);
process.exit(hong === 0 ? 0 : 1);
