import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { overRateLimit, rateKeyOf, recordError } from '@/lib/error-log';

export const runtime = 'nodejs';

/**
 * Trần kích thước thân request. Một báo cáo hợp lệ chưa tới 500 byte; mọi thứ lớn
 * hơn 4KB là ai đó đang thử một chuyện khác.
 */
const MAX_BODY_BYTES = 4096;

/**
 * Nhận báo cáo lỗi từ `error.tsx` và `global-error.tsx`.
 *
 * KHÔNG đòi đăng nhập, và không thể đòi: đúng những lỗi đáng lo nhất là lỗi làm hỏng
 * cả cây React, trong đó có thể có cả phần đọc phiên đăng nhập. Bù lại bằng ba lớp
 * ở `lib/error-log.ts`: trần theo phút cho mỗi người, trần số nhóm chưa xử lý, và
 * cắt sạch mọi thứ có thể mang dữ liệu cá nhân.
 *
 * LUÔN trả 204, kể cả khi thân request là rác, khi vượt trần, hay khi ghi hỏng.
 * Hai lý do: `sendBeacon` bên client không đọc được response nên phân biệt mã trả
 * về chẳng để làm gì, và một hộp nhận không cần đăng nhập mà trả lời khác nhau
 * theo từng trường hợp là tự kể cho người dò biết cơ chế bên trong của mình.
 */
export async function POST(request: Request) {
  try {
    const h = await headers();

    /*
     * Chặn theo `content-length` TRƯỚC khi đọc thân request, chứ không đọc xong rồi
     * mới đo: đọc trước là đã nuốt hết vào bộ nhớ, tức trần không chặn được đúng
     * cái nó sinh ra để chặn. Header có thể nói dối, nên vẫn đo lại sau khi đọc.
     */
    const declared = Number(h.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 });

    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    if (overRateLimit(rateKeyOf(ip))) return new NextResponse(null, { status: 204 });

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 });

    const body = JSON.parse(raw) as Record<string, unknown>;

    /*
     * Chỉ nhận hai nguồn phía client. `server` là nguồn dành cho code chạy trong
     * process của mình gọi thẳng `recordError`, không đi qua đây — nhận nó ở đây là
     * cho người ngoài giả làm lỗi server.
     */
    const source = body.source === 'global' ? 'global' : 'boundary';

    await recordError({
      source,
      path: body.path,
      digest: body.digest,
      message: body.message,
      userAgent: h.get('user-agent'),
    });
  } catch {
    // Thân request không phải JSON, hoặc DB đang hỏng. Xem đoạn giải thích ở trên.
  }

  return new NextResponse(null, { status: 204 });
}
