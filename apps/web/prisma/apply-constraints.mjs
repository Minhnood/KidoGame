/**
 * Áp dụng prisma/constraints.sql — những ràng buộc Prisma schema không diễn đạt được.
 *
 * Chạy sau mỗi `prisma db push` (script db:push đã gọi sẵn).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(path.join(here, '..', '.env'), 'utf8');
  const m = /^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m.exec(env);
  if (!m) throw new Error('Không tìm thấy DATABASE_URL trong .env');
  return m[1];
}

const url = new URL(databaseUrl());
// psql không nhận query param kiểu ?schema=public của Prisma -> bỏ đi.
url.search = '';

execFileSync('psql', [url.href, '-v', 'ON_ERROR_STOP=1', '-q', '-f', path.join(here, 'constraints.sql')], {
  stdio: 'inherit',
});
console.log('đã áp dụng constraints.sql');
