/**
 * Một cặp tài khoản để người khác MỞ THỬ sản phẩm: phụ huynh + bé.
 *
 * VÌ SAO KHÔNG DÙNG `seed.ts`. Cái đó tạo `demo@kidogame.local` với `isAdmin: true`
 * và mật khẩu viết thẳng trong repo — repo nay đã công khai, nên chạy nó trên
 * production là dựng một cửa quản trị mà mật khẩu ai cũng đọc được. Tài khoản ở đây
 * là người dùng THƯỜNG, không quyền quản trị, và tồn tại đúng cho một việc: để người
 * chấm hồ sơ đăng nhập xem thử mà không phải tự đăng ký rồi ngồi chờ thư xác minh.
 *
 * VÌ SAO KHÔNG DÙNG TÀI KHOẢN yopmail ĐANG CÓ. Tài khoản ấy giữ game thật mà fen đã
 * đăng, và nó cũng là nơi fen tự thử mọi thứ. Đưa nó lên hồ sơ xin việc là đưa cho
 * người lạ quyền xoá game và xoá cả tài khoản.
 *
 * Email dùng miền `.invalid` — miền được RFC 2606 dành riêng cho việc này, bảo đảm
 * không bao giờ trỏ tới hòm thư của ai. `emailVerifiedAt` đặt sẵn vì không có thư nào
 * để bấm; thiếu nó thì tài khoản không tạo được bé, và người chấm tắc ngay bước đầu.
 *
 * MẬT KHẨU CỐ Ý NẰM TRONG FILE NÀY. Nó sẽ được ghi lên CV nên không phải bí mật —
 * viết ra đây để sáu tháng nữa còn biết cặp tài khoản này là gì và ai đang giữ.
 *
 * Chạy lại bao nhiêu lần cũng ra cùng một kết quả: thiếu thì tạo, có rồi thì đặt lại
 * mật khẩu.
 *
 * Trên production:
 *   docker compose exec -T prune sh -c "cd /app/apps/web && pnpm exec tsx prisma/tai-khoan-cham.ts"
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password';

const EMAIL = 'nguoi-cham@kidogame.invalid';
const MK_PHU_HUYNH = 'xemthu2026';
const TEN_BE = 'bethu';
const MK_BE = 'be2026xt';

const prisma = new PrismaClient();

async function main() {
  const phuHuynh = await prisma.parent.upsert({
    where: { email: EMAIL },
    /* `isAdmin` KHÔNG có ở đây, và đó là điểm chính của cả file: một tài khoản đưa cho
       người lạ thì không được chạm tới khu quản trị. */
    update: { passwordHash: await hashPassword(MK_PHU_HUYNH), emailVerifiedAt: new Date() },
    create: {
      email: EMAIL,
      passwordHash: await hashPassword(MK_PHU_HUYNH),
      emailVerifiedAt: new Date(),
    },
  });

  const be = await prisma.child.upsert({
    where: { username: TEN_BE },
    update: { passwordHash: await hashPassword(MK_BE) },
    create: {
      parentId: phuHuynh.id,
      username: TEN_BE,
      displayName: 'Bé Thử',
      passwordHash: await hashPassword(MK_BE),
      birthYear: 2016,
    },
  });

  /*
   * ĐỌC LẠI TỪ DB rồi mới in, chứ không in lại mấy hằng số ở đầu file.
   *
   * `upsert` ở trên cố ý KHÔNG đụng tới `isAdmin` ở nhánh `update`, nên nếu email này
   * lỡ đã từng là một tài khoản quản trị thì chạy script cũng không hạ quyền nó — và
   * ta sẽ đưa cho người lạ một tài khoản có cửa vào khu quản trị mà vẫn yên tâm vì
   * dòng in ra nói "KHÔNG phải admin". Hỏi lại DB thì dòng in ra là sự thật.
   */
  const that = await prisma.parent.findUniqueOrThrow({
    where: { email: EMAIL },
    select: { email: true, isAdmin: true, emailVerifiedAt: true },
  });
  if (that.isAdmin) {
    throw new Error(
      `${EMAIL} đang có quyền QUẢN TRỊ. Không được đưa tài khoản này cho người ngoài. ` +
        'Hạ quyền nó trước, hoặc đổi sang một email khác.'
    );
  }

  console.log('tài khoản để người khác xem thử:');
  console.log(`  phụ huynh: ${that.email} / ${MK_PHU_HUYNH}`);
  console.log(`  bé:        ${be.username} / ${MK_BE}`);
  console.log(`  quyền quản trị: ${that.isAdmin ? 'CÓ — SAI' : 'không'}`);
  console.log(`  email đã xác minh: ${that.emailVerifiedAt ? 'rồi' : 'CHƯA — sẽ không tạo được bé'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
