import { createHash, randomBytes } from 'node:crypto';
import type { TokenPurpose } from '@prisma/client';
import { AuthError } from './auth';
import { prisma } from './db';

/**
 * Thời hạn token, tính theo phút.
 *
 * Đặt lại mật khẩu ngắn hơn hẳn xác minh email vì hậu quả nặng hơn hẳn: một link
 * reset còn hiệu lực là một đường chiếm tài khoản, nếu hòm thư bị người khác đọc
 * được. Xác minh email thì cùng lắm là phải bấm gửi lại.
 */
const TTL_MINUTES: Record<TokenPurpose, number> = {
  PASSWORD_RESET: 60,
  EMAIL_VERIFY: 24 * 60,
};

/** Số lần xin token tối đa trong một giờ, cho mỗi tài khoản và mỗi loại. */
const MAX_PER_HOUR = 5;

const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

/**
 * Sinh token mới và trả về BẢN THÔ để nhét vào link trong mail.
 *
 * Bản thô chỉ tồn tại trong bộ nhớ đúng một lần này; database chỉ giữ sha256.
 *
 * Mọi token cũ CÙNG LOẠI và chưa dùng của tài khoản đó bị vô hiệu ngay. Nếu không,
 * bấm "gửi lại" ba lần là có ba link reset cùng sống — mỗi cái là một cửa vào, và
 * cái cũ nhất thường nằm trong hòm thư lâu nhất.
 */
export async function createAuthToken(parentId: string, purpose: TokenPurpose): Promise<string> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.authToken.count({
    where: { parentId, purpose, createdAt: { gte: since } },
  });
  if (recent >= MAX_PER_HOUR) {
    throw new AuthError('Bạn đã yêu cầu quá nhiều lần. Thử lại sau một giờ nhé.');
  }

  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MINUTES[purpose] * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.authToken.updateMany({
      where: { parentId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.authToken.create({
      data: { tokenHash: hashToken(raw), parentId, purpose, expiresAt },
    });
  });

  return raw;
}

/**
 * Kiểm tra token và đánh dấu đã dùng. Trả về id phụ huynh sở hữu token.
 *
 * Đánh dấu bằng `updateMany` có điều kiện `usedAt: null` chứ không đọc-rồi-ghi:
 * hai request tới cùng lúc với cùng một token thì chỉ đúng một cái thấy `count = 1`,
 * cái còn lại thấy 0 và bị từ chối. Đọc-rồi-ghi sẽ để lọt cả hai.
 */
export async function consumeAuthToken(raw: string, purpose: TokenPurpose): Promise<string> {
  const invalid = new AuthError('Link này không dùng được nữa. Hãy yêu cầu link mới nhé.');
  if (!raw) throw invalid;

  const tokenHash = hashToken(raw);
  const token = await prisma.authToken.findUnique({
    where: { tokenHash },
    select: { parentId: true, purpose: true, expiresAt: true, usedAt: true },
  });

  if (!token || token.purpose !== purpose || token.usedAt || token.expiresAt < new Date()) {
    throw invalid;
  }

  const claimed = await prisma.authToken.updateMany({
    where: { tokenHash, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) throw invalid;

  return token.parentId;
}
