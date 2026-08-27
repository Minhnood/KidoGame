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
  { ten: 'Chữ placeholder trong ô nhập', fg: 'ink-faint', bg: 'surface', min: 4.5 },
  { ten: 'Chữ trên nút cam (nút chính)', fg: 'chrome', bg: 'accent', min: 4.5 },
  { ten: 'Chữ trên thanh điều hướng', fg: 'chrome-ink', bg: 'chrome', min: 7 },
  { ten: 'Link cam trên nền trang', fg: 'accent-text', bg: 'bg', min: 4.5 },
  { ten: 'Link cam trên thẻ/khung', fg: 'accent-text', bg: 'surface', min: 4.5 },
  { ten: 'Chữ lỗi trong hộp lỗi', fg: 'danger', bg: 'danger-bg', min: 4.5 },
  { ten: 'Chữ trên nút danger lúc hover', fg: 'surface', bg: 'danger', min: 4.5 },
  { ten: 'Chữ cảnh báo trong hộp cảnh báo', fg: 'warn-ink', bg: 'warn-bg', min: 4.5 },
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
