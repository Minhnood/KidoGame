import { PrismaClient } from '@prisma/client';
import { buildTitleSearch } from '../src/lib/search';

/*
 * Điền cột `Game.titleSearch` cho những game đã có trước khi cột này tồn tại.
 *
 * Dùng CHUNG hàm `buildTitleSearch` của ứng dụng, không tự chuẩn hoá ở đây. Chép
 * logic sang script là cái bẫy đã có tiền lệ trong repo này: seed.ts từng tự gọi
 * scrypt theo một định dạng khác với password.ts, và tài khoản seed ra không đăng
 * nhập được mà không ai báo lỗi.
 *
 * Chạy lại được nhiều lần, không hỏng gì.
 */
const prisma = new PrismaClient();

async function main() {
  const games = await prisma.game.findMany({
    select: { id: true, title: true, description: true, titleSearch: true },
  });

  let updated = 0;
  for (const game of games) {
    const next = buildTitleSearch(game.title, game.description);
    if (next === game.titleSearch) continue;
    await prisma.game.update({ where: { id: game.id }, data: { titleSearch: next } });
    updated++;
  }

  console.log(`backfill xong: ${updated}/${games.length} game được cập nhật`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
