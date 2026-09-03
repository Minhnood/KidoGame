/**
 * Cấp (hoặc thu hồi) quyền quản trị cho một tài khoản phụ huynh ĐÃ đăng ký.
 *
 * Chạy:
 *   pnpm --filter @kidogame/web db:make-admin ban@example.com
 *   pnpm --filter @kidogame/web db:make-admin ban@example.com --bo
 *
 * VÌ SAO CẦN. `db:seed` tạo `demo@kidogame.local` với `isAdmin` và một mật khẩu viết
 * thẳng trong repo, nên nó có chốt từ chối chạy ở `NODE_ENV=production`. Chốt ấy đúng,
 * nhưng nó để lại một khoảng trống: trên production không còn đường nào tạo người quản
 * trị. Ai cần vào `/admin` sẽ phá chốt bằng `ALLOW_PRODUCTION_SEED=1` — và nhận đúng
 * cái tài khoản mật khẩu công khai mà chốt tồn tại để ngăn. Một chốt không kèm đường
 * đi thay thế thì người ta không dừng lại, người ta đi vòng.
 *
 * KHÔNG TẠO TÀI KHOẢN MỚI, chỉ nâng quyền cho tài khoản đã có. Đó là điểm chính của
 * thiết kế này: người quản trị phải tự đăng ký qua web như mọi phụ huynh, nên mật khẩu
 * do chính họ đặt và không bao giờ đi qua repo, qua log, hay qua tay người khác. Script
 * này không nhận mật khẩu và không sinh mật khẩu.
 *
 * Đòi email ĐÃ XÁC MINH: quyền quản trị gồm việc ẩn game của trẻ và khoá tài khoản
 * người khác, mà một hòm thư chưa chứng minh được là của ai thì cũng chưa chứng minh
 * được người bấm những nút đó là ai. Xác minh trước, nâng quyền sau.
 */
import { prisma } from '../src/lib/db';

const args = process.argv.slice(2).filter((a) => a !== '--');
const bo = args.includes('--bo');
const emailRaw = args.find((a) => !a.startsWith('--'));

async function main() {
  if (!emailRaw) {
    console.error('Thiếu email. Ví dụ:');
    console.error('  pnpm --filter @kidogame/web db:make-admin ban@example.com');
    console.error('  pnpm --filter @kidogame/web db:make-admin ban@example.com --bo');
    process.exitCode = 2;
    return;
  }

  // Cùng cách chuẩn hoá với `auth.ts`, không thì gõ hoa một chữ là "không tìm thấy".
  const email = emailRaw.trim().toLowerCase();

  const parent = await prisma.parent.findUnique({
    where: { email },
    select: { id: true, email: true, isAdmin: true, emailVerifiedAt: true },
  });

  if (!parent) {
    console.error(`Không có tài khoản nào với email ${email}.`);
    console.error('Script này KHÔNG tạo tài khoản — người đó phải tự đăng ký ở /dang-ky');
    console.error('trước, để mật khẩu do chính họ đặt và không đi qua đây.');
    process.exitCode = 1;
    return;
  }

  if (bo) {
    if (!parent.isAdmin) {
      console.log(`${email} vốn không phải quản trị. Không đổi gì.`);
      return;
    }
    await prisma.parent.update({ where: { id: parent.id }, data: { isAdmin: false } });
    console.log(`Đã THU HỒI quyền quản trị của ${email}.`);
    return;
  }

  if (!parent.emailVerifiedAt) {
    console.error(`${email} chưa xác minh email, nên chưa nâng quyền.`);
    console.error('Bảo họ đăng nhập rồi bấm "Gửi link xác minh" ở /phu-huynh và bấm link');
    console.error('trong thư. Xác minh trước, nâng quyền sau.');
    process.exitCode = 1;
    return;
  }

  if (parent.isAdmin) {
    console.log(`${email} đã là quản trị rồi. Không đổi gì.`);
    return;
  }

  await prisma.parent.update({ where: { id: parent.id }, data: { isAdmin: true } });
  console.log(`Đã cấp quyền quản trị cho ${email}.`);
  console.log('Người đó vào /admin bằng chính mật khẩu họ đang dùng — không có mật khẩu mới.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
