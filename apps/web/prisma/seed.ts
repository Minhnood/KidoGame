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
async function main() {
  const parent = await prisma.parent.upsert({
    where: { email: 'demo@kidogame.local' },
    // isAdmin cũng nằm ở nhánh update: seed chạy lại trên DB cũ vẫn phải ra admin,
    // nếu không thì trang /admin trả 404 mà không hiểu vì sao.
    update: { passwordHash: await hashPassword('demo1234ab'), isAdmin: true },
    create: {
      email: 'demo@kidogame.local',
      passwordHash: await hashPassword('demo1234ab'),
      isAdmin: true,
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
