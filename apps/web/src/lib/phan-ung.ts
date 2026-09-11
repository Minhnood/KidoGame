/**
 * Thả icon lên game. "Thích" là icon `tim` trong chính bộ này, không phải cơ chế
 * riêng — lý do ghi ở `model Reaction` trong schema.
 *
 * ═══ MỌI ICON ĐỀU LÀ LỜI KHEN, VÀ ĐÓ LÀ QUYẾT ĐỊNH QUAN TRỌNG NHẤT Ở ĐÂY ═══
 *
 * Không có 👎, không có 😂, không có 🤮. Trên một trang mà người thả là trẻ con và
 * người nhận cũng là trẻ con, một icon tiêu cực không phải là "phản hồi" — nó là
 * công cụ bắt nạt kèm sẵn lời chối: *"em có nói gì đâu, em bấm cái mặt cười thôi
 * mà"*. Người lớn đọc 😂 dưới một game là đùa vui; đứa trẻ làm ra game đó đọc nó là
 * chê cười, và không ai phân xử được vì chẳng có chữ nào để chỉ vào.
 *
 * `😂` bị loại có chủ ý dù nó vô hại ở mọi nơi khác. Nó là icon mơ hồ nhất trong
 * các icon phổ biến: cùng một hình, "buồn cười quá hay!" và "cười vào mặt mày" dùng
 * chung. Bộ dưới đây cố ý chọn những cái **chỉ đọc được theo một nghĩa**.
 *
 * Hệ quả: con số dưới game là "bao nhiêu bạn thấy hay", không bao giờ là điểm bị
 * trừ. Không có đường nào trong sản phẩm để một đứa trẻ làm đứa khác thấy tệ hơn.
 * Muốn báo nội dung xấu thì đã có nút báo cáo, và nó đi tới người lớn chứ không
 * hiện ra trước mặt tác giả.
 *
 * ═══ VÌ SAO LƯU MÃ, KHÔNG LƯU EMOJI ═══
 *
 * Cột `icon` giữ `tim`, `vui`… chứ không giữ ký tự. Một emoji có nhiều cách mã hoá
 * (biến thể màu da, chuỗi ZWJ), nên hai hàng trông giống hệt nhau vẫn có thể là hai
 * chuỗi khác nhau — và lúc đó `groupBy` đếm ra hai nhóm cho cùng một icon. Lưu mã
 * thì đổi hình vẽ sau này chỉ là sửa bảng dưới đây, dữ liệu cũ vẫn đúng.
 */

import { prisma } from './db';

export interface Icon {
  /** Mã lưu trong DB. Không bao giờ đổi — đổi là mất dữ liệu cũ. */
  ma: string;
  /** Ký tự hiển thị. Đổi được tự do. */
  ky_tu: string;
  /**
   * Nhãn cho trình đọc màn hình VÀ cho tooltip.
   *
   * Bắt buộc, không phải trang trí: một nút chỉ chứa emoji thì trình đọc màn hình
   * đọc ra tên Unicode ("face with tears of joy"), tức đứa trẻ dùng trình đọc nghe
   * được một câu hoàn toàn khác với đứa trẻ nhìn thấy.
   */
  nhan: string;
}

/**
 * Năm icon, và con số năm là có lý do: đây là một HÀNG NÚT trên màn hình điện thoại.
 * Bảy tám cái thì hàng bị cuốn xuống dòng hoặc mỗi nút bé lại tới mức ngón tay trẻ
 * con bấm nhầm sang cái bên cạnh — mà bấm nhầm ở đây là thả nhầm lời khen, rồi phải
 * bấm lại lần nữa để gỡ.
 *
 * Thứ tự cố định và `tim` đứng đầu: nó là cái được bấm nhiều nhất, và vị trí đầu
 * hàng là chỗ ngón cái với tới dễ nhất.
 */
