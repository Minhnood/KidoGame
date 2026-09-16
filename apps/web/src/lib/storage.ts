import fs from 'node:fs/promises';
import path from 'node:path';

export type Bucket = 'sb3' | 'html' | 'thumb' | 'runtime';

const EXT: Record<Bucket, string> = {
  sb3: '.sb3',
  html: '.html',
  thumb: '.webp',
  /*
   * Runtime scratch-vm, tách khỏi HTML để mọi game dùng chung một file.
   *
   * Quy ước đường dẫn ở đây phải khớp `runtimePath()` trong `packages/sb3` — chính
   * hàm đó nhúng URL vào HTML lúc đóng gói. Lệch nhau thì game mở ra với stage
   * trắng và một 404 trong tab Network, không có lỗi nào ở tầng ứng dụng.
   */
  runtime: '.js',
};

export function storageRoot(): string {
  return path.resolve(process.cwd(), process.env.STORAGE_DIR ?? '../../storage');
}

/**
 * Địa chỉ hoá theo nội dung: tên file LÀ sha256 của nội dung.
 *
 * Hai hệ quả đều có lợi:
 *  - Hai đứa trẻ upload cùng một game thì dùng chung một file trên đĩa.
 *  - URL bất biến, cache được vĩnh viễn (`immutable`) mà không sợ cũ.
 */
export function objectPath(bucket: Bucket, sha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error(`sha256 không hợp lệ: ${sha256}`);
  }
  // Chia thư mục con theo 2 ký tự đầu để không dồn hàng trăm nghìn file vào một chỗ.
  return path.join(storageRoot(), bucket, sha256.slice(0, 2), `${sha256}${EXT[bucket]}`);
}

/** URL công khai trên player origin. Không bao giờ serve từ app origin. */
export function objectUrl(bucket: Bucket, sha256: string): string {
  const origin = process.env.PLAYER_ORIGIN ?? 'http://127.0.0.1:3001';
  return `${origin}/${bucket}/${sha256.slice(0, 2)}/${sha256}${EXT[bucket]}`;
}

/** Ghi nếu chưa có. Trả về true nếu thực sự ghi mới (dùng để đo dedupe). */
export async function putObject(bucket: Bucket, sha256: string, data: Buffer): Promise<boolean> {
  const target = objectPath(bucket, sha256);
  try {
    await fs.access(target);
    /* Đã có, nội dung giống hệt vì tên file là hash của nội dung. Vẫn cập nhật giờ sửa:
       `storage:prune` chừa file mới sửa gần đây, và một bản xem thử có thể đang dùng lại
       đúng file rác cũ của một lần xem thử trước — không chạm thì nó bị dọn giữa chừng. */
    const now = new Date();
    await fs.utimes(target, now, now).catch(() => {});
    return false;
  } catch {
    // chưa có -> ghi
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  // Ghi ra file tạm rồi rename: người đọc không bao giờ thấy file ghi dở.
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, target);
  return true;
}

export async function readObject(bucket: Bucket, sha256: string): Promise<Buffer> {
  return fs.readFile(objectPath(bucket, sha256));
}

export async function objectExists(bucket: Bucket, sha256: string): Promise<boolean> {
  try {
    await fs.access(objectPath(bucket, sha256));
    return true;
  } catch {
    return false;
  }
}
