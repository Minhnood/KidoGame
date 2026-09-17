'use client';

import { useRef } from 'react';
import { TextInput } from '@/components/field';

/**
 * Ô tên đăng nhập của bé — có thể đã điền sẵn từ nút "Cho bé đăng nhập trên máy này".
 *
 * CHẠM VÀO Ô ĐIỀN SẴN THÌ CHỌN HẾT CHỮ. Bé chưa chắc để ý là ô đã có tên: chạm vào rồi gõ
 * tên mình. Ô thường thì con trỏ nằm ở cuối, tên nối thành `beminhbeminh` và bé bị báo
 * sai tên — ngay bước mà nút kia sinh ra để bé khỏi phải gõ tên. Chọn hết thì gõ là
 * thay, đúng như bé muốn; không gõ gì thì tên vẫn nguyên.
 *
 * Chỉ khi ô còn đúng tên điền sẵn: bé đã sửa thành chữ khác thì đó là chữ của bé, và
 * chạm lại để sửa tiếp phải đặt con trỏ như ô thường.
 *
 * CHỌN Ở `click`, KHÔNG Ở `focus`. Chạm hay nhấp đặt con trỏ SAU khi ô nhận focus, nên
 * chọn lúc focus là bị chính cú chạm đó xoá (đo: ngay sau nhấp, vùng chọn 6–6). Bản đầu
 * đẩy `select()` ra `setTimeout` — chọn được, nhưng là chạy đua: đo 100ms sau thì 0–6,
 * còn bàn phím gõ ngay sau cú nhấp thì vẫn nối tên. `click` tới sau khi con trỏ đã đặt,
 * với cả chuột lẫn ngón tay, nên không có gì phải đua. Cờ `vuaFocus` để CHỈ cú nhấp làm
 * ô nhận focus mới chọn hết; nhấp lần hai là đặt con trỏ như ô thường. Focus bằng Tab
 * không có `click` nên chọn ngay trong `onFocus` (Chrome vốn cũng làm vậy với Tab).
 * `setSelectionRange` thay `select()`: đó là cách hay được khuyên cho Safari trên iPhone.
 * CHƯA đo trên iPhone thật — `e2e-auth` đo bằng Chrome, cả chạm lẫn chuột.
 */
export function OTenBe({ tenDienSan }: { tenDienSan?: string }) {
  const vuaFocus = useRef(false);

  function chonHetNeuConDienSan(o: HTMLInputElement) {
    if (tenDienSan && o.value === tenDienSan) o.setSelectionRange(0, o.value.length);
  }

  return (
    <TextInput
      id="username"
      name="username"
      autoComplete="username"
      required
      placeholder="beminh"
      defaultValue={tenDienSan}
      onFocus={(e) => {
        vuaFocus.current = true;
        chonHetNeuConDienSan(e.currentTarget);
      }}
      onClick={(e) => {
        if (vuaFocus.current) chonHetNeuConDienSan(e.currentTarget);
        vuaFocus.current = false;
      }}
      onBlur={() => {
        vuaFocus.current = false;
      }}
      /* Điện thoại hay tự viết hoa chữ đầu và tự sửa chính tả -> tắt hết,
         không thì bé gõ "Beminh" và không đăng nhập được. */
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
    />
  );
}
