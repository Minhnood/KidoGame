import { createHash } from 'node:crypto';

/**
 * Bộ đếm chống lụt, giữ TRONG BỘ NHỚ chứ không trong DB.
 *
 * Vì sao không dùng DB như `TakedownRequest.ipHash`: hai chỗ dùng file này đều là
 * đường đi mà mục đích của việc đếm là *tránh* tốn tài nguyên — một beacon lỗi, một
 * lượt băm mật khẩu. Nếu chính cái van cần một truy vấn DB thì nó không còn là van.
 *
 * Ba đánh đổi, cả ba đều chấp nhận được và cần biết:
 *
 *  - **Đếm theo từng tiến trình Node.** Chạy nhiều tiến trình thì trần thực tế là
 *    bội số. Production hiện tại là một container `web`, nên đúng bằng con số đặt ra.
 *  - **Mất khi restart.** Cửa sổ dài nhất ở đây là một giờ, nên mất cũng chỉ mở lại
 *    một cửa sổ.
 *  - **KHÔNG lưu IP.** Khoá là băm của IP và chỉ sống trong RAM. Cả kiến trúc này
 *    cố ý không giữ IP của ai, kể cả để chống lạm dụng.
 */

interface Bucket {
  /** Mốc cửa sổ hiện tại, tính bằng số cửa sổ kể từ epoch. */
  window: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

/** Trần số khoá giữ trong bộ nhớ, để bản thân bộ đếm không thành chỗ rò bộ nhớ. */
const MAX_BUCKETS = 5000;

/**
 * Đếm một lượt và trả về `true` nếu lượt này đã VƯỢT trần trong cửa sổ hiện tại.
 *
 * `key` phải là chuỗi đã băm, không phải IP thô — dùng `rateKey()`.
 */
export function tooMany(key: string, limit: number, windowMs: number): boolean {
  const window = Math.floor(Date.now() / windowMs);
  const hit = buckets.get(key);

  if (!hit || hit.window !== window) {
    /*
     * Dọn cả bảng khi quá đông, chứ không quét tìm khoá hết hạn: mọi bản ghi ở đây
     * hết giá trị sau một cửa sổ, nên xoá sạch chỉ làm mất trần của đúng cửa sổ đang
     * chạy. Rẻ hơn hẳn việc đi qua cả Map.
     */
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    buckets.set(key, { window, count: 1 });
    return false;
  }

  hit.count += 1;
  return hit.count > limit;
}

/**
 * Băm (mục đích, IP) thành khoá đếm.
 *
 * `mucDich` tách các loại giới hạn ra khỏi nhau: cùng một người gửi báo cáo lỗi
 * không được ăn vào trần đăng ký của họ.
 */
export function rateKey(mucDich: string, ip: string): string {
  return createHash('sha256').update(`${mucDich}:${ip}`).digest('hex');
}
