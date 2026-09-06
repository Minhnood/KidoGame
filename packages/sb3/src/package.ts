import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { Sb3Error } from './errors.js';
import { detectTouchKeys, type TouchKey } from './keys.js';
import { buildStageDecor } from './stage-decor.js';
import { buildTouchControls } from './touch-controls.js';
import type { ProjectJson } from './validate.js';

// @turbowarp/packager là CJS (main: dist/packager.js), không có ESM export.
//
// CỐ TÌNH không đặt tên biến là `require`: webpack coi mọi lời gọi `require(...)`
// là của chính nó, sẽ bundle packager lại và chọn nhánh code dành cho browser
// (biểu hiện: "XMLHttpRequest is not defined" khi chạy trên server).
// Tên khác `require` thì bundler để yên cho Node xử lý lúc chạy.
const nodeRequire = createRequire(import.meta.url);

interface PackagerProject {
  title: string;
  type: string;
  arrayBuffer: ArrayBuffer;
  analysis: {
    stageVariables: unknown[];
    stageComments: unknown[];
    usesMusic: boolean;
    usesSteamworks: boolean;
    extensions: string[];
  };
}

interface PackagerModule {
  Packager: new () => {
    project: PackagerProject;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any;
    package(): Promise<{ data: ArrayBuffer | Uint8Array; type: string; filename: string }>;
  };
  loadProject(ab: ArrayBuffer): Promise<PackagerProject>;
}

const pkg = (): PackagerModule => nodeRequire('@turbowarp/packager') as PackagerModule;

export interface PackagedRuntime {
  js: Buffer;
  sha256: string;
}

export interface PackagedHtml {
  html: Buffer;
  sha256: string;
  /**
   * Runtime scratch-vm, đã TÁCH khỏi HTML.
   *
   * Giống hệt từng byte giữa mọi game (đã kiểm sha256 trên 3 project khác nhau),
   * nên nó là một file dùng chung — xem `tachRuntime`.
   */
  runtime: PackagedRuntime;
  /** true nếu project dùng music -> runtime lớn hơn (3.8MB thay vì 1.8MB). */
  usesMusic: boolean;
  extensions: string[];
  /** Các nút cảm ứng đã nhúng. Rỗng nghĩa là game không dùng phím nào. */
  touchKeys: TouchKey[];
}

/**
 * Đường dẫn công khai của runtime trên player origin.
 *
 * KHÔNG kèm origin, cố ý. HTML là file tĩnh bất biến, đóng gói một lần rồi phục vụ
 * mãi — nhúng `http://127.0.0.1:3001` vào lúc đóng gói ở máy dev thì file ấy hỏng
 * trên production, và hỏng theo kiểu tệ nhất: trang mở ra, khung game hiện, runtime
 * không tải được, không lỗi nào nói vì sao. Đường dẫn từ gốc thì đúng ở mọi origin.
 *
 * Phải khớp với `objectPath`/`objectUrl` bên `apps/web/src/lib/storage.ts` — cùng
 * một quy ước `<bucket>/<2 ký tự đầu>/<sha256><ext>`.
 */
export function runtimePath(sha256: string): string {
  return `/runtime/${sha256.slice(0, 2)}/${sha256}.js`;
}

/**
 * Ngưỡng để nhận ra khối script nào là runtime.
 *
 * Runtime đo được là ~1754 KB; khối lớn thứ hai là ~9 KB. Khoảng cách hai trăm lần
 * nên ngưỡng 500 KB không thể chọn nhầm.
 */
const RUNTIME_MIN_BYTES = 500_000;

/**
 * Cắt runtime ra khỏi HTML, thay bằng một thẻ `<script src>` trỏ tới file dùng chung.
 *
 * VÌ SAO: packager nhúng nguyên bộ scratch-vm vào TỪNG file HTML. Đo trên storage
 * thật: mọi game đều ~1800 KB, trong đó 1754 KB là khối script đầu tiên và khối ấy
 * GIỐNG HỆT TỪNG BYTE giữa các game. Nghĩa là một đứa trẻ mở 5 game phải tải 5 lần
 * cùng một thứ — ~19 giây mỗi game trên 3G yếu — và VPS giữ 1.79 MB cho mỗi game.
 * Tách ra thì game thứ hai trở đi chỉ còn phần của riêng nó, và đĩa tự dedupe vì
 * tên file là hash nội dung.
 *
 * CÁI MẤT: HTML không còn là một file chạy độc lập, tức không còn lưu về máy rồi mở
 * offline bằng một cú nháy đúp. Lý lẽ bảo mật KHÔNG dựa vào tính chất đó — nó dựa
 * vào origin riêng, iframe sandbox và CSP, cả ba đều không đổi. Runtime nằm cùng
 * origin nên `default-src 'self'` đã cho phép, không phải chọc lỗ nào.
 *
 * NÉM LỖI KHI KHÔNG TÌM THẤY, không âm thầm trả HTML nguyên vẹn. Nếu một bản
 * packager mới đổi cách nhúng thì cách hỏng im lặng là mọi game lại nặng 1.8 MB và
 * KHÔNG AI BIẾT — đúng loại lỗi mà dự án này đã mất nhiều thời gian nhất để tìm.
 */
