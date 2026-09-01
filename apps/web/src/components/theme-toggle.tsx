'use client';

import { useEffect, useState } from 'react';

/**
 * Nút đổi giao diện sáng / tối.
 *
 * BA lựa chọn, không phải hai. "Theo máy" phải là một lựa chọn thật và phải quay
 * lại được: điện thoại thường tự chuyển tối vào buổi tối, và một cái nút hai trạng
 * thái sẽ khoá người dùng ra khỏi hành vi đó mãi mãi ngay lần đầu họ tò mò bấm thử.
 *
 * Ghi vào localStorage chứ không phải cookie, cố ý: đây là sở thích của từng máy,
 * không phải của tài khoản (bé dùng máy bố mẹ vào buổi tối là chuyện thường). Cookie
 * còn bị gửi kèm mọi request và ép server phải render khác nhau cho hai giao diện.
 */

const KHOA = 'kidogame-theme';

/** Giá trị lưu trong localStorage. Không có gì = theo máy. */
type Chon = 'sang' | 'toi' | null;

const VONG: Chon[] = [null, 'sang', 'toi'];

const NHAN: Record<string, { icon: string; chu: string }> = {
  may: { icon: '🖥️', chu: 'Theo máy' },
  sang: { icon: '☀️', chu: 'Sáng' },
  toi: { icon: '🌙', chu: 'Tối' },
};

function doc(): Chon {
  try {
    const v = localStorage.getItem(KHOA);
    return v === 'sang' || v === 'toi' ? v : null;
  } catch {
    // Trình duyệt chặn site data, hoặc cửa sổ riêng tư. Không phải lỗi cần báo:
    // giao diện vẫn chạy theo cài đặt của máy, chỉ là không nhớ được lựa chọn.
    return null;
  }
}

function ap(chon: Chon): void {
  const root = document.documentElement;
  if (chon === 'sang') root.dataset.theme = 'light';
  else if (chon === 'toi') root.dataset.theme = 'dark';
  else delete root.dataset.theme;

  try {
    if (chon) localStorage.setItem(KHOA, chon);
    else localStorage.removeItem(KHOA);
  } catch {
    /* xem `doc()` */
  }
}

export function ThemeToggle() {
  /*
   * Khởi tạo là null (theo máy) chứ không đọc localStorage ngay trong useState:
   * server không có localStorage, nên đọc ở đây sẽ làm HTML của server và lần
   * render đầu của client khác nhau — React sẽ báo lệch hydration.
   *
   * Hệ quả nhìn thấy được: với người ĐÃ tự chọn, nhãn trên nút hiện "Theo máy"
   * trong chớp mắt rồi mới đúng. Chỉ cái NHÃN lệch, không phải màu — màu do script
   * trong layout gốc đặt xong trước cả khung hình đầu tiên.
   */
  const [chon, setChon] = useState<Chon>(null);

  useEffect(() => setChon(doc()), []);

  const key = chon ?? 'may';
  const nhan = NHAN[key];

  function bam() {
    const tiep = VONG[(VONG.indexOf(chon) + 1) % VONG.length];
    setChon(tiep);
    ap(tiep);
  }

  return (
    <button
      type="button"
      onClick={bam}
      data-testid="theme-toggle"
      data-theme-choice={key}
      /* Nói cả trạng thái hiện tại: người dùng trình đọc màn hình không thấy icon,
         mà chỉ nghe "đổi giao diện" thì không biết đang ở giao diện nào. */
      aria-label={`Đổi giao diện — đang dùng: ${nhan.chu}`}
      title={`Giao diện: ${nhan.chu}`}
      /* Cùng kiểu với các mục chữ khác trên thanh nav (xem `MUC_CHU` trong
         `site-nav.tsx`): trỏ vào thì hiện nền bo tròn, không chỉ đậm chữ lên. Chép
         lại chuỗi class chứ không import: nút này là client component, còn `SiteNav`
         là server component — import qua lại giữa hai bên chỉ để lấy một chuỗi thì
         kéo cả module sang bundle của client. */
      className="min-h-touch inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-transparent px-2 font-semibold text-chrome-ink/80 transition-colors hover:bg-chrome-lift hover:text-chrome-ink sm:px-3"
    >
      <span aria-hidden="true">{nhan.icon}</span>
      <span className="hidden text-sm sm:inline">{nhan.chu}</span>
    </button>
  );
}
