'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

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

/** Lựa chọn này, trên máy này, ra màu TỐI hay không. "Theo máy" thì hỏi máy. */
function raToi(chon: Chon): boolean {
  if (chon === 'toi') return true;
  if (chon === 'sang') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
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
  /*
   * Icon chỉ xoay khi NGƯỜI DÙNG BẤM, không phải mỗi lần nhãn đổi.
   *
   * Nhãn đổi cả lúc trang vừa tải: `useEffect` bên dưới đọc lựa chọn đã lưu rồi gán
   * vào, tức từ "Theo máy" sang "Tối" mà không ai bấm gì. Xoay theo nhãn thì người đã
   * chọn tối sẽ thấy cái mặt trăng quay một vòng MỖI LẦN MỞ TRANG — một cử động không
   * ai gây ra, ngay trên thanh điều hướng.
   */
  const [vuaBam, setVuaBam] = useState(false);

  useEffect(() => setChon(doc()), []);

  const key = chon ?? 'may';
  const nhan = NHAN[key];

  function bam() {
    const tiep = VONG[(VONG.indexOf(chon) + 1) % VONG.length];
    setVuaBam(true);

    /*
     * MỜ DẦN chứ không nháy, nhưng CHỈ khi màu thật sự đổi.
     *
     * Vòng của nút là Theo máy → Sáng → Tối. Trên một máy đang sáng, bước "Theo máy →
     * Sáng" không đổi một pixel màu nào; cho nó mờ dần là bắt cả trang diễn một cú
     * chuyển cảnh từ một màn hình sang chính nó, đọc ra như trang vừa tải lại.
     *
     * Dùng View Transitions chứ không `transition` màu trên từng phần tử: đổi giao
     * diện không chỉ đổi màu mà còn đổi CẢNH — mặt trời, mây, chim thành trăng và
     * sao — mà mấy thứ đó hiện/ẩn chứ không chuyển màu, nên chuyển màu từng phần tử
     * sẽ vẫn để cảnh nháy phựt ở giữa một trang đang mờ dần êm. View Transitions chụp
     * cả trang cũ và mờ nó vào trang mới, cảnh đi theo cùng một nhịp.
     *
     * Cái giá: trong 300ms đó khung game (iframe) là ảnh chụp, tức game đang chạy đứng
     * hình đúng ba phần mười giây. Chấp nhận được với một thao tác người ta chủ động
     * bấm, và chỉ xảy ra khi màu đổi.
     *
     * Ba trường hợp đổi TỨC THÌ như trước: màu không đổi, người dùng xin ít chuyển
     * động, và trình duyệt không có View Transitions. Không trường hợp nào hỏng gì.
     */
    const doiMau = raToi(chon) !== raToi(tiep);
    const itChuyenDong = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!doiMau || itChuyenDong || !('startViewTransition' in document)) {
      setChon(tiep);
      ap(tiep);
      return;
    }

    document.startViewTransition(() => {
      /* `flushSync`: trình duyệt chụp trang MỚI ngay khi hàm này trả về. Để React tự
         cập nhật như thường thì nhãn trên nút đổi SAU lúc chụp, và giữa cú mờ dần cái
         nút vẫn còn ghi "Sáng" trên một trang đã tối hẳn. */
      flushSync(() => setChon(tiep));
      ap(tiep);
    });
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
      {/* `key` theo lựa chọn để span được GẮN LẠI mỗi lần đổi — trình duyệt chỉ chạy
          animation khi lớp được gắn vào, không phải khi nó đang có sẵn. */}
      <span key={key} aria-hidden="true" className={vuaBam ? 'kg-doi-icon' : undefined}>
        {nhan.icon}
      </span>
      {/*
        BỀ RỘNG GIỮ CHỖ theo nhãn dài nhất ("Theo máy"), để nút không co giãn theo chữ.

        Đo được trước khi sửa: nút rộng 113 → 83 → 70px qua ba nhãn, nên "Bé đăng nhập"
        và "Bố mẹ" bên trái nhảy 30px rồi 13px mỗi lần bấm. Hồi đổi giao diện còn nháy
        tức thì thì cú nhảy lẫn vào cú nháy; có mờ dần thì nó lộ ra thành BÓNG ĐÔI —
        trang cũ và trang mới chồng lên nhau với hai nút ở hai chỗ lệch nhau, trông
        như thanh điều hướng bị vỡ.

        `text-left`: chữ ngắn nằm sát icon, phần giữ chỗ dồn về bên phải. Căn giữa thì
        khoảng cách giữa icon và chữ đổi theo nhãn, và mắt lại thấy nó xê dịch.
      */}
      <span className="hidden text-left text-sm sm:inline-block sm:min-w-16">{nhan.chu}</span>
    </button>
  );
}
