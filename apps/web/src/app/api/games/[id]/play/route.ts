import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    /*
     * Gồm cả LIMITED: game bị ẩn mềm vẫn chơi được bằng link, nên người vào bằng
     * link là một lượt chơi thật. Chỉ tính PUBLISHED thì số lượt chơi lặng lẽ đứng
     * yên trong suốt thời gian game bị siết, và đúng lúc admin cần biết game đó có
     * còn ai chơi hay không thì dữ liệu lại thiếu.
     *
     * `updateMany` chứ không `update`: `update` với where nhiều điều kiện sẽ NÉM khi
     * không khớp, mà ở đây không khớp là chuyện bình thường (game vừa bị ẩn).
     */
    await prisma.game.updateMany({
      where: { id, status: { in: ['PUBLISHED', 'LIMITED'] } },
      data: { playCount: { increment: 1 } },
    });
  } catch {
    // Game không tồn tại hoặc đã bị ẩn — không cần báo lỗi cho người chơi.
  }
  return new NextResponse(null, { status: 204 });
}
