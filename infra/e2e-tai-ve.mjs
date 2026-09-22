/**
 * Nút "Tải file .sb3" đưa về một file MANG TÊN GAME, và chỉ cho tải game được phép xem.
 *
 * VÌ SAO CẦN. Trước đây nút trỏ thẳng sang player origin, nơi file tên theo sha256, nên
 * bé tải về một file tên `215020a1157244…sb3`. Đường mới `/game/<id>/tai-ve` đọc tên
 * trong DB và đặt vào `Content-Disposition`.
 *
 * KIỂM NỘI DUNG, KHÔNG CHỈ KIỂM HEADER. Một bản cài sai đường dẫn vẫn trả 200 với header
 * đẹp và một thân rỗng — bé lưu xuống rồi tưởng game của mình hỏng. Nên bộ này BĂM lại
 * byte tải về và so với `sb3Sha256` trong DB.
 *
 * TÊN GAME LÀ CHỮ TRẺ TỰ GÕ, nên nó là dữ liệu của người lạ: bộ này dựng sẵn một game
 * tên mang dấu tiếng Việt, dấu nháy, ký tự Windows cấm, và một dòng xuống dòng — thứ
 * chèn được header khác nếu không lọc.
 *
 * Chạy (cần app đang chạy + `psql`):
 *   node infra/e2e-tai-ve.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.APP_ORIGIN ?? 'http://localhost:3000';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const ROOT = path.join(import.meta.dirname, '..');
const DB = (
  fs.readFileSync(path.join(ROOT, 'apps', 'web', '.env'), 'utf8').match(/DATABASE_URL="([^"]+)"/)?.[1] ?? ''
).split('?')[0];
const sql = (q) => execFileSync('psql', [DB, '-q', '-t', '-A', '-c', q]).toString().trim();
const nhay = (s) => `'${s.replace(/'/g, "''")}'`;

/* Tên có đủ bốn loại rắc rối: dấu tiếng Việt, ký tự Windows cấm, dấu nháy kép, và
   xuống dòng. Chuỗi E'' của Postgres để \n thành xuống dòng thật chứ không phải hai ký tự. */
const TEN_SQL = `E'Mèo con "bay" / lượn: thử?\\n<script>'`;
/* Dấu nháy kép, `/`, `:`, `?`, `<`, `>` bị bỏ vì Windows không nhận; xuống dòng thành
   khoảng trắng; dấu tiếng Việt giữ nguyên. */
const TEN_CHO = 'Mèo con bay lượn thử script';
const TEN_ASCII_CHO = 'Meo con bay luon thu script.sb3';

const ids = [];
function dungGame(title, status) {
  const nguon = sql(
    `select id, "childId", "sb3Sha256", "sb3Size", "htmlSha256", "thumbSha256"
       from "Game" where status = 'PUBLISHED' order by "createdAt" desc limit 1`
  ).split('|');
  if (!nguon[0]) throw new Error('DB dev không có game PUBLISHED nào để mượn file');
  const [, childId, sb3, size, html, thumb] = nguon;
  const id = `e2etv${Math.random().toString(36).slice(2, 10)}`;
  sql(
    `insert into "Game" (id, "childId", title, "sb3Sha256", "sb3Size", "htmlSha256", "thumbSha256",
       status, "titleSearch", "createdAt", "updatedAt")
     values (${nhay(id)}, ${nhay(childId)}, ${title}, ${nhay(sb3)}, ${size}, ${nhay(html)}, ${nhay(thumb)},
       '${status}', 'e2e tai ve', now() - interval '8 hours', now() - interval '8 hours')`
  );
  ids.push(id);
  return { id, sb3 };
}

