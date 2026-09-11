/**
 * Lời nhắn để lại dưới game của một bé khác — CHỌN TỪ BỘ CÂU, không gõ tự do.
 *
 * ═══ VÌ SAO KHÔNG CÓ Ô NHẬP CHỮ ═══
 *
 * Mọi trang khác đều cho gõ, nên việc không cho gõ trông như thiếu tính năng. Nó
 * không phải. Một ô nhập chữ trên trang mà cả người viết lẫn người đọc đều là trẻ
 * con là một ô kiểm duyệt: nó đòi có người lớn đọc từng dòng, suốt cả ngày, kể cả
 * lúc 11 giờ đêm — và giữa hai lượt đọc ấy thì câu chửi vẫn đang nằm trên màn hình
 * đứa trẻ bị nhắm tới. Hàng đợi kiểm duyệt dọn được hậu quả; nó không ngăn được
 * việc đứa trẻ đó ĐÃ ĐỌC.
 *
 * Bộ câu đóng làm cho chuyện đó không xảy ra được, thay vì xảy ra rồi mới dọn. Đổi
 * lại là mất khả năng nói một câu riêng — chấp nhận, và đó cũng chính là thứ khiến
 * trang này không có đường nhắn riêng cho ai.
 *
 * ═══ MỌI CÂU ĐỀU LÀ LỜI KHEN, VÀ KHÔNG CÂU NÀO MƠ HỒ ═══
 *
 * Cùng một luật đã dựng cho hàng icon ở `phan-ung.ts`: không có đường nào trong sản
 * phẩm để một đứa trẻ làm đứa khác thấy tệ hơn. Nên bộ dưới đây không chỉ bỏ các
 * câu chê — nó bỏ cả những câu ĐỌC ĐƯỢC THEO HAI NGHĨA, vì một câu hai nghĩa chính
 * là bắt nạt kèm sẵn lời chối.
 *
 * Đã cân nhắc rồi loại, dù nghe vô hại:
 *   · "Tớ cười suốt!"      — cười vì hay, hay cười vào mặt nhau? Đúng cái bẫy của 😂.
 *   · "Khó quá!"           — khen game thử thách, hay chê game chơi không nổi?
 *   · "Cố lên nhé!"        — ngụ ý game chưa tốt, dù người nhắn không định vậy.
 *   · "Nhạc hay nè!"       — game không có nhạc thì câu này thành trêu.
 *
 * ═══ VÌ SAO TÁM CÂU, VÀ TRÙNG Ý VỚI ICON THÌ SAO ═══
 *
 * Tám là nhiều nhất còn đọc hết được trước khi chọn. Ít hơn thì mọi game trông
 * giống nhau; nhiều hơn thì đứa trẻ bấm đại cái đầu tiên, và lúc đó lời khen không
 * còn nói lên gì nữa.
 *
 * Vài câu trùng ý với nhãn icon ("Vẽ đẹp ghê!" cạnh icon 🎨 "Vẽ đẹp") — giữ có chủ
 * ý. Icon là con số vô danh; lời nhắn CÓ TÊN của bạn đứng sau. "Ba bạn thả 🎨" và
 * "kubin nói: Vẽ đẹp ghê!" không phải một thứ nói hai lần, khác hẳn trường hợp nút
 * tim với icon ❤️ mà `phan-ung.ts` đã gộp lại làm một.
 */

import { prisma } from './db';

export interface CauNhan {
  /** Mã lưu trong DB. Không bao giờ đổi — đổi là mất dữ liệu cũ. */
  ma: string;
  /** Câu hiển thị. Sửa được tự do, dữ liệu cũ vẫn đúng. */
  chu: string;
}

/**
 * Thứ tự cố định, và không sắp theo độ phổ biến: hàng đầu là ba câu nói về GAME,
 * hàng sau là những câu nói về BẠN làm ra game. Đứa trẻ đọc lướt từ trái sang phải
 * sẽ gặp "game thế nào" trước "bạn thế nào", đúng thứ tự nó vừa trải qua.
 */
