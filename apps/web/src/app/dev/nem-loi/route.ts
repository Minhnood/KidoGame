import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Route CỐ TÌNH NÉM LỖI, cho `infra/e2e-glitchtip.mjs` đo đường
 * lỗi server → `instrumentation.ts` → `lib/glitchtip.ts` → máy nhận.
 *
 * Chỉ tồn tại ở dev, cùng lớp chặn với `/dev/thu`: production trả 404 chứ không ném.
 * Không đặt được phép kiểm này ở production mà không cài sẵn một chỗ hỏng cho người
 * ngoài gọi.
 *
 * Thông điệp mang sẵn một email và một token giả để phép kiểm thấy chúng bị che
 * TRƯỚC khi rời app. `?ma=` cho phép kiểm gắn một mã riêng để tìm đúng lỗi của mình.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') notFound();
  const ma = (new URL(request.url).searchParams.get('ma') ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 16);
  throw new Error(
    `Loi thu glitchtip ${ma} cua be@vidu.test token=Zx9aQ2mPl7Rt4Kw8Yb3Nc6Vd1Hf5Jg0Ls2Qe7Uo9Ti link https://app.vidu/xac-minh?token=bimat123`
  );
}
