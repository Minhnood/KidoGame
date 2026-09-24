/**
 * Sáu danh mục game, và đường đưa chúng vào DB.
 *
 * VÌ SAO TÁCH RA KHỎI `seed.ts`. Danh mục là **dữ liệu tham chiếu**: trang upload
 * đọc `prisma.tag.findMany()` để bày ô chọn, và trang chủ đọc nó để dựng dãy lọc.
 * Không có hàng nào thì cả hai chỗ đó **rỗng** — bé không chọn được danh mục nào,
 * trang chủ không lọc được gì.
 *
 * Trước đây bốn hàng này nằm trong cùng `main()` với việc tạo `demo@kidogame.local`
 * và bé `beminh`. Hệ quả: một bản deploy thật chỉ có hai lựa chọn, **không có danh
 * mục nào**, hoặc **có tài khoản demo trên production** — mà mật khẩu của tài khoản
 * demo nằm công khai trong repo. Đo được trên VPS thật sau khi deploy đúng theo
 * README: `select count(*) from "Tag"` ra **0**.
 *
 * Và nó hỏng IM LẶNG. Upload vẫn chạy, game vẫn publish, không lỗi ở đâu —
 * `ingest.ts` khai `tagSlugs?` là tuỳ chọn và slug lạ bị bỏ qua không ném. Cái duy
 * nhất thấy được là một ô chọn trống, mà người deploy thì không mở trang upload.
 *
 * File này KHÔNG cần chốt `ALLOW_PRODUCTION_SEED` như `seed.ts`: nó không tạo tài
 * khoản nào, không đặt mật khẩu nào, và chạy lại bao nhiêu lần cũng ra cùng một kết
 * quả — thiếu thì thêm, lệch tên thì sửa tên, không xoá gì.
 *
 * Chạy riêng:
 *   pnpm --filter @kidogame/web db:tags
 */

import { PrismaClient } from '@prisma/client';

/**
 * Danh sách chuẩn. `seed.ts` import chính mảng này chứ không chép lại — hai bản
 * song song là hai bản sẽ lệch ngay lần đầu có người thêm danh mục ở một bên, và
 * cách hỏng đó im lặng: máy dev có sáu danh mục, production có bốn.
 *
 * `e2e-discovery` ĐỌC THẲNG mảng này để canh một bất biến: không nhãn nào được dài quá
 * viên thuốc trên thẻ game ở khổ 360px. Thêm danh mục mới thì phép kiểm ấy tự soi luôn
 * cái mới, không phải sửa gì bên đó.
 */