export const ICONS: readonly Icon[] = [
  { ma: 'tim', ky_tu: '❤️', nhan: 'Thích' },
  { ma: 'vui', ky_tu: '😄', nhan: 'Vui quá' },
  { ma: 'bat-ngo', ky_tu: '😮', nhan: 'Bất ngờ' },
  { ma: 'dep', ky_tu: '🎨', nhan: 'Vẽ đẹp' },
  { ma: 'gioi', ky_tu: '🏆', nhan: 'Giỏi ghê' },
] as const;

const MA_HOP_LE = new Set(ICONS.map((i) => i.ma));

/**
 * Mã này có trong bộ không.
 *
 * Chốt ở tầng ứng dụng chứ không phải enum trong DB, cố ý: thêm một icon mới sau này
 * là sửa một mảng, không phải chạy migration trên máy chủ đang phục vụ người thật.
 * Đổi lại phải tự kiểm — và đây là chỗ tự kiểm đó.
 */
export function laIconHopLe(ma: string): boolean {
  return MA_HOP_LE.has(ma);
}

export function timIcon(ma: string): Icon | undefined {
  return ICONS.find((i) => i.ma === ma);
}

/** Số lượt theo từng mã icon, cộng với icon mà NGƯỜI ĐANG XEM đã thả (nếu có). */
export interface TomTatPhanUng {
  /** `{ tim: 3, vui: 1 }` — chỉ chứa mã có ít nhất một lượt. */
  dem: Record<string, number>;
  tong: number;
  /** Mã icon bé đang đăng nhập đã thả cho game này, hoặc null. */
  cuaToi: string | null;
}

export const TOM_TAT_RONG: TomTatPhanUng = { dem: {}, tong: 0, cuaToi: null };

/* ══════════════════════════════════════════════════════════════════════════
 * Đọc / ghi
 * ═══════════════════════════════════════════════════════════════════════ */

/** Game ở trạng thái này thì không ai thả icon được nữa. */
const KHONG_NHAN_ICON = new Set<string>(['REMOVED']);

export class PhanUngError extends Error {}

/**
 * Tóm tắt icon của MỘT game.
 *
 * `childId` null (khách, hoặc phụ huynh đang xem) thì vẫn đọc được số đếm — chỉ
 * `cuaToi` là null. Xem được số mà không thả được là đúng ý đồ: con số nói "mấy bạn
 * thấy hay", và nó chỉ giữ nghĩa đó nếu người thả đều là bạn.
 */
export async function docPhanUng(gameId: string, childId: string | null): Promise<TomTatPhanUng> {
  const [nhom, cua] = await Promise.all([
    prisma.reaction.groupBy({ by: ['icon'], where: { gameId }, _count: { icon: true } }),
    childId
      ? prisma.reaction.findUnique({
          where: { gameId_childId: { gameId, childId } },
          select: { icon: true },
        })
      : Promise.resolve(null),
  ]);

  const dem: Record<string, number> = {};
  let tong = 0;
  for (const n of nhom) {
    // Bỏ qua mã không còn trong bộ. Xảy ra khi có ai gỡ một icon khỏi `ICONS` mà
    // hàng cũ vẫn nằm trong DB — hiện số của một icon không vẽ được ra gì thì trang
    // hiện một ô trống không ai bấm được.
    if (!MA_HOP_LE.has(n.icon)) continue;
    dem[n.icon] = n._count.icon;
    tong += n._count.icon;
  }

  return { dem, tong, cuaToi: cua?.icon ?? null };
}

/**
 * Tóm tắt cho NHIỀU game trong một truy vấn — dùng cho trang chủ và các danh sách.
 *
 * Có hàm riêng chứ không gọi `docPhanUng` trong vòng lặp, vì vòng lặp đó là N+1:
 * trang chủ 20 game thành 40 truy vấn. Ở quy mô hiện tại vẫn chạy được, và đó chính
 * là lý do phải viết đúng ngay bây giờ — loại chậm này không bao giờ đỏ, nó chỉ làm
 * trang nặng dần cho tới lúc không ai nhớ vì sao.
 *
 * KHÔNG trả `cuaToi`: danh sách chỉ hiện tổng số. Muốn biết mình đã thả gì thì vào
 * trang game — và nhờ vậy hàm này không cần biết ai đang xem.
 */
