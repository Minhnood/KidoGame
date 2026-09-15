import type { Instrumentation } from 'next';

/**
 * Next gọi hàm này cho MỌI lỗi server chưa ai bắt: render, route handler, server
 * action, middleware. Lỗi đi tiếp lên GlitchTip qua `lib/glitchtip.ts`.
 *
 * Import động: file này nạp ở cả runtime nodejs lẫn edge lúc khởi động, còn bộ gửi
 * chỉ cần khi thật sự có lỗi.
 *
 * Header của request (`request.headers`) CỐ Ý không truyền xuống: trong đó có cookie
 * phiên và IP. Chỉ đường dẫn và method đi tiếp, và đường dẫn bị cắt query ở bên kia.
 *
 * KHÔNG `await` việc gửi. Đo ở dev: Next CHỜ hàm này xong mới trả trang lỗi, nên có
 * `await` thì GlitchTip treo là mỗi trang lỗi chậm thêm đúng bằng timeout (3037ms).
 * Server chạy lâu dài trong container chứ không phải serverless, nên promise vẫn chạy
 * hết sau khi response đã đi.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { guiLoiServer } = await import('./lib/glitchtip');
  void guiLoiServer(error, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
