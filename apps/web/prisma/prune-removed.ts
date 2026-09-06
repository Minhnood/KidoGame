/**
 * Xoá HẲN những game đã gỡ quá hạn giữ.
 *
 * Quyết định sản phẩm: game bị gỡ hẳn (`REMOVED`) chỉ nằm lại
 * `NGAY_GIU_GAME_DA_GO` ngày — mặc định 7 — rồi biến mất khỏi DB. File trên đĩa do
 * `storage:prune` dọn sau đó, vì storage địa chỉ hoá theo nội dung nên nhiều game
 * có thể trỏ chung một hash và xoá theo từng game là xoá mất file của game khác.
 *
 * VIỆC NÀY KHÔNG ĐẢO LẠI ĐƯỢC. Sau khi chạy, nút "Cho hiện lại" trong khu quản trị
 * không còn gì để hiện lại, và file `.sb3` gốc — tức công đứa trẻ tự làm — cũng đi
 * theo. Đường cứu duy nhất còn lại là phục hồi từ bản sao lưu.
 *
 * BA ĐIỀU SCRIPT NÀY CỐ Ý LÀM, và mỗi điều đều vì một cách hỏng cụ thể:
 *
 * 1. CHẠY KHÔ LÀ MẶC ĐỊNH. Phải `--xoa` mới xoá thật. Đây là công cụ xoá dữ liệu
 *    người dùng theo một truy vấn thời gian; mặc định phải là "cho tôi xem trước".
 *
 * 2. GAME `REMOVED` MÀ THIẾU `removedAt` THÌ ĐƯỢC BẤM ĐỒNG HỒ TỪ HÔM NAY, không bị
 *    xoá trong cùng lượt chạy. Cột `removedAt` thêm sau, nên mọi game đã gỡ từ trước
 *    bản này đều null. Hai cách xử lý khác đều sai: coi null là "quá hạn" thì lần
 *    chạy đầu tiên xoá sạch mọi game đã gỡ trong quá khứ, không có bảy ngày nào cả;
 *    còn bỏ qua vĩnh viễn thì chúng nằm lại mãi và cơ chế dọn im lặng không áp cho
 *    đúng nhóm nó ra đời để dọn.
 *
 * 3. CHỤP TÊN GAME VÀO `TakedownRequest.gameTitle` TRƯỚC KHI XOÁ. Khoá ngoại của
 *    bảng ấy là `SetNull` chứ không `Cascade`, vì nó là hồ sơ pháp lý duy nhất của
 *    hệ thống: ai khiếu nại, căn cứ gì, xử lý ra sao. Không chụp tên thì hàng còn
 *    lại chỉ nói "có người khiếu nại một game nào đó" — tức càng làm đúng (gỡ hẳn
 *    rồi dọn) thì hồ sơ càng vô dụng.
 *
 * Chạy:
 *   pnpm --filter @kidogame/web db:prune-removed          # chỉ ĐO
 *   pnpm --filter @kidogame/web db:prune-removed --xoa    # xoá thật
 *   REMOVED_KEEP_DAYS=30 pnpm ... db:prune-removed        # đổi hạn giữ
 *
 * Xoá xong nên chạy tiếp `storage:prune --xoa` để dọn file. Service `prune` trong
 * docker-compose làm đúng hai bước đó, mỗi ngày một lần.
 */
import { prisma } from '../src/lib/db';
import { NGAY_GIU_GAME_DA_GO } from '../src/lib/moderation';

const xoaThat = process.argv.includes('--xoa');

const ngay = (d: Date) => d.toLocaleString('vi-VN');

