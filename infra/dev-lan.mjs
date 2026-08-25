/**
 * Chạy app + player trên địa chỉ LAN để mở được bằng ĐIỆN THOẠI THẬT.
 *
 * Vì sao cần script riêng: mặc định player chạy ở `127.0.0.1`, mà `127.0.0.1` trên
 * điện thoại là chính điện thoại — nó sẽ không bao giờ tới được máy của bạn. Đổi
 * mỗi player cũng chưa đủ, phải khớp đồng thời BA thứ, sai một là hỏng:
 *
 *   1. `PLAYER_HOST=0.0.0.0`  — player chịu nghe từ máy khác, không chỉ localhost.
 *   2. `PLAYER_ORIGIN`        — app sinh URL iframe/thumbnail trỏ về IP LAN, đồng
 *                               thời `frame-src` trong CSP của app cũng lấy từ đây.
 *   3. `APP_ORIGIN`           — player gửi `frame-ancestors <APP_ORIGIN>`; lệch cái
 *                               này thì trình duyệt chặn iframe, và triệu chứng
 *                               nhìn y như lỗi đóng gói: "game không boot", stage 0x0.
 *
 * Chạy:
 *   node infra/dev-lan.mjs
 *
 * Rồi mở URL nó in ra bằng trình duyệt điện thoại (cùng mạng Wi-Fi).
 */
import { spawn } from 'node:child_process';
import os from 'node:os';

const APP_PORT = Number(process.env.APP_PORT ?? 3000);
const PLAYER_PORT = Number(process.env.PLAYER_PORT ?? 3001);

/** IPv4 nội bộ đầu tiên không phải loopback. */
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

const ip = process.env.LAN_IP ?? lanAddress();
if (!ip) {
  console.error('Không tìm được địa chỉ LAN. Máy có đang nối Wi-Fi/LAN không?');
  process.exit(1);
}

const APP_ORIGIN = `http://${ip}:${APP_PORT}`;
const PLAYER_ORIGIN = `http://${ip}:${PLAYER_PORT}`;

const env = { ...process.env, APP_ORIGIN, PLAYER_ORIGIN };

const children = [];
function run(label, cmd, args, extraEnv) {
  const child = spawn(cmd, args, { env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = (line) => `[${label}] ${line}`;
  child.stdout.on('data', (b) => process.stdout.write(String(b).replace(/^/gm, tag('')).trimEnd() + '\n'));
  child.stderr.on('data', (b) => process.stderr.write(String(b).replace(/^/gm, tag('')).trimEnd() + '\n'));
  child.on('exit', (code) => {
    console.log(tag(`đã thoát (mã ${code})`));
    shutdown();
  });
  children.push(child);
  return child;
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('player', 'node', ['infra/player-server.mjs'], { PLAYER_HOST: '0.0.0.0', PLAYER_PORT: String(PLAYER_PORT) });

/*
 * Dùng `next dev` chứ không `next start`.
 *
 * `next start` đặt NODE_ENV=production, mà cookie phiên khi đó bật `secure: true`
 * nên trình duyệt sẽ TỪ CHỐI lưu nó qua http:// trên LAN — đăng nhập trên điện
 * thoại sẽ im lặng không vào được. Chơi game thì không cần đăng nhập, nhưng thử
 * luồng đăng game thì cần, nên mặc định dùng dev cho khỏi vướng.
 */
run('app', 'pnpm', ['--filter', '@kidogame/web', 'exec', 'next', 'dev', '-p', String(APP_PORT), '-H', '0.0.0.0']);

console.log(`
────────────────────────────────────────────────────────
  Mở bằng ĐIỆN THOẠI (cùng mạng Wi-Fi):

     ${APP_ORIGIN}

  app    -> ${APP_ORIGIN}
  player -> ${PLAYER_ORIGIN}

  Ctrl+C để dừng cả hai.
────────────────────────────────────────────────────────
`);
