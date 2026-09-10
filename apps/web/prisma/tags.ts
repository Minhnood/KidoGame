/**
 * Bốn danh mục game, và đường đưa chúng vào DB.
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
 * khoản nào, không đặt mật khẩu nào, và `skipDuplicates` làm nó chạy lại bao nhiêu
 * lần cũng vô hại.
 *
 * Chạy riêng:
 *   pnpm --filter @kidogame/web db:tags
 */

import { PrismaClient } from '@prisma/client';

/**
 * Danh sách chuẩn. `seed.ts` import chính mảng này chứ không chép lại — hai bản
 * song song là hai bản sẽ lệch ngay lần đầu có người thêm danh mục ở một bên, và
 * cách hỏng đó im lặng: máy dev có năm danh mục, production có bốn.
 */
export const TAGS = [
  { slug: 'phieu-luu', label: 'Phiêu lưu' },
  { slug: 'giai-do', label: 'Giải đố' },
  { slug: 'hoc-tap', label: 'Học tập' },
  { slug: 'nghe-thuat', label: 'Nghệ thuật' },
] as const;

/** Thêm những danh mục còn thiếu. Không xoá, không sửa cái đang có. */
export async function dungTags(prisma: PrismaClient): Promise<number> {
  const truoc = await prisma.tag.count();
  await prisma.tag.createMany({ data: [...TAGS], skipDuplicates: true });
  return (await prisma.tag.count()) - truoc;
}

/*
 * Chỉ chạy khi được gọi trực tiếp như một script, không chạy khi `seed.ts` import.
 * `process.argv[1]` là file đang được node/tsx thực thi.
 */
if (process.argv[1] && /prisma[/\\]tags\.ts$/.test(process.argv[1])) {
  const prisma = new PrismaClient();
  dungTags(prisma)
    .then(async (them) => {
      const tong = await prisma.tag.count();
      console.log(`danh mục: thêm ${them}, tổng ${tong}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