export const LOI_NHAN: readonly CauNhan[] = [
  { ma: 'hay-qua', chu: 'Hay quá!' },
  { ma: 'vui-lam', chu: 'Game vui lắm!' },
  { ma: 'dep-ghe', chu: 'Vẽ đẹp ghê!' },
  { ma: 'choi-mai', chu: 'Tớ chơi mãi không chán!' },
  { ma: 'y-tuong-hay', chu: 'Ý tưởng hay ghê!' },
  { ma: 'gioi-qua', chu: 'Bạn giỏi quá đi!' },
  { ma: 'muon-nhu-ban', chu: 'Tớ muốn làm được như bạn!' },
  { ma: 'lam-them', chu: 'Làm thêm game nữa nhé!' },
] as const;

const MA_HOP_LE = new Set(LOI_NHAN.map((c) => c.ma));

/**
 * Mã này có trong bộ không.
 *
 * Chốt ở tầng ứng dụng chứ không phải enum trong DB, cùng lý do như `laIconHopLe`:
 * thêm một câu sau này là sửa một mảng, không phải chạy migration trên máy chủ đang
 * phục vụ người thật. Đổi lại phải tự kiểm — đây là chỗ tự kiểm đó, và nó là thứ
 * duy nhất đứng giữa bộ câu đóng với một cột chữ tự do.
 */
export function laCauHopLe(ma: string): boolean {
  return MA_HOP_LE.has(ma);
}

export function timCau(ma: string): CauNhan | undefined {
  return LOI_NHAN.find((c) => c.ma === ma);
}

export interface MotLoiNhan {
  childId: string;
  /** Tên hiển thị của bé đã nhắn. */
  tenBe: string;
  /** MÃ câu, không phải câu chữ — nơi hiển thị tự tra qua `timCau`. */
  cau: string;
}

export interface TomTatLoiNhan {
  /** Mới nhất trước, tối đa `SO_DONG_HIEN` dòng. */
  danhSach: MotLoiNhan[];
  /** Tổng số lời nhắn, kể cả phần không nằm trong `danhSach`. */
  tong: number;
  /** Mã câu mà bé đang đăng nhập đã nhắn cho game này, hoặc null. */
  cuaToi: string | null;
}

export const TOM_TAT_LOI_NHAN_RONG: TomTatLoiNhan = { danhSach: [], tong: 0, cuaToi: null };

/**
 * Hiện nhiều nhất chừng này dòng.
 *
 * Không phải để tiết kiệm truy vấn — mỗi bé chỉ một dòng nên con số này cũng là số
 * bạn đã ghé. Nó là để trang game không biến thành một cột dài vô tận đẩy phần
 * "game khác của bé" ra khỏi tầm mắt.
 */
export const SO_DONG_HIEN = 30;

/* ══════════════════════════════════════════════════════════════════════════
 * Đọc / ghi
 * ═══════════════════════════════════════════════════════════════════════ */

/** Game ở trạng thái này thì không ai nhắn được nữa. */
const KHONG_NHAN_LOI = new Set<string>(['REMOVED']);

export class LoiNhanError extends Error {}

/**
 * Lời nhắn của MỘT game.
 *
 * `childId` null (khách, hoặc phụ huynh đang xem) vẫn đọc được danh sách — chỉ
 * `cuaToi` là null. Xem được mà không nhắn được là đúng ý đồ, y như hàng icon: đây
 * là lời các BẠN nói với nhau, và nó chỉ giữ nghĩa đó nếu người nhắn đều là bạn.
 */
export async function docLoiNhan(gameId: string, childId: string | null): Promise<TomTatLoiNhan> {
  const [hang, tong] = await Promise.all([
    prisma.compliment.findMany({
      where: { gameId },
      orderBy: { createdAt: 'desc' },
      take: SO_DONG_HIEN,
      select: { childId: true, phrase: true, child: { select: { displayName: true } } },
    }),
    prisma.compliment.count({ where: { gameId } }),
  ]);

  const danhSach: MotLoiNhan[] = [];
  for (const h of hang) {
    // Bỏ qua mã không còn trong bộ — xảy ra khi có ai gỡ một câu khỏi `LOI_NHAN` mà
    // hàng cũ vẫn nằm trong DB. Hiện một dòng trống mang tên một đứa trẻ còn tệ hơn
    // là không hiện gì.
    if (!MA_HOP_LE.has(h.phrase)) continue;
    danhSach.push({ childId: h.childId, tenBe: h.child.displayName, cau: h.phrase });
  }

  /*
   * `cuaToi` đọc riêng chứ không dò trong `danhSach`: bé nhắn từ lâu, mà sau đó có
   * hơn 30 bạn khác nhắn, thì hàng của bé đã rơi khỏi trang đầu — dò trong danh
   * sách sẽ kết luận "chưa nhắn gì" và cả hàng nút hiện ra như chưa ai bấm. Bé bấm
   * tiếp, `nhanLoi` thấy hàng cũ và hiểu là ĐỔI CÂU, còn bé thì tưởng vừa nhắn lần
   * đầu.
   */
  const cua = childId
    ? await prisma.compliment.findUnique({
        where: { gameId_childId: { gameId, childId } },
        select: { phrase: true },
      })
    : null;

  return { danhSach, tong, cuaToi: cua?.phrase ?? null };
}

