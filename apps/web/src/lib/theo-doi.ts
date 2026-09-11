/**
 * Theo dõi một bạn để thấy game mới của bạn ấy — ẨN DANH MỘT NỬA.
 *
 * ═══ FILE NÀY CỐ Ý THIẾU MỘT HÀM ═══
 *
 * Không có `demNguoiTheoDoi()`, không có `docNguoiTheoDoi()`. Chiều "ai đang theo
 * dõi tôi" không đọc được từ bất cứ đâu trong sản phẩm, kể cả bởi chính người được
 * theo dõi, kể cả dưới dạng một con số.
 *
 * Bỏ đi không phải vì khó viết — nó là hai dòng. Bỏ vì một hàm như thế tồn tại thì
 * sớm muộn có người gọi nó ra một cái nhãn "3 bạn đang theo dõi bạn", và lúc ấy
 * quyết định sản phẩm đã mất mà không ai nhận ra mình vừa làm gì. Chỗ rẻ nhất để
 * giữ một quyết định là chỗ cái hàm không tồn tại.
 *
 * Vì sao quyết định đó đáng giữ: một con số đếm người hâm mộ biến trang này thành
 * bảng xếp hạng độ nổi tiếng giữa những đứa trẻ, và bảng xếp hạng nào cũng có đứa
 * đứng cuối. Cùng lập luận đã loại 👎 khỏi hàng icon và loại ô gõ chữ khỏi lời
 * nhắn: không có đường nào trong sản phẩm để một đứa trẻ thấy mình tệ hơn.
 *
 * Thứ bé nhận lại khi theo dõi là một thứ khác hẳn con số: game mới của bạn ấy tự
 * hiện ra ở trang chủ. Đó là toàn bộ lợi ích, và nó nằm hoàn toàn ở phía người đi
 * theo dõi.
 */

import { prisma } from './db';

export class TheoDoiError extends Error {}

/** Bé này có đang theo dõi tác giả kia không. */
export async function dangTheoDoi(followerId: string, authorId: string): Promise<boolean> {
  const co = await prisma.follow.findUnique({
    where: { followerId_authorId: { followerId, authorId } },
    select: { followerId: true },
  });
  return co !== null;
}

export interface BanDangTheoDoi {
  authorId: string;
  ten: string;
  /** Số game công khai của bạn ấy — để trang danh sách không chỉ toàn tên suông. */
  soGame: number;
}

/**
 * Danh sách bé này đang theo dõi. CHỈ bé đó đọc được — nơi gọi phải bảo đảm điều đó.
 *
 * Trả về cả số game vì trang `/ban-be` mà chỉ có một cột tên thì không giúp bé nhớ
 * ra bạn ấy là ai. Đếm bằng `groupBy` một lượt, không `_count` lồng trong include —
 * cái đó sinh một truy vấn con cho mỗi hàng.
 */
export async function docDangTheoDoi(followerId: string): Promise<BanDangTheoDoi[]> {
  const hang = await prisma.follow.findMany({
    where: { followerId },
    orderBy: { createdAt: 'desc' },
    select: { authorId: true, author: { select: { displayName: true } } },
  });
  if (hang.length === 0) return [];

  const nhom = await prisma.game.groupBy({
    by: ['childId'],
    where: { childId: { in: hang.map((h) => h.authorId) }, status: 'PUBLISHED' },
    _count: { childId: true },
  });
  const soGame = new Map(nhom.map((n) => [n.childId, n._count.childId]));

  return hang.map((h) => ({
    authorId: h.authorId,
    ten: h.author.displayName,
    soGame: soGame.get(h.authorId) ?? 0,
  }));
}

/** Bé này đang theo dõi bao nhiêu bạn. Chiều ngược lại KHÔNG có hàm — xem đầu file. */
export function demDangTheoDoi(followerId: string): Promise<number> {
  return prisma.follow.count({ where: { followerId } });
}

/**
 * Bật / tắt theo dõi. Trả về trạng thái MỚI.
 *
 * Bấm lại để bỏ, giống hàng icon và lời nhắn — ba nút trên cùng một sản phẩm thì
 * phải cư xử cùng một kiểu, nếu không đứa trẻ học luật ở nút này rồi áp sang nút
 * kia và thấy nó hỏng.
 *
 * KHÔNG tự theo dõi được. Khác với icon (tự thả được, và có lý do), ở đây tự theo
 * dõi mình không những vô nghĩa — game của mình thì mình đã thấy rồi — mà còn làm
 * bẩn chính dải "game mới của bạn bè" bằng game của chính bé.
 */
export async function doiTheoDoi(followerId: string, authorId: string): Promise<boolean> {
  if (followerId === authorId) throw new TheoDoiError('Không theo dõi chính mình được.');

  const author = await prisma.child.findUnique({
    where: { id: authorId },
    select: { id: true, isLocked: true },
  });
  if (!author) throw new TheoDoiError('Không tìm thấy bạn này.');
  /*
   * Tài khoản bị bố mẹ khoá thì không nhận thêm người theo dõi. Không phải để
   * trừng phạt gì — bé đó đang không đăng được game, nên theo dõi chỉ tạo ra một
   * dòng trong danh sách không bao giờ sinh ra thứ gì.
   */
  if (author.isLocked) throw new TheoDoiError('Bạn này đang tạm khoá tài khoản.');

  const dang = await prisma.follow.findUnique({
    where: { followerId_authorId: { followerId, authorId } },
    select: { followerId: true },
  });

  if (dang) {
    await prisma.follow.delete({ where: { followerId_authorId: { followerId, authorId } } });
    return false;
  }

  /*
   * `create` có thể đụng khoá chính nếu hai tab cùng bấm — bắt lấy và coi như đã
   * theo dõi, thay vì ném lỗi ra mặt đứa trẻ. Kết quả cuối cùng vẫn đúng là thứ bé
   * muốn: đang theo dõi.
   */
  try {
    await prisma.follow.create({ data: { followerId, authorId } });
  } catch {
    if (!(await dangTheoDoi(followerId, authorId))) {
      throw new TheoDoiError('Chưa theo dõi được, thử lại nhé.');
    }
  }
  return true;
}

/**
 * Game mới của những bạn bé này đang theo dõi.
 *
 * Đây là TOÀN BỘ phần thưởng của việc theo dõi, nên nó phải đi thẳng vào chỗ bé
 * nhìn (trang chủ) chứ không nằm trong một trang riêng phải nhớ đường tới. Một
 * tính năng mà lợi ích của nó bị chôn sau hai cú bấm thì không ai dùng, và rồi sẽ
 * có người kết luận nhầm rằng trẻ con không thích theo dõi nhau.
 *
 * Chỉ PUBLISHED: game LIMITED cố ý bị rút khỏi MỌI danh sách, kể cả danh sách này —
 * ai có link vẫn chơi được, nhưng ta không đi phát tán thêm.
 */
export async function gameMoiCuaBanBe(followerId: string, take: number) {
  const dang = await prisma.follow.findMany({
    where: { followerId },
    select: { authorId: true },
  });
  if (dang.length === 0) return [];

  return prisma.game.findMany({
    where: { childId: { in: dang.map((d) => d.authorId) }, status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      child: { select: { displayName: true } },
      tags: { take: 1, include: { tag: { select: { label: true } } } },
    },
  });
}
