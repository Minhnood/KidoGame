import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

/**
 * Máy chủ đang băm tối đa rồi. KHÔNG phải sai mật khẩu.
 *
 * Phải là một loại lỗi RIÊNG, không được lẫn vào `false` của `verifyPassword`:
 * lẫn vào là quá tải bị kể lại thành "sai mật khẩu", rồi `recordFailure()` đếm nó
 * như một lần gõ sai và khoá tài khoản của người vô can. Nghĩa là lúc máy chủ
 * đang bận nhất, hệ thống sẽ tự tay khoá chính những người đang cố đăng nhập.
 */
export class ScryptBusyError extends Error {
  constructor() {
    super('Máy chủ đang bận, thử lại sau vài giây nhé.');
    this.name = 'ScryptBusyError';
  }
}

/*
 * TRẦN SỐ LẦN BĂM CHẠY CÙNG LÚC — cho cả tiến trình.
 *
 * Vì sao cần: `LoginAttempt` khoá theo DANH TÍNH (email/username), cố ý như vậy để
 * không khoá oan cả một lớp học dùng chung IP. Nhưng hệ quả là đổi email mỗi
 * request thì KHÔNG có gì chặn: mỗi request là một lần băm 64MB, và không ai đếm
 * tổng. Đây là cạn tài nguyên, loại mà bài soát bảo mật cố ý không tính.
 *
 * Số đo trên máy dev (N=2^16, r=8):
 *   1 lần băm             ~130 ms
 *   4 lần song song       ~163 ms   (gần như không chậm hơn)
 *   16 lần song song      ~568 ms,  RSS đỉnh 299 MB
 *
 * Nên chọn 4: đỉnh bộ nhớ ~256MB, còn chỗ cho Next + Prisma trên một VPS nhỏ, mà
 * độ trễ gần như không đổi so với chạy một mình.
 *
 * Hàng chờ 32: quá số đó thì TỪ CHỐI NGAY thay vì xếp hàng vô hạn. Xếp hàng vô hạn
 * chỉ đổi kiểu chết — thay vì hết RAM thì thành hàng nghìn request treo rồi cùng
 * timeout. 32 người chờ, 4 người chạy, mỗi lượt 130ms thì người cuối đợi ~1 giây;
 * đó là lý do KHÔNG cần thêm cơ chế timeout cho hàng chờ.
 *
 * Trần này đặt ở ĐÂY chứ không ở tầng route, cố ý: mọi đường dẫn tới scrypt đều đi
 * qua hàm này — đăng nhập, đăng ký, đổi mật khẩu, tạo tài khoản con, cả hash mồi
 * `verifyOrDecoy`. Đặt ở tầng route thì người thêm route mới sau này phải nhớ, và
 * sớm muộn sẽ có người quên.
 */
const MAX_SONG_SONG = Math.max(1, Number(process.env.SCRYPT_MAX_CONCURRENT ?? 4));
const MAX_HANG_CHO = Math.max(0, Number(process.env.SCRYPT_MAX_QUEUE ?? 32));

let dangChay = 0;
const hangCho: Array<() => void> = [];

/** Số liệu để soi lúc chạy và để phép kiểm khẳng định. */
export function scryptLoad(): { dangChay: number; hangCho: number } {
  return { dangChay, hangCho: hangCho.length };
}

async function xinLuot(): Promise<void> {
  if (dangChay < MAX_SONG_SONG) {
    dangChay++;
    return;
  }
  if (hangCho.length >= MAX_HANG_CHO) throw new ScryptBusyError();
  /*
   * Không tăng `dangChay` ở đây: suất được TRAO tay trong `traLuot()`, và ở đó
   * `dangChay` giữ nguyên. Tăng cả hai chỗ là đếm đôi, và trần thành vô nghĩa
   * đúng lúc có tải — tức là đúng lúc cần nó.
   */
  await new Promise<void>((resolve) => hangCho.push(resolve));
}

function traLuot(): void {
  const tiep = hangCho.shift();
  if (tiep) tiep();
  else dangChay--;
}

/**
 * promisify() của node:util chỉ nhìn thấy overload 3 tham số của scrypt, nên mất tham số options (N, r, p, maxmem). Tự bọc để giữ đủ chữ ký.
 */
async function scrypt(
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  // Ném ở đây thì KHÔNG gọi `traLuot()` — chưa hề nhận suất nào.
  await xinLuot();
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scryptCb(password, salt, keylen, options, (err, derived) =>
        err ? reject(err) : resolve(derived)
      );
    });
  } finally {
    traLuot();
  }
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
  } catch (e) {
    /*
     * Quá tải PHẢI bay lên trên, không được nuốt thành `false`.
     *
     * Cái `catch` này tồn tại để một dòng hash hỏng trong DB không thành lỗi 500.
     * Nhưng "máy chủ đang bận" là chuyện khác hẳn: trả `false` ở đây là nói dối
     * rằng người ta gõ sai mật khẩu, và tầng trên sẽ đếm nó vào số lần sai rồi
     * khoá tài khoản — biến một lúc quá tải thành một đợt khoá tài khoản hàng loạt.
     */
    if (e instanceof ScryptBusyError) throw e;
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
