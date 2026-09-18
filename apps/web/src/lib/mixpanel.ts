import { createHmac, randomUUID } from 'node:crypto';

/**
 * Gửi sự kiện phễu đăng game sang Mixpanel — TỪ MÁY CHỦ, không có SDK nào trong trình
 * duyệt của bé (fen chốt 18/9).
 *
 * VÌ SAO KHÔNG DÙNG SDK: SDK của Mixpanel chạy trong trình duyệt, nghĩa là phải mở CSP
 * cho script của họ chạy trên máy của một đứa trẻ, và họ tự quyết gửi gì đi. Gửi từ máy
 * chủ thì mỗi byte rời khỏi đây đều nằm trong file này, đọc là thấy.
 *
 * VÌ SAO KHÔNG THAY UMAMI: Umami đếm lượt xem trang và không nối các bước thành hành
 * trình. Cái cần biết ở đây là bé RỚT Ở BƯỚC NÀO khi đăng game — chọn file xong có xem
 * thử không, xem thử xong có bấm Đăng không. Hai thứ trả lời hai câu hỏi khác nhau.
 *
 * BA LỚP GIỮ CHO DỮ LIỆU CỦA BÉ KHÔNG RA NGOÀI:
 *
 *  1. `distinct_id` là HMAC của id bé với một khoá chỉ máy chủ biết. Mixpanel không bao
 *     giờ thấy tên đăng nhập, email bố mẹ, hay id thật. Vẫn ổn định theo từng bé nên đo
 *     được giữ chân. THIẾU KHOÁ THÌ KHÔNG GỬI GÌ — chứ không rơi về id thật.
 *  2. Thuộc tính đi theo DANH SÁCH TRẮNG (`THUOC_TINH_CHO_PHEP`), toàn số và cờ đúng/sai.
 *     Không có chuỗi tự do nào, nên tên game hay lời bé gõ không có đường lọt sang.
 *  3. `$ip: '0'` tắt định vị theo IP. Không có nó thì Mixpanel gắn vị trí của VPS vào mọi
 *     sự kiện — vô nghĩa, vì đó là IP máy chủ chứ không phải của bé.
 *
 * TẮT LÀ MẶC ĐỊNH: thiếu `MIXPANEL_TOKEN` hoặc `MIXPANEL_ID_SALT` thì không một request
 * nào được gửi. Máy dev và mọi bộ kiểm chạy ở trạng thái đó, trừ bộ `e2e-mixpanel` tự
 * dựng máy chủ giả rồi trỏ `MIXPANEL_API` vào.
 */

const TOKEN_ENV = 'MIXPANEL_TOKEN';
const SALT_ENV = 'MIXPANEL_ID_SALT';
/** Đổi đích để bộ kiểm bắt được request; production để trống và dùng máy chủ Mỹ. */
const API_ENV = 'MIXPANEL_API';
const API_MAC_DINH = 'https://api.mixpanel.com';

const TIMEOUT_MS = 3000;

/**
 * Trần sự kiện mỗi phút cho cả tiến trình — cùng lý lẽ với `GLITCHTIP_MOI_PHUT`.
 *
 * Một vòng lặp hỏng hay một con bot bấm liên tục vào `/api/upload` bắn được hàng nghìn
 * sự kiện một phút; mỗi cái là một request mở ra ngoài. Quá trần thì bỏ im lặng: đây là
 * số liệu sản phẩm, mất vài sự kiện không ai chết, còn kéo sập máy chủ thì có.
 */
export const MIXPANEL_MOI_PHUT = 120;

/** Năm bước của phễu đăng game. Không thêm sự kiện nào ngoài danh sách này. */
export type SuKien = 'chon-file' | 'xem-thu-xong' | 'bam-dang' | 'dang-xong' | 'dang-loi';

/**
 * Thuộc tính được phép gửi kèm — DANH SÁCH TRẮNG, không phải danh sách đen.
 *
 * Danh sách đen là thứ luôn thiếu một dòng: ai đó thêm `title` vào lời gọi và không ai
 * thấy cho tới khi tên game của một đứa trẻ nằm trong dashboard của công ty khác.
 */
