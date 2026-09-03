import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

/*
 * Dùng CHUNG hàm hashPassword của ứng dụng, không tự băm ở đây.
 *
 * Trước đó file này tự gọi scrypt và ghi ra định dạng `scrypt$<salt>$<hash>`
 * (3 phần), còn verifyPassword đọc định dạng `scrypt$N$r$p$<salt>$<hash>`
 * (6 phần) — nên tài khoản seed ra không đăng nhập được. Băm mật khẩu ở hai
 * chỗ khác nhau là cái bẫy: hai bên lệch nhau mà không ai báo lỗi.
 */
/*
 * Chốt cửa: seed KHÔNG được chạy trên production.
 *
 * File này tạo `demo@kidogame.local` với `isAdmin: true`, mật khẩu là một chuỗi
 * viết thẳng trong repo công khai, và ghi đè mật khẩu ấy ở CẢ nhánh update — nên
 * một lần lỡ tay chạy `db:seed` trên DB thật là cài sẵn một tài khoản quản trị mà
 * ai đọc repo cũng biết mật khẩu, kể cả khi tài khoản đó đã từng được đổi.
 *
 * Bước deploy dùng `db:deploy` nên không gọi tới đây. Nhưng "quy trình không gọi
 * tới" không phải là một cái khoá — bốn bộ e2e đều cần tài khoản demo, nên lệnh
 * `db:seed` nằm trong trí nhớ ngón tay của người vận hành.
 *
 * Cần seed trên môi trường có NODE_ENV=production thật (hiếm, và nên nghĩ kỹ) thì
 * đặt ALLOW_PRODUCTION_SEED=1 cho đúng một lần chạy.
 */
function guardProduction() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== '1') {
    throw new Error(
      'Từ chối seed: NODE_ENV=production. File này tạo tài khoản admin có mật khẩu ' +
        'công khai trong repo. Chắc chắn muốn thì chạy lại với ALLOW_PRODUCTION_SEED=1.'
    );
  }
}

async function main() {
  guardProduction();

  const parent = await prisma.parent.upsert({
    where: { email: 'demo@kidogame.local' },
    /*
     * `isAdmin` và `emailVerifiedAt` cùng nằm ở CẢ hai nhánh: seed chạy lại trên DB cũ
     * vẫn phải ra một tài khoản dùng được.
     *
     * `emailVerifiedAt` là bắt buộc từ khi `createChild` đòi email đã xác minh. Thiếu
     * nó thì tài khoản demo không tạo được tài khoản cho bé, mà hòm thư
     * `demo@kidogame.local` không tồn tại nên cũng chẳng có link nào để bấm — người
     * mới clone repo sẽ tắc ngay ở bước đầu tiên.
     */
    update: {
      passwordHash: await hashPassword('demo1234ab'),
      isAdmin: true,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: 'demo@kidogame.local',
      passwordHash: await hashPassword('demo1234ab'),
      isAdmin: true,
      emailVerifiedAt: new Date(),
    },
  });

  const child = await prisma.child.upsert({
    where: { username: 'beminh' },
    update: { passwordHash: await hashPassword('be1234') },
    create: {
      parentId: parent.id,
      username: 'beminh',
      displayName: 'Bé Minh',
      passwordHash: await hashPassword('be1234'),
      birthYear: 2016,
    },
  });

  await prisma.tag.createMany({
    data: [
      { slug: 'phieu-luu', label: 'Phiêu lưu' },
      { slug: 'giai-do', label: 'Giải đố' },
      { slug: 'hoc-tap', label: 'Học tập' },
      { slug: 'nghe-thuat', label: 'Nghệ thuật' },
    ],
    skipDuplicates: true,
  });

  console.log('seed xong:');
  console.log('  phụ huynh:', parent.email, '/ demo1234ab');
  console.log('  bé:', child.username, '/ be1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
