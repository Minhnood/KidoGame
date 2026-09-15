/**
 * Gửi lỗi PHÍA SERVER lên GlitchTip tự host — xem service `glitchtip` trong
 * `infra/docker-compose.yml` và `infra/GIAM-SAT.md`.
 *
 * VÌ SAO CẦN. Trước file này không có gì ghi lại lỗi server cả: `ErrorLog` chỉ nhận
 * beacon từ error boundary trong trình duyệt, và phía server thì lỗi chỉ nằm trong
 * `docker logs`, tức là không ai đọc cho tới khi có người kêu.
 *
 * VÌ SAO TỰ VIẾT chứ không dùng `@sentry/nextjs` (fen chốt 14/9): cái cần chỉ là một
 * POST envelope. SDK kéo theo bọc `next.config`, file cấu hình client/edge, và một
 * loạt integration tự gắn mà mỗi cái phải tắt rồi đo xem nó còn gửi gì thừa. Ở đây
 * từng trường gửi đi đều viết ra dưới đây, nên đọc file này là biết hết.
 *
 * NHỮNG GÌ KHÔNG BAO GIỜ RỜI KHỎI APP, cố ý: header, cookie, IP, user agent, query
 * string, thân request, tên máy, biến môi trường. Stack trace của một web cho trẻ em
 * có thể mang dữ liệu của bé, nên cả thông điệp lỗi cũng bị che email và chuỗi trông
 * như token trước khi gửi.
 *
 * KHÔNG IMPORT GÌ, kể cả `node:*` hay `./db`: file này được nạp từ `instrumentation.ts`,
 * chạy cả ở runtime edge của middleware, và phải còn chạy được đúng lúc phần còn lại
 * của app đang hỏng.
 */

/** Rỗng hoặc sai dạng = tắt, không gửi gì. */
const DSN_ENV = 'GLITCHTIP_DSN';

const MAX_MESSAGE = 500;
const MAX_TYPE = 100;
const MAX_FRAMES = 40;
const MAX_PATH = 200;
const TIMEOUT_MS = 3000;

/**
 * Trần lỗi gửi đi mỗi phút, cho cả tiến trình.
 *
 * Một lỗi trong vòng render lặp hoặc một con bot gõ vào route hỏng bắn được hàng
 * nghìn lỗi một phút. Không có trần thì mỗi cái là một request mở tới GlitchTip —
 * tức một chỗ hỏng kéo theo cả dịch vụ theo dõi chỗ hỏng. Quá trần thì BỎ IM LẶNG:
 * lỗi đã có trong 30 cái đầu, cái thứ 31 giống hệt không thêm gì.
 */
export const GLITCHTIP_MOI_PHUT = 30;

interface Dsn {
  endpoint: string;
  key: string;
}

/** `http://<khoá>@glitchtip:8000/1` → endpoint envelope + khoá. Sai dạng thì `null`. */
export function docDsn(raw: string | undefined): Dsn | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    const project = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!/^https?:$/.test(u.protocol) || !/^[0-9a-f]{16,64}$/i.test(u.username) || !/^\d+$/.test(project)) {
      return null;
    }
    return { endpoint: `${u.protocol}//${u.host}/api/${project}/envelope/`, key: u.username };
  } catch {
    return null;
  }
}

/**
 * Che những thứ có thể là dữ liệu cá nhân hoặc bí mật trong một chuỗi tự do.
 *
 * - query string của mọi URL: link xác minh email và đặt lại mật khẩu mang token ở đó;
 * - địa chỉ email: tên đăng nhập của phụ huynh;
 * - chuỗi liền trông như token: token phiên và token xác minh là `base64url` 43 ký tự,
 *   băm mật khẩu là hex. Từ 32 ký tự thì che luôn — 43 ký tự ngẫu nhiên vẫn có thể
 *   không có chữ số nào; 24–31 ký tự thì chỉ che khi lẫn cả chữ và số, để không nuốt
 *   một tên biến dài.
 *
 * Che thừa một mã băm vô hại là cái giá chấp nhận được; lọt một token thì không.
 */
