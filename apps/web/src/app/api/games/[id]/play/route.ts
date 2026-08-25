import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.game.update({
      where: { id, status: 'PUBLISHED' },
      data: { playCount: { increment: 1 } },
    });
  } catch {
    // Game không tồn tại hoặc đã bị ẩn — không cần báo lỗi cho người chơi.
  }
  return new NextResponse(null, { status: 204 });
}
