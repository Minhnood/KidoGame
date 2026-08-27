import type { NextConfig } from 'next';

/*
 * CSP KHÔNG còn ở đây — nó nằm trong `src/middleware.ts`.
 *
 * Hai lý do, cả hai đều bắt buộc chứ không phải sở thích:
 *
 * 1. Policy phải mang một `nonce` MỚI cho mỗi request thì mới bỏ được
 *    `script-src 'unsafe-inline'`. `headers()` ở đây trả về giá trị tĩnh, không
 *    có chỗ nào sinh được giá trị theo từng request.
 *
 * 2. `headers()` được Next đánh giá LÚC BUILD rồi nướng vào
 *    .next/routes-manifest.json. Khi CSP còn ở đây, `frame-src` lấy PLAYER_ORIGIN
 *    tại thời điểm build, trong khi `objectUrl()` đọc biến đó lúc chạy — hai thời
 *    điểm khác nhau cho cùng một giá trị. Đã hỏng thật khi deploy Docker: iframe
 *    trỏ đúng player domain nhưng CSP vẫn chỉ cho phép mặc định của dev, và triệu
 *    chứng là "game không boot" / "stage 0x0", nhìn y hệt lỗi đóng gói.
 *
 * Các header an ninh CÒN LẠI vẫn ở đây, vì chúng tĩnh thật và cần áp cho mọi
 * đường dẫn, kể cả những đường mà middleware cố ý bỏ qua (/_next/static...).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  /*
   * @kidogame/sb3 KHÔNG được bundle, phải để Node require lúc chạy.
   *
   * Lý do: bên trong nó dùng `createRequire` để nạp @turbowarp/packager.
   * Webpack nhận diện được cả `createRequire(import.meta.url)` (đổi tên biến
   * cũng không thoát), nên nếu bundle thì webpack sẽ kéo packager vào và chọn
   * nhánh code dành cho browser — biểu hiện là lỗi "XMLHttpRequest is not
   * defined" khi chạy trên server.
   *
   * Để external thì packages/sb3 hành xử như một package npm bình thường:
   * Node đọc dist/index.js, và createRequire phân giải @turbowarp/packager
   * từ đúng node_modules của packages/sb3.
   *
   * Kèm theo: chạy `pnpm --filter @kidogame/sb3 build` sau khi sửa packages/sb3.
   */
  serverExternalPackages: ['@kidogame/sb3', 'sharp'],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
