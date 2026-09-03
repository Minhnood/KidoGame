/**
 * Server tĩnh cho PLAYER ORIGIN (dev).
 *
 * Đây là bản tương đương của `infra/Caddyfile` khi chạy máy local. Mục đích
 * không chỉ là serve file mà là để **kiểm chứng được header** ngay từ lúc dev:
 * CORS, nosniff, CSP, và tuyệt đối không bao giờ trả Content-Type: text/html
 * cho file .sb3.
 *
 * Chạy ở 127.0.0.1 chứ không phải localhost: cookie KHÔNG phân biệt theo port,
 * nên chỉ đổi port thì session của app vẫn lọt sang đây. Khác hostname mới là
 * cách ly thật.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'storage');
const PORT = Number(process.env.PLAYER_PORT ?? 3001);
const HOST = process.env.PLAYER_HOST ?? '127.0.0.1';
const APP_ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:3000';

const BUCKETS = {
  sb3: { ext: '.sb3', type: 'application/octet-stream' },
  html: { ext: '.html', type: 'text/html; charset=utf-8' },
  thumb: { ext: '.webp', type: 'image/webp' },
  /*
   * Runtime scratch-vm, tách khỏi HTML để mọi game dùng chung một file.
   *
   * Content-Type PHẢI đúng: `nosniff` bên dưới tắt hẳn việc trình duyệt tự đoán
   * kiểu, nên trả sai kiểu cho một file .js là trình duyệt từ chối chạy nó và game
   * mở ra với stage trắng.
   */
  runtime: { ext: '.js', type: 'text/javascript; charset=utf-8' },
};

/**
 * CSP cho HTML đã đóng gói.
 *
 * HTML do TurboWarp packager sinh ra tự nhúng thẻ meta CSP rất lỏng
 * (`default-src *`). Policy từ HTTP header và từ meta tag được áp dụng ĐỒNG THỜI
 * và hiệu lực là GIAO của hai cái — nên header dưới đây vẫn siết được, bất kể
 * meta tag nói gì.
 *
 * Runtime cần 'unsafe-inline'/'unsafe-eval' (compiler sinh JS lúc chạy) và
 * blob: (inline worker). Nhưng connect-src bị khoá về self/data/blob, nên game
 * không gửi được dữ liệu ra host nào khác.
 */
const PLAYER_CSP = [
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "form-action 'none'",
  `frame-ancestors ${APP_ORIGIN}`,
].join('; ');

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('404');
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    return notFound(res);
  }

  // /<bucket>/<xx>/<sha256><ext>
  const m = /^\/(sb3|html|thumb|runtime)\/([0-9a-f]{2})\/([0-9a-f]{64})(\.[a-z0-9]+)$/.exec(
    pathname
  );
  if (!m) return notFound(res);

  const [, bucket, prefix, sha, ext] = m;
  const spec = BUCKETS[bucket];
  if (ext !== spec.ext || sha.slice(0, 2) !== prefix) return notFound(res);

  const file = path.join(ROOT, bucket, prefix, `${sha}${ext}`);
  // Regex ở trên đã loại mọi ký tự path, nhưng vẫn kiểm lại lần nữa.
  if (!file.startsWith(ROOT + path.sep)) return notFound(res);

  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    return notFound(res);
  }

  const headers = {
    'content-type': spec.type,
    'content-length': stat.size,
    // Tên file LÀ hash nội dung -> nội dung không bao giờ đổi -> cache vĩnh viễn.
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };

  if (bucket === 'html') {
    headers['content-security-policy'] = PLAYER_CSP;
  } else if (bucket !== 'runtime') {
    // scratch-vm fetch .sb3 cross-origin -> thiếu header này là hỏng.
    // Thiếu CORS là lỗi mất thời gian nhất khi mới dựng.
    //
    // Runtime KHÔNG cần: nó chỉ được nạp bằng thẻ <script> từ HTML nằm trên CHÍNH
    // origin này. Mở CORS cho nó là cho phép trang khác đọc nội dung file mà không
    // đổi lại được gì.
    headers['access-control-allow-origin'] = '*';
  }

  if (bucket === 'sb3') {
    headers['content-disposition'] = `attachment; filename="${sha.slice(0, 12)}.sb3"`;
  }

  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`player origin: http://${HOST}:${PORT}  (root: ${ROOT})`);
});
