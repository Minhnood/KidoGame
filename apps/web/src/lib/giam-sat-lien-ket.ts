/**
 * Ba bảng điều khiển theo dõi, gom về một chỗ trong khu quản trị.
 *
 * VÌ SAO KHÔNG NHÚNG IFRAME. Fen hỏi gộp ba trang vào `/admin`, và nhúng là cách trông
 * gọn nhất. Nhưng Umami và GlitchTip đều gửi header từ chối bị nhúng, gỡ header đó ra là
 * tự mở cửa cho kiểu tấn công lừa bấm; Mixpanel chặn hẳn; và cả ba vẫn đòi đăng nhập
 * riêng nên nhúng chỉ cho ra ba ô đăng nhập nằm cạnh nhau. Nặng hơn cả: khu quản trị
 * nằm ở origin riêng CỐ Ý, để một lỗ hổng ở trang công khai không với tới phiên admin —
 * nhúng dịch vụ ngoài vào đúng origin đó là phá chính quyết định ấy.
 *
 * Nên trang này chỉ làm một việc: nói ba cái đó ở đâu, trả lời câu hỏi gì, và còn sống
 * không. Bấm vào là mở tab mới, đăng nhập ở nhà của nó.
 *
 * TỰ DÒ THAY VÌ TIN CẤU HÌNH: `STATS_ORIGIN` có giá trị không có nghĩa là Umami đang
 * chạy. Container chết, chứng chỉ hết hạn, Caddy cấu hình sai — cả ba trường hợp cấu
 * hình vẫn đẹp. Một cú gọi thật là thứ duy nhất phân biệt được.
 */

/** 2,5 giây: trang quản trị không được treo vì một dịch vụ phụ đang chết. */
const TIMEOUT_MS = 2500;

export type TrangThai = 'song' | 'chet' | 'chua-cau-hinh' | 'khong-do-duoc';

export interface LienKetGiamSat {
  id: string;
  ten: string;
  /** Câu hỏi mà công cụ này trả lời — để người trực biết khi nào cần mở cái nào. */
  cauHoi: string;
  noiDat: string;
  url: string;
  trangThai: TrangThai;
}

/**
 * Gọi thử một địa chỉ. Chỉ hỏi "có ai trả lời không", không hỏi trả lời cái gì.
 *
 * Nhận MỌI mã dưới 500, kể cả 302 và 403: trang đăng nhập của Umami trả 200, GlitchTip
 * đá sang trang đăng nhập bằng 302, và cả hai đều nghĩa là dịch vụ đang sống. Chỉ 5xx
 * và lỗi mạng mới là chết.
 */
async function con(url: string): Promise<TrangThai> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'manual',
      cache: 'no-store',
    });
    return res.status < 500 ? 'song' : 'chet';
  } catch {
    return 'chet';
  }
}

/**
 * `env` truyền vào được, không đọc thẳng `process.env`, để bộ kiểm dựng đủ bốn trạng
 * thái mà không phải khởi động lại máy chủ với bộ biến khác.
 */
export async function docLienKetGiamSat(
  env: Record<string, string | undefined> = process.env
): Promise<LienKetGiamSat[]> {
  const stats = env.STATS_ORIGIN?.trim() ?? '';
  const loi = env.ERRORS_ORIGIN?.trim() ?? '';
  /* Mixpanel bật khi và chỉ khi đủ cả hai biến — cùng điều kiện với `lib/mixpanel.ts`
     và với đoạn khai trên `/dieu-khoan`. Ba chỗ cùng một câu hỏi là cố ý. */
  const mixpanelBat = !!env.MIXPANEL_TOKEN?.trim() && !!env.MIXPANEL_ID_SALT?.trim();

  const [tThong, tLoi] = await Promise.all([
    stats ? con(stats) : Promise.resolve<TrangThai>('chua-cau-hinh'),
    /* `/_health/` chứ không phải trang chủ: GlitchTip trả 302 về trang đăng nhập ở gốc,
       còn đường này trả 200 gọn và là đúng đường mà bước canh gác hằng đêm đang dùng. */
    loi ? con(`${loi.replace(/\/+$/, '')}/_health/`) : Promise.resolve<TrangThai>('chua-cau-hinh'),
  ]);

  return [
    {
      id: 'umami',
      ten: 'Umami',
      cauHoi: 'Có ai vào web không, họ xem trang nào?',
      noiDat: 'Tự host trên VPS',
      url: stats,
      trangThai: tThong,
    },
    {
      id: 'glitchtip',
      ten: 'GlitchTip',
      cauHoi: 'Máy chủ có đang lỗi không, lỗi ở đâu?',
      noiDat: 'Tự host trên VPS',
      url: loi ? `${loi.replace(/\/+$/, '')}/` : '',
      trangThai: tLoi,
    },
    {
      id: 'mixpanel',
      ten: 'Mixpanel',
      cauHoi: 'Bé rớt ở bước nào khi đăng game?',
      noiDat: 'Dịch vụ ngoài, đặt tại Mỹ',
      url: 'https://mixpanel.com/',
      /*
       * KHÔNG gọi thử Mixpanel. Hai lý do: gọi API của họ cần chìa khoá riêng (khác
       * token gửi sự kiện), và mỗi lần mở trang quản trị mà bắn một request ra công ty
       * khác là thêm một đường rò không cần thiết. Ở đây chỉ nói ĐANG BẬT hay CHƯA —
       * còn nó có nhận được sự kiện không thì `e2e-mixpanel` đã đọc từng byte gửi đi.
       */
      trangThai: mixpanelBat ? 'khong-do-duoc' : 'chua-cau-hinh',
    },
  ];
}