export const TAGS = [
  { slug: 'phieu-luu', label: 'Phiêu lưu' },
  { slug: 'giai-do', label: 'Giải đố' },
  { slug: 'hoc-tap', label: 'Học tập' },
  /*
   * "Sáng tạo" chứ không phải "Nghệ thuật" — fen chốt 23/9, và lý do là số đo: tên cũ
   * cần 79px trong khi viên thuốc nhãn trên thẻ khổ 360px chỉ chừa 72px, nên nó cụt
   * thành "Nghệ thuậ…" trên điện thoại. Lỗi này CÓ TỪ TRƯỚC, chỉ lộ ra khi đo thử chỗ
   * cho hai danh mục mới.
   *
   * Chọn "Sáng tạo" chứ không phải "Vẽ" hay "Hội hoạ": danh mục này ôm cả vẽ, nhạc và
   * hoạt hình, mà hai cái tên kia thu nó lại còn mỗi vẽ.
   *
   * SLUG GIỮ NGUYÊN `nghe-thuat`: nó nằm trong bảng `GameTag` và trong đường dẫn lọc,
   * đổi là mọi game đang gắn danh mục này mất liên kết.
   */
  { slug: 'nghe-thuat', label: 'Sáng tạo' },
  /*
   * HAI DANH MỤC CUỐI nói về CÁCH CHƠI, không phải nội dung — fen chốt 23/9.
   *
   * Lý do chúng đáng nằm cùng danh sách với bốn cái trên: thiết bị chính của trẻ ở đây
   * là điện thoại và máy tính bảng, mà máy cảm ứng KHÔNG có bàn phím. Một game điều
   * khiển bằng phím mũi tên mở ra trên iPad là một game bấm vào không nhúc nhích —
   * bé không biết vì sao, và thứ bé kết luận là "game này hỏng". Nhãn này trả lời câu
   * hỏi đó TRƯỚC khi bé mở.
   *
   * Hai nhãn KHÔNG loại trừ nhau, nên cố ý không có logic nào chặn chọn cả hai: một
   * game làm tử tế thì vừa đi được bằng phím vừa bấm được bằng tay, và đó là game
   * đáng khoe nhất chứ không phải dữ liệu mâu thuẫn.
   *
   * Gọi là "chạm" chứ không phải "cảm ứng": cùng nghĩa, nhưng một chữ là tiếng của
   * trẻ còn một chữ là tiếng của người lớn bán hàng điện máy.
   *
   * TÊN NGẮN LÀ BẮT BUỘC, không phải cho gọn. Viên thuốc nhãn trên thẻ game là
   * `truncate` trong `max-w-[calc(100%-4rem)]`, mà thẻ ở khổ 360px chỉ chừa 72px cho
   * chữ. Đo ra: "Chơi bằng phím" cần 104px nên cụt thành "Chơi bằng ph…" ngay trên
   * điện thoại — đúng thiết bị mà cái nhãn này sinh ra để phục vụ. "Dùng phím" (77px)
   * cũng không lọt. Hai chữ thì vừa, và đo được là vừa ở cả 360px.
   */
  { slug: 'choi-bang-phim', label: 'Bàn phím' },
  { slug: 'choi-bang-cham', label: 'Chạm tay' },
] as const;

/**
 * Thêm danh mục còn thiếu, và SỬA TÊN cho danh mục đã có. Không xoá gì.
 *
 * Trước đây đây là `createMany({ skipDuplicates: true })`, tức đổi tên một danh mục
 * trong file này **không bao giờ có tác dụng**: slug đã tồn tại nên hàng cũ được bỏ
 * qua, DB giữ nguyên tên cũ, và không ai báo lỗi. Gặp đúng lúc đổi "Chơi bằng phím"
 * thành "Bàn phím" ngày 23/9 — máy dev vẫn hiện tên cũ sau khi chạy lại, và cách duy
 * nhất nhận ra là mở trang ra nhìn.
 *
 * Khớp theo SLUG chứ không theo tên: slug là thứ nằm trong `GameTag` và trong đường
 * dẫn lọc, nên đổi tên hiển thị không được phép làm mất liên kết của game nào.
 */
export async function dungTags(prisma: PrismaClient): Promise<{ them: number; sua: number }> {
  let them = 0;
  let sua = 0;
  for (const t of TAGS) {
    const cu = await prisma.tag.findUnique({ where: { slug: t.slug } });
    if (!cu) {
      await prisma.tag.create({ data: { slug: t.slug, label: t.label } });
      them += 1;
    } else if (cu.label !== t.label) {
      await prisma.tag.update({ where: { slug: t.slug }, data: { label: t.label } });
      sua += 1;
    }
  }
  return { them, sua };
}

/*
 * Chỉ chạy khi được gọi trực tiếp như một script, không chạy khi `seed.ts` import.
 * `process.argv[1]` là file đang được node/tsx thực thi.
 */
if (process.argv[1] && /prisma[/\\]tags\.ts$/.test(process.argv[1])) {
  const prisma = new PrismaClient();
  dungTags(prisma)
    .then(async ({ them, sua }) => {
      const tong = await prisma.tag.count();
      console.log(`danh mục: thêm ${them}, sửa tên ${sua}, tổng ${tong}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