export async function demPhanUngNhieuGame(
  gameIds: string[]
): Promise<Record<string, { tong: number; dem: Record<string, number> }>> {
  const ketQua: Record<string, { tong: number; dem: Record<string, number> }> = {};
  if (gameIds.length === 0) return ketQua;

  const nhom = await prisma.reaction.groupBy({
    by: ['gameId', 'icon'],
    where: { gameId: { in: gameIds } },
    _count: { icon: true },
  });

  for (const n of nhom) {
    if (!MA_HOP_LE.has(n.icon)) continue;
    const o = (ketQua[n.gameId] ??= { tong: 0, dem: {} });
    o.dem[n.icon] = n._count.icon;
    o.tong += n._count.icon;
  }
  return ketQua;
}

/**
 * Thả, đổi, hoặc gỡ icon. Trả về tóm tắt MỚI để nơi gọi vẽ lại ngay.
 *
 * Ba nhánh, và cả ba đều là cùng một cú bấm với người dùng:
 *   - chưa thả gì      -> thả `ma`
 *   - đang thả `ma`    -> GỠ (bấm lại cái đang sáng là bỏ)
 *   - đang thả icon khác -> ĐỔI sang `ma`
 *
 * "Bấm lại để gỡ" là cách duy nhất để rút lại, và nó phải có: trẻ con bấm nhầm liên
 * tục, mà một lời khen không rút lại được thì cái nút đó đáng sợ chứ không vui.
 *
 * CHO PHÉP THẢ ICON LÊN GAME CỦA CHÍNH MÌNH, có chủ ý. Nó làm lệch số đếm đúng 1
 * đơn vị cho mỗi game — không đáng kể, và chưa có bảng xếp hạng nào để nó bóp méo.
 * Đổi lại, chặn thì phải giải thích cho một đứa bảy tuổi vì sao nó không được thích
 * thứ nó vừa làm ra, và không có câu trả lời nào nghe hợp lý với đứa trẻ đó.
 */
export async function thaIcon(
  gameId: string,
  childId: string,
  ma: string
): Promise<TomTatPhanUng> {
  if (!MA_HOP_LE.has(ma)) throw new PhanUngError('Icon không hợp lệ.');

  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { status: true } });
  if (!game) throw new PhanUngError('Không tìm thấy game.');
  // Game đã gỡ thì trang của nó cũng không mở được nữa; chốt ở đây là để đường ghi
  // không dựa vào việc trang đã chặn. Hai lớp, vì lớp trang là giao diện còn lớp
  // này là dữ liệu.
  if (KHONG_NHAN_ICON.has(game.status)) throw new PhanUngError('Game này không còn nhận icon.');

  const dangCo = await prisma.reaction.findUnique({
    where: { gameId_childId: { gameId, childId } },
    select: { icon: true },
  });

  if (dangCo?.icon === ma) {
    await prisma.reaction.delete({ where: { gameId_childId: { gameId, childId } } });
  } else {
    /*
     * `upsert` chứ không phải "xoá rồi tạo": hai bé bấm cùng lúc thì cặp xoá/tạo có
     * một khe ở giữa, và khe đó đủ để một lượt đọc thấy trạng thái không tồn tại
     * bao giờ. `upsert` là một câu lệnh, khoá chính ghép đã bảo đảm duy nhất.
     */
    await prisma.reaction.upsert({
      where: { gameId_childId: { gameId, childId } },
      create: { gameId, childId, icon: ma },
      update: { icon: ma },
    });
  }

  return docPhanUng(gameId, childId);
}