/**
 * Nhắn, đổi câu, hoặc gỡ. Trả về tóm tắt MỚI để nơi gọi vẽ lại ngay.
 *
 * Ba nhánh, giống hệt `thaIcon` và cố ý giống — hai hàng nút nằm cạnh nhau trên
 * cùng một trang thì phải phản ứng cùng một kiểu, nếu không thì đứa trẻ học được
 * luật ở hàng này rồi áp sang hàng kia và thấy nó "hỏng":
 *   - chưa nhắn gì       -> nhắn `ma`
 *   - đang nhắn `ma`     -> GỠ (bấm lại câu đang sáng là bỏ)
 *   - đang nhắn câu khác -> ĐỔI sang `ma`
 *
 * ═══ KHÔNG NHẮN ĐƯỢC CHO GAME CỦA CHÍNH MÌNH ═══
 *
 * Đây là chỗ CỐ Ý KHÁC với icon, nơi tự thả được và có lý do đàng hoàng. Khác biệt
 * nằm ở cái tên: icon là con số vô danh, tự thả một cái thì không ai biết và cũng
 * chẳng ai mất gì. Lời nhắn thì hiện "kubin: Bạn giỏi quá đi!" ngay dưới game của
 * chính kubin — và thứ đứa trẻ khác đọc được ở đó không phải lời khen mà là một
 * chuyện buồn cười, nằm lại đó vĩnh viễn dưới tên nó.
 *
 * Chặn một hành động thì phải giải thích được cho đứa bảy tuổi. Câu này giải thích
 * được: "đây là game của bạn, chờ các bạn khác nhắn nhé". Câu tương ứng cho icon
 * thì không — nên icon không chặn.
 */
export async function nhanLoi(
  gameId: string,
  childId: string,
  ma: string
): Promise<TomTatLoiNhan> {
  if (!MA_HOP_LE.has(ma)) throw new LoiNhanError('Câu này không có trong bộ.');

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, childId: true },
  });
  if (!game) throw new LoiNhanError('Không tìm thấy game.');
  /*
   * Hai lớp chốt, và lớp này là lớp dữ liệu. Trang đã ẩn nút đi rồi, nhưng ẩn nút
   * là giao diện — ai mở DevTools cũng gọi thẳng được server action. Chốt duy nhất
   * đáng tin là chốt nằm trên đường GHI.
   */
  if (KHONG_NHAN_LOI.has(game.status)) throw new LoiNhanError('Game này không còn nhận lời nhắn.');
  if (game.childId === childId) {
    throw new LoiNhanError('Đây là game của bạn — chờ các bạn khác nhắn nhé!');
  }

  const dangCo = await prisma.compliment.findUnique({
    where: { gameId_childId: { gameId, childId } },
    select: { phrase: true },
  });

  if (dangCo?.phrase === ma) {
    await prisma.compliment.delete({ where: { gameId_childId: { gameId, childId } } });
  } else {
    /*
     * `upsert` chứ không phải "xoá rồi tạo": cặp xoá/tạo có một khe ở giữa, và một
     * lượt đọc rơi vào khe đó thấy lời nhắn biến mất rồi hiện lại. Một câu lệnh,
     * khoá chính ghép lo phần duy nhất.
     */
    await prisma.compliment.upsert({
      where: { gameId_childId: { gameId, childId } },
      create: { gameId, childId, phrase: ma },
      update: { phrase: ma },
    });
  }

  return docLoiNhan(gameId, childId);
}
