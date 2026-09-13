import { cache } from 'react';
import { prisma } from '@/lib/db';
import { getActorTrongLuotRender } from '@/lib/session';

/**
 * AI ĐƯỢC XEM game này — một chỗ duy nhất, gọi từ CẢ `layout.tsx` lẫn `page.tsx`.
 *
 * VÌ SAO TÁCH RA KHỎI TRANG. Trang game có `loading.tsx`, và khung chờ bọc `page.tsx`
 * chứ không bọc layout. Có khung chờ thì Next gửi dòng trạng thái 200 đi ngay để kịp
 * vẽ khung, nên `notFound()` gọi trong page chạy SAU khi mã trạng thái đã rời máy chủ.
 * Đo được: game đã bị phụ huynh ẩn trả 200 cho người lạ. Nội dung không lộ (body là
 * trang "Không có trang này"), nhưng mọi bot, bộ nhớ đệm và phần mềm kiểm link đều
 * được bảo "trang này vẫn còn". Năm bộ kiểm canh đúng mã 404 cùng đỏ một lúc.
 *
 * `layout.tsx` chạy TRƯỚC khung chờ, nên nó gọi hàm này và `notFound()` ra đúng 404.
 * `page.tsx` gọi lại để lấy dữ liệu render — `cache()` nhớ trong một lượt render, nên
 * lần gọi thứ hai không tốn thêm truy vấn nào.
 *
 * Trả về `null` nghĩa là: coi như game không tồn tại với người đang xem.
 */
export const docGameDuocXem = cache(async (id: string) => {
  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      // `parentId` để biết người đang xem có phải bố mẹ của bé này không.
      child: { select: { displayName: true, parentId: true } },
      tags: { include: { tag: { select: { slug: true, label: true } } } },
    },
  });

  /*
   * Game bị ẩn hoặc gỡ thì coi như không tồn tại với người xem thường.
   *
   * Ngoại lệ DUY NHẤT là admin: nếu không có ngoại lệ này thì admin phải quyết định
   * gỡ hẳn hay cho hiện lại mà không hề nhìn thấy nội dung game — bấm vào tên game
   * từ trang /admin cũng nhận 404. Kiểm duyệt mù như vậy còn tệ hơn không kiểm duyệt.
   *
   * Lưu ý phạm vi: đây CHỈ nới cho admin. Phụ huynh vẫn không xem được game đã ẩn
   * của con mình qua đường này.
   */
  /*
   * DỰA VÀO PHIÊN SITE + cờ isAdmin, KHÔNG dùng `getAdmin()` — và đây là một quyết
   * định có chủ ý, không phải chỗ bị bỏ sót khi tách origin.
   *
   * Trang này nằm trên app origin, nên cookie phiên quản trị (host-only trên admin
   * origin) không tới được đây. Dùng `getAdmin()` ở đây thì luôn là null và người
   * kiểm duyệt mất hẳn khả năng NHÌN THẤY nội dung mình đang quyết định — đúng cái
   * mà đoạn trên vừa gọi là kiểm duyệt mù.
   *
   * Phân biệt ĐỌC với GHI, và cái giá của hai bên khác nhau hẳn:
   *
   *  - GHI (ẩn, gỡ hẳn, khoá tài khoản) đòi phiên quản trị. Đó là những việc không
   *    đảo lại được và là những việc một lỗ XSS sẽ muốn gọi tới.
   *  - ĐỌC một game đã bị ẩn thì chỉ cần phiên site có isAdmin. Nếu ai đó khai thác
   *    được XSS trên app origin bằng phiên của một admin, thứ họ thêm được là xem
   *    một game đã bị ẩn — mà nội dung đó chính họ vừa upload cũng xem được. Không
   *    đáng đánh đổi bằng việc làm người kiểm duyệt không thấy gì.
   *
   * Nghĩa là người kiểm duyệt đăng nhập ở HAI cửa: cửa site để xem game, cửa quản
   * trị để bấm nút. Phiên site sống 30 ngày nên trong thực tế đó là một lần.
   */
  const actor = await getActorTrongLuotRender();
  const isAdmin = actor?.kind === 'parent' && actor.isAdmin;

  /*
   * LIMITED chơi được với MỌI người — đó là toàn bộ ý nghĩa của ẩn mềm. Game chỉ
   * biến mất khỏi trang chủ, tìm kiếm và các danh sách; ai có link vẫn vào được.
   */
  const xemDuoc = game?.status === 'PUBLISHED' || game?.status === 'LIMITED';

  /**
   * Người đang xem có phải bố mẹ của bé làm ra game này không.
   *
   * `parentId` là khoá ngoại thật trong DB, không phải suy ra từ gì cả — nên đây là
   * đúng câu hỏi "game này có phải của nhà mình không", cùng điều kiện mà
   * `setGameHiddenAction` kiểm ở tầng server (`child: { parentId }`). Hai chỗ hỏi
   * cùng một câu là cố ý: nút chỉ hiện ra ở đúng những trang mà bấm vào sẽ chạy.
   */
  const laChuNhan = actor?.kind === 'parent' && game?.child.parentId === actor.id;

  /*
   * Bố mẹ xem được game ĐANG ẨN của con mình. Bàn giao cũ ghi ngược lại điều này,
   * và nó đúng cho tới khi có nút "Ẩn game" trên chính trang này — không nới thì
   * phụ huynh bấm ẩn xong là trang tự trả 404 ngay dưới tay họ, tức một cái nút
   * làm đúng việc của nó mà trông y như vừa làm hỏng cái gì.
   *
   * Chỉ nới tới HIDDEN, KHÔNG nới REMOVED: HIDDEN là quyết định của chính phụ
   * huynh và họ đảo lại được, còn REMOVED là phán quyết của đội kiểm duyệt mà họ
   * không tự lật được — cho xem lại nội dung đó ở đây là mở một cửa mà chính
   * `setGameHiddenAction` đang đóng.
   *
   * Không ảnh hưởng gì tới người lạ: điều kiện đòi đúng `parentId` của bé.
   */
  const chuNhanXemGameAn = laChuNhan && game?.status === 'HIDDEN';


  if (!game || (!xemDuoc && !isAdmin && !chuNhanXemGameAn)) return null;

  return { game, actor, isAdmin, laChuNhan, chuNhanXemGameAn, xemDuoc };
});
