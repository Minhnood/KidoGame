import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

/**
 * promisify() của node:util chỉ nhìn thấy overload 3 tham số của scrypt, nên mất tham số options (N, r, p, maxmem). Tự bọc để giữ đủ chữ ký.
 */
function scrypt(
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) =>
      err ? reject(err) : resolve(derived)
    );
  });
}

/*
 * Dùng scrypt của node:crypto, không thêm dependency.
 *
 * OWASP xếp argon2id trên scrypt, nhưng argon2 trên npm là native module phải
 * build — thêm một điểm vỡ khi deploy lên VPS. scrypt với tham số dưới đây là
 * lựa chọn đủ mạnh và không phụ thuộc gì. Nếu sau này muốn đổi sang argon2id,
 * format hash đã có tiền tố thuật toán nên nâng cấp dần được: hash cũ vẫn verify
 * bình thường, hash mới ghi theo định dạng mới.
 *
 * N = 2^16 -> tốn 128 * N * r = 64MB bộ nhớ mỗi lần băm. Phải truyền maxmem vì
 * mặc định của Node là 32MB, không đủ và sẽ ném lỗi.
 */
const SCRYPT = {
  N: 65536,
  r: 8,
  p: 1,
  keyLength: 64,
  maxmem: 128 * 65536 * 8 * 2,
} as const;

/** Định dạng: `scrypt$<N>$<r>$<p>$<salt hex>$<hash hex>` */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keyLength, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  });

  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('hex'), key.toString('hex')].join(
    '$'
  );
}

/**
 * So sánh mật khẩu. Luôn dùng timingSafeEqual, không dùng `===`.
 *
 * Trả về false khi hash hỏng/định dạng lạ thay vì ném lỗi — một dòng dữ liệu xấu
 * trong DB không nên thành lỗi 500 làm lộ thông tin.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    // Chặn tham số vô lý trong DB làm cạn bộ nhớ server.
    if (!Number.isInteger(N) || N < 1024 || N > 1 << 20) return false;
    if (!Number.isInteger(r) || r < 1 || r > 32) return false;
    if (!Number.isInteger(p) || p < 1 || p > 16) return false;

    const expected = Buffer.from(hashHex, 'hex');
    if (expected.length === 0) return false;

    const actual = await scrypt(
      password.normalize('NFKC'),
      Buffer.from(saltHex, 'hex'),
      expected.length,
      { N, r, p, maxmem: 128 * N * r * 2 }
    );

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export interface PasswordProblem {
  message: string;
}

/**
 * Kiểm tra độ mạnh mật khẩu, tách riêng cho phụ huynh và cho trẻ.
 *
 * Mật khẩu của trẻ được nới hơn có chủ đích: bắt bé 8 tuổi đặt mật khẩu 12 ký tự
 * có ký tự đặc biệt thì bé sẽ viết ra giấy dán lên màn hình, hoặc nhờ bố mẹ đặt
 * rồi quên. Rủi ro thật ở đây là bé quên mật khẩu, không phải bị brute-force —
 * đã có khoá sau nhiều lần sai, và tài khoản trẻ không nắm gì để mất ngoài game.
 */
export function checkParentPassword(password: string): PasswordProblem | null {
  if (password.length < 10) return { message: 'Mật khẩu cần ít nhất 10 ký tự.' };
  if (password.length > 200) return { message: 'Mật khẩu quá dài.' };
  if (/^\d+$/.test(password)) return { message: 'Mật khẩu không nên chỉ gồm chữ số.' };
  return null;
}

export function checkChildPassword(password: string): PasswordProblem | null {
  if (password.length < 6) return { message: 'Mật khẩu của bé cần ít nhất 6 ký tự.' };
  if (password.length > 200) return { message: 'Mật khẩu quá dài.' };
  return null;
}
