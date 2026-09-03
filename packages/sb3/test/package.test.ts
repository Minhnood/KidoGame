import { describe, it, expect } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import { validateAndNormalize } from '../src/validate.js';
import { packageToHtml, runtimePath } from '../src/package.js';
import { validSb3, validProject } from './fixtures.js';

describe('đóng gói .sb3 -> HTML', () => {
  it('sinh ra HTML nhẹ, runtime nằm ở file riêng', async () => {
    const { sb3 } = await validateAndNormalize(await validSb3());
    const out = await packageToHtml(sb3, { title: 'Game của bé' });

    expect(out.html.subarray(0, 15).toString()).toBe('<!DOCTYPE html>');
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out.html.toString('utf8', 0, 4000)).toContain('Game của bé');

    /*
     * Đây là phép kiểm canh cả cân nặng của sản phẩm.
     *
     * Trước bản tách runtime, MỌI game đều ~1800 KB vì packager nhúng nguyên bộ
     * scratch-vm vào từng file — ~19 giây mỗi game trên 3G yếu. Ngưỡng 200 KB
     * dưới đây là cái chặn việc runtime lặng lẽ quay lại nằm trong HTML.
     */
    expect(out.html.length).toBeLessThan(200_000);
    expect(out.runtime.js.length).toBeGreaterThan(1_000_000);
    expect(out.runtime.sha256).toMatch(/^[0-9a-f]{64}$/);
  }, 60_000);

  it('HTML trỏ tới đúng đường dẫn của runtime, và không kèm origin', async () => {
    const { sb3 } = await validateAndNormalize(await validSb3());
    const out = await packageToHtml(sb3, { title: 'T' });
    const s = out.html.toString('utf8');

    expect(s).toContain(`<script src="${runtimePath(out.runtime.sha256)}"></script>`);
    /*
     * Đường dẫn phải tính từ gốc origin, KHÔNG mang http://… vào.
     *
     * HTML là file tĩnh bất biến, đóng gói một lần rồi phục vụ mãi. Nhúng origin
     * của máy dev vào là file ấy hỏng trên production, và hỏng im lặng: trang mở
     * ra, khung game hiện, runtime không tải được.
     */
    expect(runtimePath(out.runtime.sha256).startsWith('/runtime/')).toBe(true);
    expect(s).not.toContain('src="http');

    /*
     * KHÔNG được có `defer`/`async`: script ngoài không mang hai thuộc tính đó mới
     * chạy xong trước đoạn khởi động nội tuyến đứng sau nó. Thêm vào là stage trắng
     * chứ không phải một lỗi đọc được.
     */
    expect(s).not.toMatch(/<script[^>]*\bsrc="\/runtime\/[^"]*"[^>]*\b(defer|async)\b/);
  }, 60_000);

  it('runtime giống hệt nhau giữa hai game khác nhau', async () => {
    /*
     * Đây là điều kiện để việc tách có ý nghĩa: nếu runtime khác nhau theo từng
     * game thì mỗi game vẫn là một file 1.75 MB, chỉ đổi chỗ chứ không nhẹ đi.
     */
    const a = await validateAndNormalize(await validSb3());
    const b = await validateAndNormalize(await validSb3([], validProject({ extensions: [] })));
    const outA = await packageToHtml(a.sb3, { title: 'A' });
    const outB = await packageToHtml(b.sb3, { title: 'B' });

    expect(outA.runtime.sha256).toBe(outB.runtime.sha256);
    expect(outA.sha256).not.toBe(outB.sha256);
  }, 120_000);

  it('không kết nối cloud server của bên thứ ba', async () => {
    const { sb3 } = await validateAndNormalize(await validSb3());
    const out = await packageToHtml(sb3, { title: 'T' });
    const s = out.html.toString('utf8');
    expect(s).not.toContain('clouddata.turbowarp.org');
  }, 60_000);

  it('chạy được hoàn toàn offline', async () => {
    // Nếu packager lén tải runtime từ mạng, test này sẽ đổ.
    const realFetch = globalThis.fetch;
    const realHttpReq = http.request;
    const realHttpsReq = https.request;
    const blocked = () => {
      throw new Error('NETWORK BLOCKED');
    };
    globalThis.fetch = blocked as unknown as typeof fetch;
    http.request = blocked as unknown as typeof http.request;
    https.request = blocked as unknown as typeof https.request;

    try {
      const { sb3 } = await validateAndNormalize(await validSb3());
      const out = await packageToHtml(sb3, { title: 'Offline' });
      expect(out.runtime.js.length).toBeGreaterThan(1_000_000);
    } finally {
      globalThis.fetch = realFetch;
      http.request = realHttpReq;
      https.request = realHttpsReq;
    }
  }, 60_000);

  it('báo cáo usesMusic để tính dung lượng runtime', async () => {
    const p = validProject({ extensions: ['music'] });
    const { sb3 } = await validateAndNormalize(await validSb3([], p));
    const out = await packageToHtml(sb3, { title: 'Music' });
    expect(typeof out.usesMusic).toBe('boolean');
  }, 60_000);
});
