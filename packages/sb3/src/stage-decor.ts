/**
 * Trang trí hai viền trống hai bên stage, nhúng vào trang game đã đóng gói.
 *
 * VÌ SAO PHẢI NẰM BÊN TRONG TRANG GAME: hai viền ấy là nền `body` của chính trang
 * đã đóng gói lộ ra. Đo được ở màn 1920×1080 khi bấm nút toàn màn hình của packager:
 * `.sc-layers` (stage) nằm ở (272, 48) cỡ 1376×1032, còn `#app`, `.sc-root`,
 * `.sc-layers` trong suốt hết — tức 272px mỗi bên là `body` chứ không phải phần tử
 * nào khác. Trang cha khác origin nên không chạm được vào đó; và lúc packager vào
 * toàn màn hình thì DOM của trang cha còn không có mặt trên màn hình.
 *
 * VÌ SAO KHÔNG CHÈN LÚC PHỤC VỤ: tên file LÀ hash nội dung và header là
 * `cache-control: immutable`. Chèn thêm CSS lúc serve là phá đúng hợp đồng đó, mà
 * production lại là Caddy phục vụ tĩnh — không có chỗ nào chèn được. Đây cũng là lý
 * do game đã đóng gói TRƯỚC thay đổi này vẫn giữ hai viền trơn: phải đóng gói lại
 * mới có.
 *
 * BA RÀNG BUỘC, cả ba đều để không đụng vào lúc chơi:
 *
 * 1. KHÔNG BAO GIỜ CHE STAGE. Bề rộng viền do JS đo bằng `getBoundingClientRect`
 *    của chính stage rồi đặt vào biến CSS, không tính bằng công thức. Công thức thì
 *    phải viết cứng chiều cao thanh điều khiển (đo được 48px) — mà chiều cao ấy là
 *    của packager, nó đổi một bản là hình vẽ đè lên mặt game.
 * 2. KHÔNG HOẠT ẢNH. Có chuyển động ngay cạnh vùng chơi là kéo mắt khỏi game, và
 *    trang này không có khối `prefers-reduced-motion` nào để mà nương vào.
 * 3. `pointer-events: none` và không phần tử thật nào — chỉ `::before`/`::after`.
 *    Trẻ đang chơi thì mọi cú chạm phải tới được game.
 *
 * Vẽ hay không do JS quyết định bằng HÌNH HỌC, không theo class `.is-fullscreen`:
 * nút "Chơi to hơn" của app cũng tạo ra đúng hai viền ấy mà không có class đó, còn
 * khung nhúng 4:3 bình thường thì không có chỗ nào trống nên tự khắc không vẽ.
 *
 * HAI KHỔ TRANH, KHÔNG PHÓNG TO MỘT KHỔ. Viền rộng thì vẽ NHIỀU hơn chứ không vẽ TO
 * hơn — cùng luật với tranh hai bên lề của site. Cho hình co theo bề rộng viền thì ở
 * 1920 chiếc lá to gấp đôi ở 1440, và lá to bằng nhân vật trong game là thứ mắt bắt
 * trước cả game. Nên: khổ hẹp một dây leo, khổ rộng thêm ba nhánh dài chìa vào, lá
 * giữ nguyên cỡ ở cả hai khổ.
 *
 * LÁ ĐẶT BẰNG TÍNH, KHÔNG ĐẶT TAY. Bên `site-decor.tsx` phải liệt kê toạ độ từng
 * chiếc lá vì trang ấy dựng ở server rồi hydrate — không có DOM để mà
 * `getPointAtLength`. File này khác: nó sinh chuỗi SVG trong Node lúc đóng gói, nên
 * tính thẳng điểm trên đường Bézier được. Nhờ thế mỗi chiếc lá nằm ĐÚNG trên cành và
 * xoay theo ĐÚNG hướng tiếp tuyến chỗ nó dính — bản đặt tay đầu tiên cho ra mấy cái
 * nhánh thẳng có lá xếp hàng đều tăm tắp, đọc ra là xương cá chứ không phải cành.
 */

/** Bảng màu giao diện TỐI (`--toi-decor-*` trong globals.css). */
const MAU = {
  than: '#4a381f',
  thanSang: '#6b5133',
  la: '#2f5c3c',
  laDam: '#1e3b28',
  laSang: '#3f7350',
  hoaHong: '#6b3d51',
  hoaVang: '#7a6634',
  tam: '#d8d3c0',
} as const;

/*
 * Nền trang game là `#1b1b32` đặc — cùng họ với giao diện tối của app, nên dùng
 * thẳng bảng tối. Bảng sáng đặt lên đây thì mấy chiếc lá nhảy hẳn ra khỏi nền và
 * thành thứ sáng nhất trên màn hình, sáng hơn cả game.
 */
