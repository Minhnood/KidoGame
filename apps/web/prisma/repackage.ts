import { packageToHtml, validateAndNormalize } from '@kidogame/sb3';
import { prisma } from '../src/lib/db';
import { objectExists, putObject, readObject } from '../src/lib/storage';

/*
 * Đóng gói lại HTML cho những game đã có trong DB.
 *
 * VÌ SAO CẦN SCRIPT NÀY: HTML đã đóng gói là một file TĨNH, tên file LÀ hash nội
 * dung, và player origin trả `cache-control: immutable`. Nên mọi thay đổi trong
 * `packages/sb3/src/package.ts` — bộ nút cảm ứng, trang trí viền, một option nào của
 * packager — chỉ có hiệu lực với game đăng SAU đó. Game cũ giữ nguyên file cũ mãi mãi
 * và không có gì báo ra: trang vẫn chạy, chỉ là thiếu thứ vừa thêm.
 *
 * Chạy bằng: pnpm --filter @kidogame/web db:repackage
 * Một game thôi:  pnpm --filter @kidogame/web db:repackage <gameId>
 *
 * Chạy lại được nhiều lần, không hỏng gì: nội dung không đổi thì hash không đổi và
 * `putObject` tự dedupe.
 *
 * KHÔNG XOÁ file HTML cũ. Nhiều game có thể trỏ chung một hash (hai bé đăng cùng một
 * .sb3 thì ra cùng một HTML), nên xoá theo từng game là cách chắc chắn nhất để rút
 * file đang có người dùng. Dọn rác là việc riêng, không phải việc của script này.
 */
async function main() {
  const chiMot = process.argv[2];

  const games = await prisma.game.findMany({
    where: chiMot ? { id: chiMot } : {},
    select: { id: true, title: true, sb3Sha256: true, htmlSha256: true, runtimeSha256: true },
    orderBy: { createdAt: 'asc' },
  });

  if (games.length === 0) {
    console.log(chiMot ? `không có game nào id=${chiMot}` : 'không có game nào');
    return;
  }

  let doi = 0;
  let nguyen = 0;
  let loi = 0;

  for (const game of games) {
    try {
      if (!(await objectExists('sb3', game.sb3Sha256))) {
        console.log(`  ✗ ${game.title}: thiếu file .sb3 gốc (${game.sb3Sha256.slice(0, 12)})`);
        loi++;
        continue;
      }

      /*
       * Đi qua `validateAndNormalize` chứ không đóng gói thẳng file trên đĩa. File đã
       * lưu là bản ĐÃ chuẩn hoá, nhưng `packageToHtml` cần `projectJson` để dò phím mà
       * sinh bộ nút cảm ứng — bỏ qua bước này thì game cũ đóng gói lại xong sẽ MẤT
       * sạch nút cảm ứng, tức là làm hỏng đúng thứ mình đang định vá.
       */
      const sb3 = await readObject('sb3', game.sb3Sha256);
      const norm = await validateAndNormalize(sb3);
      const out = await packageToHtml(norm.sb3, {
        title: game.title,
        projectJson: norm.projectJson,
      });

      /*
       * Runtime ghi TRƯỚC khi cập nhật DB, và ghi cả khi HTML không đổi.
       *
       * Không đổi HTML mà thiếu file runtime là game trắng màn hình — thứ tự này
       * bảo đảm không bao giờ có một khoảnh khắc nào DB trỏ tới một HTML mà file
       * runtime của nó chưa nằm trên đĩa.
       */
      await putObject('runtime', out.runtime.sha256, out.runtime.js);

      if (out.sha256 === game.htmlSha256 && out.runtime.sha256 === game.runtimeSha256) {
        nguyen++;
        continue;
      }

      await putObject('html', out.sha256, out.html);
      await prisma.game.update({
        where: { id: game.id },
        data: {
          htmlSha256: out.sha256,
          runtimeSha256: out.runtime.sha256,
          usesMusic: out.usesMusic,
        },
      });
      console.log(
        `  ✓ ${game.title}: ${game.htmlSha256.slice(0, 12)} -> ${out.sha256.slice(0, 12)}`,
      );
      doi++;
    } catch (e) {
      console.log(`  ✗ ${game.title}: ${(e as Error).message}`);
      loi++;
    }
  }

  console.log(
    `\nđóng gói lại xong: ${doi} đổi, ${nguyen} không đổi, ${loi} lỗi / ${games.length} game`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