function tachRuntime(html: string): { html: string; runtime: string; runtimeSha256: string } {
  let best: { open: number; close: number; body: string } | null = null;

  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    // Thẻ đã có `src` thì không phải khối nhúng.
    if (/\bsrc\s*=/.test(m[1])) continue;
    if (!best || m[2].length > best.body.length) {
      best = { open: m.index, close: m.index + m[0].length, body: m[2] };
    }
  }

  if (!best || best.body.length < RUNTIME_MIN_BYTES) {
    throw new Sb3Error(
      'PACKAGE_FAILED',
      'Không đóng gói được game này.',
      `không tìm thấy khối runtime để tách (khối lớn nhất ${best?.body.length ?? 0} byte, cần ít nhất ${RUNTIME_MIN_BYTES}). Bản @turbowarp/packager có thể đã đổi cách nhúng runtime.`
    );
  }

  const sha256 = crypto.createHash('sha256').update(best.body, 'utf8').digest('hex');

  /*
   * KHÔNG `async`, KHÔNG `defer`. Script ngoài không mang hai thuộc tính đó thì chặn
   * bộ phân tích và chạy xong trước script nội tuyến đứng sau nó — giữ đúng thứ tự
   * mà bản nhúng đang có. Thêm `defer` vào là runtime chạy SAU đoạn khởi động, và
   * biểu hiện là stage trắng chứ không phải một lỗi đọc được.
   */
  const the = `<script src="${runtimePath(sha256)}"></script>`;

  return {
    html: html.slice(0, best.open) + the + html.slice(best.close),
    runtime: best.body,
    runtimeSha256: sha256,
  };
}

export interface PackageOptions {
  /** Tên hiển thị, dùng cho <title>. Đã được sanitize ở tầng trên. */
  title: string;
  /**
   * project.json đã qua kiểm tra, để dò xem game dùng phím nào mà sinh đúng
   * bộ nút cảm ứng. Bỏ trống thì không có nút cảm ứng nào.
   */
  projectJson?: ProjectJson;
}

/**
 * Ẩn nút toàn màn hình CỦA PACKAGER trên thiết bị cảm ứng.
 *
 * Trên điện thoại trang game có HAI đường phóng to, cách nhau chừng 40px: nút ⛶ ở
 * góc phải thanh điều khiển (của packager, gọi Fullscreen API) và nút "Chơi to hơn"
 * của app ngay dưới khung. Hai nút cạnh nhau làm cùng một việc thì đứa trẻ phải
 * đoán, mà ⛶ lại đúng là nút SAI để đoán: Safari trên iPhone không cho phần tử
 * thường vào toàn màn hình, nên ở đó bấm vào không có gì xảy ra và không có lỗi nào
 * hiện ra. Xem đầu file `apps/web/src/app/game/[id]/stage-frame.tsx` — nút của app
 * dùng `position: fixed` chính vì lý do ấy, và nó chạy trên mọi trình duyệt.
 *
 * `pointer: coarse` là ĐÚNG media query mà `.touch-only` của app dùng để HIỆN nút
 * "Chơi to hơn" (globals.css). Một điều kiện cho cả hai chiều nên không có khe hở:
 * không thiết bị nào thấy hai nút, không thiết bị nào thấy không nút nào.
 *
 * TRÊN MÁY CÓ CHUỘT NÚT NÀY Ở LẠI, cố ý. Ở đó nó chạy thật, và toàn màn hình thật
 * vẫn hơn một cái div phủ kín khung nhìn: nó ẩn cả thanh địa chỉ của trình duyệt.
 *
 * VÌ SAO ẨN BẰNG CSS chứ không tắt `controls.fullscreen.enabled`: mỗi game chỉ đóng
 * gói MỘT file HTML dùng cho cả hai loại thiết bị, nên tắt hẳn là mất luôn nút trên
 * máy tính. CSS thì quyết định ở phía người chơi, đúng chỗ biết mình đang là thiết
 * bị gì.
 *
 * `!important` không phải cho chắc: nút này do JS của scaffolding dựng và nó có đặt
 * `style` trực tiếp lên phần tử.
 */
const CSS_AN_NUT_TOAN_MAN_HINH = `
@media (pointer: coarse) {
  /* Hai selector cho hai trường hợp của packager: có thanh điều khiển (cờ xanh +
     nút dừng, đúng cấu hình ở đây) và không có thanh nào. Giữ cả hai vì đổi một
     dòng \`controls.*.enabled\` ở trên là đổi luôn selector, và kiểu hỏng đó im
     lặng — nút chỉ lặng lẽ hiện lại. */
  .control-button.fullscreen-button,
  .standalone-fullscreen-button {
    display: none !important;
  }
}
`.trim();

