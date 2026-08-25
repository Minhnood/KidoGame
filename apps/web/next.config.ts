import type { NextConfig } from 'next';

const PLAYER_ORIGIN = process.env.PLAYER_ORIGIN ?? 'http://127.0.0.1:3001';

/**
 * CSP của app origin.
 *
 * `frame-src` chỉ cho phép đúng player origin, và app origin KHÔNG BAO GIỜ serve
 * file của người dùng — đó là cặp ràng buộc giữ cho một game độc hại không chạm
 * được vào session của người đang đăng nhập.
 *
 * `script-src 'unsafe-inline'` là do Next cần inline script để hydrate. Đường
 * nâng cấp là dùng nonce qua middleware — nên làm trước khi mở public.
 */
const isDev = process.env.NODE_ENV === 'development';

/*
 * `next dev` build bundle client bằng devtool eval-source-map, nên CSP không có
 * 'unsafe-eval' sẽ chặn thẳng bundle đó: client component không hydrate được,
 * form upload và bộ đếm lượt chơi im lặng không chạy. Bản production không dùng
 * eval nên chỉ nới đúng ở dev.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${PLAYER_ORIGIN}`,
  `frame-src ${PLAYER_ORIGIN}`,
  `connect-src 'self'`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

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
          { key: 'Content-Security-Policy', value: csp },
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