const THUOC_TINH_CHO_PHEP = new Set([
  /** Dung lượng file theo NHÓM, không phải byte: 'duoi-1mb' | '1-5mb' | '5-10mb' | 'tren-10mb'. */
  'nhom_dung_luong',
  /** Số bìa server vẽ ra được cho bản xem thử. */
  'so_bia',
  /** Bé có tự tải ảnh làm bìa không. */
  'bia_tu_tai',
  /** Mã lỗi của hệ thống (SB3_TOO_LARGE, PREVIEW_EXPIRED…), không phải câu báo lỗi. */
  'ma_loi',
  /** Thời gian máy chủ xử lý, mili giây. */
  'mili_giay',
]);

/** Nhóm dung lượng, để không gửi số byte (số byte là dấu vân tay của đúng một file). */
export function nhomDungLuong(byte: number): string {
  const mb = byte / (1024 * 1024);
  if (mb < 1) return 'duoi-1mb';
  if (mb < 5) return '1-5mb';
  if (mb < 10) return '5-10mb';
  return 'tren-10mb';
}

/**
 * Id giả danh cho Mixpanel: HMAC-SHA256(id bé, khoá), lấy 32 ký tự hex.
 *
 * Một chiều: có bảng id băm cũng không dò ngược ra bé nào nếu không có khoá. Ổn định:
 * cùng một bé thì lần nào cũng ra đúng chuỗi đó, nên phễu và giữ chân vẫn đo được.
 */
export function maAn(childId: string, salt = process.env[SALT_ENV]): string | null {
  const key = salt?.trim();
  if (!key || key.length < 16 || !childId) return null;
  return createHmac('sha256', key).update(childId).digest('hex').slice(0, 32);
}

let phutHienTai = 0;
let daGuiTrongPhut = 0;

/** Chỉ giữ thuộc tính nằm trong danh sách trắng, và chỉ kiểu nguyên thủy. */
function locThuocTinh(props: Record<string, unknown>): Record<string, string | number | boolean> {
  const ra: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!THUOC_TINH_CHO_PHEP.has(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) ra[k] = Math.round(v);
    else if (typeof v === 'boolean') ra[k] = v;
    /* Chuỗi: chỉ nhận dạng mã (chữ, số, gạch). Câu chữ tự do không bao giờ qua được. */
    else if (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v)) ra[k] = v;
  }
  return ra;
}

/**
 * Gửi một sự kiện. KHÔNG `await` ở nơi gọi — đây là số liệu, không phải việc của người
 * dùng: Mixpanel chậm thì bé phải chờ theo, và Mixpanel hỏng thì game không đăng được.
 * Hàm này không bao giờ ném.
 */
export function guiSuKien(ten: SuKien, childId: string, props: Record<string, unknown> = {}): void {
  void gui(ten, childId, props).catch(() => {});
}

/** Tách riêng để bộ kiểm gọi được và đọc được kết quả. */
export async function gui(
  ten: SuKien,
  childId: string,
  props: Record<string, unknown> = {}
): Promise<'da-gui' | 'tat' | 'qua-tran' | 'hong'> {
  const token = process.env[TOKEN_ENV]?.trim();
  const distinctId = maAn(childId);
  if (!token || !distinctId) return 'tat';

  const phut = Math.floor(Date.now() / 60000);
  if (phut !== phutHienTai) {
    phutHienTai = phut;
    daGuiTrongPhut = 0;
  }
  if (daGuiTrongPhut >= MIXPANEL_MOI_PHUT) return 'qua-tran';
  daGuiTrongPhut += 1;

  const goc = (process.env[API_ENV]?.trim() || API_MAC_DINH).replace(/\/+$/, '');
  try {
    const res = await fetch(`${goc}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          event: ten,
          properties: {
            token,
            distinct_id: distinctId,
            /* Mixpanel `/track` nhận `time` theo GIÂY. */
            time: Math.floor(Date.now() / 1000),
            /* Chống trùng khi request được thử lại — Mixpanel gộp theo `$insert_id`. */
            $insert_id: randomUUID(),
            $ip: '0',
            ...locThuocTinh(props),
          },
        },
      ]),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    /* Mixpanel trả 200 kèm thân "1" khi nhận, "0" khi bản ghi không hợp lệ — 200 KHÔNG
       có nghĩa là đã nhận, nên phải đọc thân. */
    const chu = (await res.text()).trim();
    return res.ok && chu.startsWith('1') ? 'da-gui' : 'hong';
  } catch {
    return 'hong';
  }
}