async function main() {
  /*
   * CHỐT: hạn giữ phải ít nhất 1 ngày.
   *
   * `REMOVED_KEEP_DAYS=0` biến script này thành "xoá hẳn ngay khi admin bấm gỡ", tức
   * bỏ mất toàn bộ cửa sổ sửa sai — mà nó lại là một biến môi trường, thứ dễ bị đặt
   * sai bằng một dòng trong `.env` hơn là bằng một dòng code ai đó phải review.
   * `Number('')` ra 0 và `Number('bay')` ra NaN, nên chốt này bắt cả hai kiểu gõ sai.
   */
  if (!Number.isFinite(NGAY_GIU_GAME_DA_GO) || NGAY_GIU_GAME_DA_GO < 1) {
    console.error(`DỪNG: hạn giữ không hợp lệ (${NGAY_GIU_GAME_DA_GO}).`);
    console.error('REMOVED_KEEP_DAYS phải là số ngày >= 1. Không xoá gì cả.');
    process.exitCode = 2;
    return;
  }

  console.log(`Hạn giữ game đã gỡ: ${NGAY_GIU_GAME_DA_GO} ngày`);
  console.log(xoaThat ? 'Chế độ: XOÁ THẬT' : 'Chế độ: chạy khô (thêm --xoa để xoá thật)');

  // --- Bước 1: bấm đồng hồ cho game đã gỡ mà chưa có mốc thời gian ---
  const thieuMoc = await prisma.game.findMany({
    where: { status: 'REMOVED', removedAt: null },
    select: { id: true, title: true },
  });

  if (thieuMoc.length > 0) {
    console.log(`\n${thieuMoc.length} game đã gỡ nhưng chưa có mốc removedAt:`);
    for (const g of thieuMoc) console.log(`  · ${g.title} (${g.id})`);
    if (xoaThat) {
      const bayGio = new Date();
      await prisma.game.updateMany({
        where: { status: 'REMOVED', removedAt: null },
        data: { removedAt: bayGio },
      });
      console.log(`  → đã bấm đồng hồ từ ${ngay(bayGio)}; sớm nhất chúng bị xoá là sau ${NGAY_GIU_GAME_DA_GO} ngày nữa.`);
    } else {
      console.log('  → chạy với --xoa sẽ bấm đồng hồ cho chúng (KHÔNG xoá trong lượt này).');
    }
  }

  // --- Bước 2: xoá game đã quá hạn ---
  const moc = new Date(Date.now() - NGAY_GIU_GAME_DA_GO * 86400_000);
  const quaHan = await prisma.game.findMany({
    where: { status: 'REMOVED', removedAt: { lte: moc } },
    select: {
      id: true,
      title: true,
      removedAt: true,
      sb3Size: true,
      child: { select: { displayName: true } },
      _count: { select: { takedownRequests: true, reports: true, moderationLogs: true } },
    },
    orderBy: { removedAt: 'asc' },
  });

  console.log(`\nQuá hạn (gỡ trước ${ngay(moc)}): ${quaHan.length} game`);
  for (const g of quaHan) {
    console.log(
      `  · ${g.title} — của bé ${g.child.displayName}, gỡ ${ngay(g.removedAt!)}, ` +
        `${(g.sb3Size / 1024).toFixed(0)} KB, ${g._count.takedownRequests} yêu cầu gỡ, ` +
        `${g._count.reports} báo cáo, ${g._count.moderationLogs} dòng vết`
    );
  }

  if (quaHan.length === 0) {
    console.log('\nKhông có gì để xoá.');
  } else if (!xoaThat) {
    console.log('\nChạy khô: chưa xoá gì. Thêm --xoa để xoá thật.');
  } else {
    let soHoSoGiuLai = 0;
    for (const g of quaHan) {
      /*
       * Chụp tên rồi xoá, TRONG CÙNG một transaction.
       *
       * Tách ra hai lệnh rời thì một lần script chết giữa hai bước để lại hàng hồ sơ
       * trỏ tới game vừa mất mà không có tên — đúng trạng thái mà cột `gameTitle`
       * tồn tại để ngăn, và nó không tự sửa được ở lần chạy sau vì game đã đi rồi.
       */
      await prisma.$transaction(async (tx) => {
        const chup = await tx.takedownRequest.updateMany({
          where: { gameId: g.id, gameTitle: '' },
          data: { gameTitle: g.title },
        });
        soHoSoGiuLai += chup.count;
        await tx.game.delete({ where: { id: g.id } });
      });
      console.log(`  ✓ đã xoá: ${g.title}`);
    }
    console.log(`\nĐã xoá ${quaHan.length} game. Giữ lại hồ sơ khiếu nại, chụp tên cho ${soHoSoGiuLai} hàng.`);
    console.log('Chạy tiếp `storage:prune --xoa` để dọn file trên đĩa.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