const TONG_LA = [MAU.la, MAU.laSang, MAU.laDam] as const;

/** Một đoạn Bézier bậc ba: [x0,y0, c1x,c1y, c2x,c2y, x1,y1]. */
type Cung = readonly [number, number, number, number, number, number, number, number];

function diem(c: Cung, t: number): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return [a * c[0] + b * c[2] + d * c[4] + e * c[6], a * c[1] + b * c[3] + d * c[5] + e * c[7]];
}

/** Hướng tiếp tuyến ở tham số t, độ. */
function huong(c: Cung, t: number): number {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const d = 3 * t * t;
  const dx = a * (c[2] - c[0]) + b * (c[4] - c[2]) + d * (c[6] - c[4]);
  const dy = a * (c[3] - c[1]) + b * (c[5] - c[3]) + d * (c[7] - c[5]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Cắt một đoạn Bézier lấy phần từ t đến 1 (de Casteljau).
 *
 * Dùng để vẽ NGỌN CÀNH THON: vẽ cả cành một nét dày, rồi vẽ đè phần ngoài bằng nét
 * mảnh hơn. Nét dày đều từ gốc tới ngọn thì đầu cành cụt bằng gốc, và một cái cành
 * cụt chĩa vào giữa màn hình đọc ra là cái que.
 */
function cat(c: Cung, t: number): Cung {
  const lerp = (ax: number, ay: number, bx: number, by: number): [number, number] => [
    ax + (bx - ax) * t,
    ay + (by - ay) * t,
  ];
  const p01 = lerp(c[0], c[1], c[2], c[3]);
  const p12 = lerp(c[2], c[3], c[4], c[5]);
  const p23 = lerp(c[4], c[5], c[6], c[7]);
  const q0 = lerp(p01[0], p01[1], p12[0], p12[1]);
  const q1 = lerp(p12[0], p12[1], p23[0], p23[1]);
  const r = lerp(q0[0], q0[1], q1[0], q1[1]);
  return [r[0], r[1], q1[0], q1[1], p23[0], p23[1], c[6], c[7]];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function d(c: Cung): string {
  return `M${r1(c[0])} ${r1(c[1])}C${r1(c[2])} ${r1(c[3])} ${r1(c[4])} ${r1(c[5])} ${r1(c[6])} ${r1(c[7])}`;
}

function net(c: Cung, w: number, mau: string): string {
  return `<path d="${d(c)}" stroke="${mau}" stroke-width="${r1(w)}" stroke-linecap="round" fill="none"/>`;
}

/** Cành có ngọn thon: ba nét chồng nhau, mảnh dần, cùng nằm trên một đường cong. */
function canh(c: Cung, w: number, mau = MAU.thanSang): string {
  return net(c, w, mau) + net(cat(c, 0.42), w * 0.68, mau) + net(cat(c, 0.74), w * 0.44, mau);
}

/**
 * Lá rải theo đường cong.
 *
 * `ben` đổi dấu từng chiếc nên lá mọc so le hai phía cành — cùng một phía thì cành
 * trông như bị gió ép bẹp về một bên.
 */
function laTrenCung(c: Cung, ts: number[], co: number, xoe = 34): string {
  return ts
    .map((t, i) => {
      const [x, y] = diem(c, t);
      const ben = i % 2 ? 1 : -1;
      const g = huong(c, t) + ben * xoe;
      // Cỡ giảm dần về ngọn: tán dày ở trong, thưa và nhỏ ở ngoài.
      const s = co * (1 - 0.25 * t);
      return `<path d="M0 0c9-8 20-8 26 0-6 8-17 8-26 0Z" transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(g)}) scale(${r1(s)})" fill="${TONG_LA[i % 3]}"/>`;
    })
    .join('');
}

function hoa(c: Cung, t: number, s: number, mau: string): string {
  const [x, y] = diem(c, t);
  const canhHoa = [0, 72, 144, 216, 288]
    .map((g) => `<circle cx="0" cy="-13" r="3.4" fill="${mau}" transform="rotate(${g} 0 -9)"/>`)
    .join('');
  return (
    `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})">` +
    `<path d="M0 0v-9" stroke="${MAU.laDam}" stroke-width="2" stroke-linecap="round"/>` +
    canhHoa +
    `<circle cx="0" cy="-9" r="2.6" fill="${MAU.tam}"/>` +
    `</g>`
  );
}

/** Chiều cao một ô lặp, đơn vị viewBox. Bề rộng khác nhau giữa hai khổ. */
const O_CAO = 400;
const RONG_HEP = 100;
const RONG_RONG = 210;

/**
 * Dây leo chạy dọc suốt viền, ba đoạn nối nhau.
 *
 * Đoạn đầu bắt đầu ở x = 18 và đoạn cuối kết thúc ở x = 18 vì hình này lặp theo trục
 * dọc (`repeat-y`): hai đầu lệch nhau thì mỗi ô lặp có một chỗ dây bị đứt đoạn. Điểm
 * điều khiển cuối (12, 382) chọn cho hướng tiếp tuyến ở đáy khớp hướng ở đỉnh — bằng
 * nhau thì mối nối không thành khuỷu gấp.
 */
const DAY: Cung[] = [
  [18, 0, 36, 50, 36, 100, 20, 150],
  [20, 150, 6, 200, 6, 250, 22, 300],
  [22, 300, 36, 340, 12, 382, 18, 400],
];

/** Nhánh ngắn của khổ HẸP. Cong võng xuống — nhánh thẳng đọc ra là cái nan hoa. */
const NHANH_HEP: Cung[] = [
  [21, 92, 40, 82, 56, 80, 74, 90],
  [12, 212, 32, 200, 50, 198, 68, 210],
  [23, 316, 42, 304, 58, 302, 76, 314],
];

/**
 * PHẦN THÊM của khổ RỘNG — ba nhánh dài chìa sâu vào, ở ba độ cao KHÁC ba nhánh ngắn
 * của khổ hẹp. Trùng độ cao thì hai nhánh chồng nhau thành một chùm rối.
 *
 * Nhánh giữa RỦ XUỐNG còn hai nhánh kia vươn lên. Ba nhánh cùng một dáng vươn thì ô
 * lặp thành một dãy móc giống nhau, mà hình này lặp mỗi 420px nên cái đều đặn ấy lộ
 * ra ngay: mắt nhận ra hình dáng trước khi nhận ra kích thước.
 */
const NHANH_RONG: Cung[] = [
  [19, 38, 62, 38, 108, 50, 146, 76],
  [20, 146, 70, 172, 122, 178, 170, 150],
  [22, 260, 68, 234, 116, 240, 160, 274],
];

/** Chỗ đặt lá trên dây chính: dày, chạy suốt. */
const T_DAY = [0.06, 0.16, 0.26, 0.36, 0.46, 0.56, 0.66, 0.76, 0.86, 0.96];
/** Chỗ đặt lá trên nhánh: ít hơn, và không có chiếc nào ở t = 0 (chỗ dính vào dây). */
const T_NHANH = [0.2, 0.36, 0.5, 0.64, 0.78, 0.9];

function veTranh(kho: 'hep' | 'rong'): string {
  const rong = kho === 'rong' ? RONG_RONG : RONG_HEP;
  const nhanh = kho === 'rong' ? [...NHANH_HEP, ...NHANH_RONG] : NHANH_HEP;

  /*
   * THỨ TỰ VẼ: nhánh con → dây chính → lá → hoa.
   *
   * Nhánh phải vẽ TRƯỚC dây chính để dây che chỗ nhánh dính vào; ngược lại thì gốc
   * nhánh nào cũng chìa ra khỏi dây một đoạn và cả hình thành cái xương cá.
   */
  const veNhanh = nhanh.map((c, i) => canh(c, i < NHANH_HEP.length ? 3 : 3.4)).join('');
  const veDay = DAY.map((c) => net(c, 6, MAU.than)).join('');
  const veLa =
    DAY.map((c) => laTrenCung(c, T_DAY, 0.95)).join('') +
    nhanh.map((c) => laTrenCung(c, T_NHANH, 0.85, 40)).join('');
  // Hoa ở NGỌN nhánh: chỗ mắt đi tới cuối cùng, và là chỗ duy nhất không bị lá che.
  const veHoa = nhanh.map((c, i) => hoa(c, 0.99, i % 2 ? 1 : 1.15, i % 2 ? MAU.hoaVang : MAU.hoaHong)).join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rong} ${O_CAO}" width="${rong}" height="${O_CAO}">` +
    veNhanh +
    veDay +
    veLa +
    veHoa +
    `</svg>`
  );
}

/**
 * Chiều cao một ô lặp trên màn hình, px. Cố định cho cả hai khổ nên chiếc lá ở khổ
 * hẹp và khổ rộng bằng nhau — đó là toàn bộ mục đích của việc chia hai khổ.
 */
const O_CAO_PX = 420;

/** Bề rộng ô lặp trên màn hình, px. Suy ra từ tỉ lệ viewBox. */
const RONG_HEP_PX = Math.round((RONG_HEP / O_CAO) * O_CAO_PX); // 105
const RONG_RONG_PX = Math.round((RONG_RONG / O_CAO) * O_CAO_PX); // 221

/**
 * Ngưỡng chuyển khổ, px. Phải RỘNG HƠN ô lặp chứ không bằng: hẹp hơn ô lặp thì hình
 * bị cắt ở mép trong, tức cắt đúng giữa mấy chiếc lá chìa vào — thà không vẽ gì.
 * Cộng 8px dư cho nét vẽ và bông hoa ở ngọn.
 */
const NGUONG_HEP = RONG_HEP_PX + 8; // 113
const NGUONG_RONG = RONG_RONG_PX + 8; // 229

export function buildStageDecor(): { css: string; js: string } {
  const url = (kho: 'hep' | 'rong') =>
    `url("data:image/svg+xml,${encodeURIComponent(veTranh(kho))}")`;

  const css = `
/*
 * Trang trí hai viền trống hai bên stage. Chỉ hiện khi JS đo được chỗ trống đủ
 * rộng (xem --kg-vien), nên khung nhúng 4:3 bình thường không vẽ gì.
 */
html[data-kg-vien] body::before,
html[data-kg-vien] body::after {
  content: "";
  position: fixed;
  top: 0;
  bottom: 0;
  /* Bề rộng do JS đo từ chính stage. Thiếu var là 0 -> không vẽ, không tràn. */
  width: var(--kg-vien, 0px);
  /* Cao cố định, rộng theo tỉ lệ -> lá bằng nhau ở mọi bề rộng viền. */
  background-size: auto ${O_CAO_PX}px;
  background-repeat: repeat-y;
  pointer-events: none;
  z-index: 0;
}

html[data-kg-vien="hep"] body::before,
html[data-kg-vien="hep"] body::after {
  background-image: ${url('hep')};
}

html[data-kg-vien="rong"] body::before,
html[data-kg-vien="rong"] body::after {
  background-image: ${url('rong')};
}

html[data-kg-vien] body::before {
  left: 0;
  background-position: left top;
}

/*
 * Viền phải là hình bên trái LẬT NGANG. Cùng một tranh cho cả hai bên mà không lật
 * thì hai bên ra một cây dán hai lần; lệch thêm ô lặp 150px cho hai bên không cùng
 * nhịp. Lật bằng transform CSS ở đây là an toàn: đây là phần tử giả, không có thuộc
 * tính transform nào của SVG để mà ghi đè lẫn nhau.
 */
html[data-kg-vien] body::after {
  right: 0;
  background-position: left -150px;
  transform: scaleX(-1);
}
`.trim();

  const js = `
(function () {
  /*
   * Đo bề rộng chỗ trống hai bên stage rồi đặt vào biến CSS và chọn khổ tranh.
   *
   * ĐO chứ không TÍNH. Công thức thì phải viết cứng chiều cao thanh điều khiển của
   * packager (48px lúc đo được), và một bản packager mới đổi con số đó là hình vẽ
   * đè thẳng lên mặt game — không có gì báo ra.
   */
  var HEP = ${NGUONG_HEP};
  var RONG = ${NGUONG_RONG};
  var goc = document.documentElement;
  var stage = null;

  function do_() {
    if (!stage || !stage.isConnected) stage = document.querySelector('.sc-layers');
    if (!stage) return false;
    var r = stage.getBoundingClientRect();
    if (!r.width) return false;
    /* Lấy bên HẸP HƠN cho cả hai bên: stage lệch tâm thì bên rộng vẽ tràn sang mặt game. */
    var vien = Math.min(r.left, window.innerWidth - r.right);
    if (vien >= HEP) {
      goc.style.setProperty('--kg-vien', Math.floor(vien) + 'px');
      goc.setAttribute('data-kg-vien', vien >= RONG ? 'rong' : 'hep');
    } else {
      goc.removeAttribute('data-kg-vien');
    }
    return true;
  }

  /* Stage do runtime dựng sau, chưa chắc có lúc script này chạy. Thử lại vài giây
     rồi thôi — bỏ hẳn còn hơn để một vòng lặp quay mãi sau lưng lúc chơi. */
  var con = 200;
  (function cho() {
    if (do_() || --con <= 0) return;
    setTimeout(cho, 50);
  })();

  window.addEventListener('resize', do_);
  document.addEventListener('fullscreenchange', do_);
  document.addEventListener('webkitfullscreenchange', do_);
  if (window.ResizeObserver) {
    new ResizeObserver(do_).observe(document.documentElement);
  }
})();
`.trim();

  return { css, js };
}