try {
  const { id, sb3 } = dungGame(TEN_SQL, 'PUBLISHED');
  const res = await fetch(`${APP}/game/${id}/tai-ve`);
  const cd = res.headers.get('content-disposition') ?? '';

  check('Tải được game công khai', res.status === 200, `HTTP ${res.status}`);
  check(
    'Trả về dạng file tải xuống, không phải trang web',
    res.headers.get('content-type') === 'application/octet-stream' &&
      res.headers.get('x-content-type-options') === 'nosniff',
    `${res.headers.get('content-type')} · nosniff=${res.headers.get('x-content-type-options')}`
  );
  check('Có Content-Disposition: attachment', /^attachment;/.test(cd), cd);

  /* `filename*` là cái trình duyệt thật dùng. Phải giải mã ra đúng tên game đã lọc. */
  const sao = /filename\*=UTF-8''([^;]+)/.exec(cd)?.[1];
  const tenUtf8 = sao ? decodeURIComponent(sao) : '';
  check('Tên file là tên game, giữ nguyên dấu tiếng Việt', tenUtf8 === `${TEN_CHO}.sb3`, tenUtf8);
  check('Đuôi .sb3 còn nguyên', tenUtf8.endsWith('.sb3'), tenUtf8);

  /* Ký tự Windows cấm: file lưu hỏng hoặc rơi vào tên rác nếu lọt qua. */
  check(
    'Đã bỏ ký tự Windows không nhận (/ \\ : * ? " < > |)',
    !/[/\\:*?"<>|]/.test(tenUtf8),
    tenUtf8
  );
  /* Xuống dòng trong header là chèn được header khác — đây là phép quan trọng nhất
     về mặt an toàn, vì tên game do trẻ tự gõ. */
  check('Đã bỏ ký tự xuống dòng và điều khiển', !/[\u0000-\u001f\u007f]/.test(cd), JSON.stringify(cd));

  const ascii = /filename="([^"]*)"/.exec(cd)?.[1] ?? '';
  check('Có bản tên ASCII dự phòng, đã bỏ dấu', ascii === TEN_ASCII_CHO, ascii);
  check('Bản ASCII không còn ký tự ngoài bảng mã', !/[^\x20-\x7e]/.test(ascii), ascii);

  const bytes = Buffer.from(await res.arrayBuffer());
  check(
    'Nội dung tải về ĐÚNG là file .sb3 của game',
    createHash('sha256').update(bytes).digest('hex') === sb3,
    `${bytes.length} byte`
  );
  check(
    'Content-Length khớp số byte thật',
    Number(res.headers.get('content-length')) === bytes.length,
    `${res.headers.get('content-length')} / ${bytes.length}`
  );
  check(
    'Không cho proxy dùng chung giữ bản sao',
    /no-store/.test(res.headers.get('cache-control') ?? '') &&
      !/public/.test(res.headers.get('cache-control') ?? ''),
    res.headers.get('cache-control') ?? '(không có)'
  );

  /* Ba trạng thái không được tải: ẩn, gỡ, và id không tồn tại. LIMITED thì ĐƯỢC —
     ẩn mềm chỉ giấu khỏi danh sách, ai có link vẫn chơi và vẫn tải được. */
  for (const [status, mong] of [
    ['HIDDEN', 404],
    ['REMOVED', 404],
    ['LIMITED', 200],
  ]) {
    const g = dungGame(nhay(`Game ${status}`), status);
    const r = await fetch(`${APP}/game/${g.id}/tai-ve`);
    check(`Game ${status}: người lạ nhận ${mong}`, r.status === mong, `HTTP ${r.status}`);
  }

  const r404 = await fetch(`${APP}/game/khong-co-id-nay/tai-ve`);
  check('Id không tồn tại: 404', r404.status === 404, `HTTP ${r404.status}`);

  /* Nút trên trang game phải trỏ vào đường mới. Trỏ sang player origin thì mọi phép
     trên vẫn xanh mà bé vẫn tải về file tên sha256 — bộ kiểm xanh oan. */
  const trang = await (await fetch(`${APP}/game/${id}`)).text();
  check(
    'Nút trên trang game trỏ vào đường tải về mới',
    trang.includes(`/game/${id}/tai-ve`),
    trang.includes('/sb3/') ? 'vẫn còn link thẳng sang player origin' : ''
  );
} finally {
  for (const id of ids) sql(`delete from "Game" where id = ${nhay(id)}`);
}

const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
