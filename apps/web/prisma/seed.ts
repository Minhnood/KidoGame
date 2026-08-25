import { PrismaClient } from '@prisma/client';
import { scryptSync, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

/**
 * Hash mật khẩu tạm cho seed. M2 sẽ thay bằng argon2id cho toàn hệ thống —
 * scrypt ở đây chỉ để seed không lưu mật khẩu dạng thô.
 */
function hash(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

async function main() {
  const parent = await prisma.parent.upsert({
    where: { email: 'demo@kidogame.local' },
    update: {},
    create: {
      email: 'demo@kidogame.local',
      passwordHash: hash('demo1234'),
      isAdmin: true,
    },
  });

  const child = await prisma.child.upsert({
    where: { username: 'beminh' },
    update: {},
    create: {
      parentId: parent.id,
      username: 'beminh',
      displayName: 'Bé Minh',
      passwordHash: hash('be1234'),
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
  console.log('  phụ huynh:', parent.email, '(mật khẩu: demo1234)');
  console.log('  bé:', child.username, '(mật khẩu: be1234)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
