/**
 * Chạy đúng một lần lúc server khởi động (hook `register` của Next).
 *
 * Việc duy nhất ở đây: chặn một lỗi cấu hình đã thật sự xảy ra, và thuộc loại tệ
 * nhất — hỏng im lặng, triệu chứng chỉ vào nhầm chỗ.
 */

/**
 * CSP `frame-src` của app được TÍNH LÚC BUILD.
 *
 * `headers()` trong next.config.ts được đánh giá trong `next build` rồi nướng vào
 * .next/routes-manifest.json. Còn `objectUrl()` trong src/lib/storage.ts đọc
 * `PLAYER_ORIGIN` lúc GỌI. Hai thời điểm khác nhau cho cùng một giá trị.
 *
 * Nên nếu image được build với một player origin rồi chạy với một cái khác:
 *   - iframe trỏ đúng player origin mới (URL sinh lúc chạy),
 *   - CSP vẫn chỉ cho phép cái cũ (nướng lúc build),
 *   - trình duyệt chặn iframe.
 *
 * Và triệu chứng KHÔNG phải một lỗi CSP dễ thấy, mà là "game không boot", "stage
 * 0x0" — nhìn y hệt lỗi đóng gói .sb3. Đã có người mất hàng giờ đi lục
 * packages/sb3 vì đúng cảnh này (ở dev là do lệch cổng, ở production là do quên
 * `--build`).
 *
 * Vì vậy: chết ngay lúc khởi động, với thông báo nói thẳng phải làm gì. Container
 * không lên còn hơn container lên mà mọi game đều là màn hình đen.
 */
function assertPlayerOriginMatchesBuild(): void {
  const built = process.env.BUILT_PLAYER_ORIGIN;

  // Không có nghĩa là đang chạy dev trên máy, không phải image Docker. Bỏ qua:
  // ở dev cả CSP lẫn URL đều đọc cùng một biến trong cùng một tiến trình.
  if (!built) return;

  const runtime = process.env.PLAYER_ORIGIN ?? 'http://127.0.0.1:3001';
  if (built === runtime) return;

  throw new Error(
    [
      'Cấu hình lệch: PLAYER_ORIGIN lúc chạy khác lúc build.',
      '',
      `  lúc build: ${built}`,
      `  lúc chạy:  ${runtime}`,
      '',
      'CSP frame-src của app đã bị nướng cứng theo giá trị lúc build, nên iframe',
      'game sẽ bị trình duyệt chặn và bạn sẽ thấy "game không boot" / "stage 0x0".',
      '',
      'Sửa: build lại image sau khi đổi PLAYER_DOMAIN trong infra/.env',
      '  docker compose up -d --build',
    ].join('\n')
  );
}

export function register(): void {
  assertPlayerOriginMatchesBuild();
}