/**
 * Đóng gói .sb3 thành một file HTML standalone, chạy hoàn toàn trong Node.
 *
 * Chạy offline: scaffolding runtime đọc từ node_modules chứ không tải từ
 * turbowarp.org, nên VPS không cần internet lúc package và game không cần
 * internet lúc chơi.
 *
 * CẢNH BÁO: `options.custom.js` và `options.custom.css` chèn code thẳng vào output.
 * Tuyệt đối không bao giờ nối dữ liệu người dùng vào hai trường này.
 */
export async function packageToHtml(sb3: Buffer, opts: PackageOptions): Promise<PackagedHtml> {
  const { Packager, loadProject } = pkg();

  const ab = sb3.buffer.slice(sb3.byteOffset, sb3.byteOffset + sb3.byteLength) as ArrayBuffer;

  let project: PackagerProject;
  try {
    project = await loadProject(ab);
  } catch (e) {
    throw new Sb3Error('PACKAGE_FAILED', 'Không đọc được dự án Scratch này.', (e as Error).message);
  }

  const p = new Packager();
  p.project = project;
  p.options.target = 'html';

  // Trẻ em cần nút bấm nhìn thấy được — mặc định của packager tắt hết.
  p.options.controls.greenFlag.enabled = true;
  p.options.controls.stopAll.enabled = true;
  p.options.controls.fullscreen.enabled = true;

  // Giữ màn hình launch (autoplay=false) để tránh audio autoplay bị chặn,
  // và để trẻ chủ động bấm cờ xanh như trong Scratch thật.
  p.options.autoplay = false;

  // QUAN TRỌNG: mặc định là 'ws' -> trình duyệt của trẻ kết nối
  // wss://clouddata.turbowarp.org. Chuyển sang 'local' để biến đám mây lưu
  // trong localStorage của chính máy đó, không có traffic ra bên thứ ba.
  p.options.cloudVariables.mode = 'local';
  p.options.cloudVariables.cloudHost = '';
  p.options.cloudVariables.specialCloudBehaviors = false;
  p.options.cloudVariables.unsafeCloudBehaviors = false;

  // Không định danh người chơi.
  p.options.username = 'player';

  p.options.app.windowTitle = opts.title;
  p.options.app.packageName = 'kidogame';

  p.options.appearance.background = '#1b1b32';
  p.options.appearance.accent = '#ff8c1a';

  /*
   * custom.js/custom.css chèn code thẳng vào output.
   *
   * Chỉ được nhận code của CHÍNH TA: ở đây là bộ nút cảm ứng sinh từ danh sách
   * phím đã lọc qua whitelist trong keys.ts. TUYỆT ĐỐI không nối dữ liệu người
   * dùng (tên game, mô tả, nội dung project) vào hai trường này.
   */
  const touchKeys = opts.projectJson ? detectTouchKeys(opts.projectJson) : [];
  const controls = buildTouchControls(touchKeys);

  /*
   * Trang trí hai viền trống hai bên stage. Nối SAU bộ nút cảm ứng chứ không thay
   * chỗ: `buildTouchControls` trả về chuỗi rỗng khi game không dùng phím nào, nên
   * gán trực tiếp thì game không phím sẽ mất luôn trang trí.
   */
  const decor = buildStageDecor();
  p.options.custom.js = [controls.js, decor.js].filter(Boolean).join('\n');
  p.options.custom.css = [controls.css, decor.css, CSS_AN_NUT_TOAN_MAN_HINH]
    .filter(Boolean)
    .join('\n');

  let out: { data: ArrayBuffer | Uint8Array };
  try {
    out = await p.package();
  } catch (e) {
    throw new Sb3Error('PACKAGE_FAILED', 'Không đóng gói được game này.', (e as Error).message);
  }

  const tach = tachRuntime(Buffer.from(out.data as ArrayBuffer).toString('utf8'));

  const html = Buffer.from(tach.html, 'utf8');

  return {
    html,
    sha256: crypto.createHash('sha256').update(html).digest('hex'),
    /*
     * Hash của runtime lấy nguyên từ `tachRuntime`, KHÔNG tính lại ở đây. Đường dẫn
     * nhúng trong HTML sinh từ con số đó, nên nó chỉ được có một nguồn — tính lại
     * lần thứ hai là mở cửa cho HTML trỏ tới một file không tồn tại.
     */
    runtime: {
      js: Buffer.from(tach.runtime, 'utf8'),
      sha256: tach.runtimeSha256,
    },
    usesMusic: project.analysis.usesMusic,
    extensions: project.analysis.extensions,
    touchKeys,
  };
}