export function cheDuLieu(s: string): string {
  return s
    .replace(/\?[^\s'"`<>)]*/g, '?[da-che]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/[A-Za-z0-9_-]{24,}/g, (m) =>
      m.length >= 32 || (/\d/.test(m) && /[A-Za-z]/.test(m)) ? '[token]' : m
    );
}

/** Cắt query string và hash. Cùng lý do với `sanitizePath` của `error-log.ts`. */
function duongDanSach(raw: string): string {
  const chi = raw.split(/[?#]/)[0].slice(0, MAX_PATH);
  return chi.startsWith('/') ? chi : 'khong-ro';
}

interface Frame {
  function?: string;
  filename: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

/**
 * Tách stack V8 thành frame cho GlitchTip. Hai dạng dòng:
 *   `    at tenHam (/app/.next/server/chunk.js:12:34)`
 *   `    at /app/.next/server/chunk.js:12:34`
 * Thứ tự đảo lại vì giao thức Sentry muốn frame CŨ NHẤT đứng đầu.
 */
function tachStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const dong of stack.split('\n')) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(dong);
    if (!m) continue;
    /* Không che tên file và tên hàm: đó là mã nguồn, không phải dữ liệu, và luật che
       token sẽ nuốt tên chunk dài của webpack. Chỉ cắt độ dài. */
    const filename = m[2].slice(0, MAX_PATH);
    frames.push({
      function: m[1]?.slice(0, MAX_TYPE),
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes('node_modules') && !filename.startsWith('node:'),
    });
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames.reverse();
}

let cuaSoBatDau = 0;
let daGuiTrongCuaSo = 0;

function vuotTran(now: number): boolean {
  if (now - cuaSoBatDau >= 60_000) {
    cuaSoBatDau = now;
    daGuiTrongCuaSo = 0;
  }
  daGuiTrongCuaSo++;
  return daGuiTrongCuaSo > GLITCHTIP_MOI_PHUT;
}

export interface NguCanhLoi {
  /** Đường dẫn request thô. Bị cắt query ngay trong hàm, KHÔNG gửi nguyên. */
  path?: string;
  method?: string;
  /** Mẫu route của Next, ví dụ `/game/[id]`. Là mã nguồn, không phải dữ liệu. */
  routePath?: string;
  routeType?: string;
}

/**
 * Gửi một lỗi. KHÔNG BAO GIỜ NÉM, và không chờ quá `TIMEOUT_MS`.
 *
 * Trả về lý do để phép kiểm đọc được, chỗ gọi thật thì bỏ qua: `tat` (chưa cấu hình),
 * `vuot-tran`, `da-gui`, `hong` (mạng hoặc GlitchTip trả không-2xx).
 */
export async function guiLoiServer(
  error: unknown,
  nguCanh: NguCanhLoi = {}
): Promise<'tat' | 'vuot-tran' | 'da-gui' | 'hong'> {
  try {
    const dsn = docDsn(process.env[DSN_ENV]);
    if (!dsn) return 'tat';
    const now = Date.now();
    if (vuotTran(now)) return 'vuot-tran';

    const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Lỗi không phải Error');
    const digest = (error as { digest?: unknown } | null)?.digest;
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const route = nguCanh.routePath ? cheDuLieu(nguCanh.routePath).slice(0, MAX_PATH) : undefined;

    const tags: Record<string, string> = {};
    if (route) tags.route = route;
    if (nguCanh.routeType) tags.route_type = nguCanh.routeType.slice(0, 20);
    if (nguCanh.method) tags.method = nguCanh.method.slice(0, 10);
    /* Digest là mã Next in trên trang lỗi và người dùng dán vào `/bao-loi` — có nó thì
       nối được một báo cáo của phụ huynh với đúng stack trace ở đây. */
    if (typeof digest === 'string') tags.digest = digest.slice(0, 64);
    if (typeof process.env.NEXT_RUNTIME === 'string') tags.runtime = process.env.NEXT_RUNTIME;

    const event = {
      event_id: eventId,
      timestamp: now / 1000,
      platform: 'node',
      level: 'error',
      logger: 'kidogame.server',
      environment: process.env.NODE_ENV ?? 'khong-ro',
      transaction: route,
      tags,
      request: nguCanh.path ? { method: nguCanh.method, url: duongDanSach(nguCanh.path) } : undefined,
      exception: {
        values: [
          {
            type: cheDuLieu(e.name || 'Error').slice(0, MAX_TYPE),
            value: cheDuLieu(e.message).slice(0, MAX_MESSAGE),
            stacktrace: { frames: tachStack(e.stack) },
            mechanism: { type: 'onRequestError', handled: false },
          },
        ],
      },
    };

    const body = [
      JSON.stringify({ event_id: eventId, sent_at: new Date(now).toISOString() }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(event),
    ].join('\n');

    const res = await fetch(dsn.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=kidogame/1`,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? 'da-gui' : 'hong';
  } catch {
    return 'hong';
  }
}
