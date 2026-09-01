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

export interface PackagedHtml {
  html: Buffer;
  sha256: string;
  /** true nếu project dùng music -> runtime lớn hơn (3.8MB thay vì 1.8MB). */
  usesMusic: boolean;
  extensions: string[];
  /** Các nút cảm ứng đã nhúng. Rỗng nghĩa là game không dùng phím nào. */
  touchKeys: TouchKey[];
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
  p.options.custom.css = [controls.css, decor.css].filter(Boolean).join('\n');

  let out: { data: ArrayBuffer | Uint8Array };
  try {
    out = await p.package();
  } catch (e) {
    throw new Sb3Error('PACKAGE_FAILED', 'Không đóng gói được game này.', (e as Error).message);
  }

  const html = Buffer.from(out.data as ArrayBuffer);
  return {
    html,
    sha256: crypto.createHash('sha256').update(html).digest('hex'),
    usesMusic: project.analysis.usesMusic,
    extensions: project.analysis.extensions,
    touchKeys,
  };
}
