import { describe, it, expect } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import { validateAndNormalize } from '../src/validate.js';
import { packageToHtml } from '../src/package.js';
import { validSb3, validProject } from './fixtures.js';

describe('đóng gói .sb3 -> HTML', () => {
  it('sinh ra HTML standalone', async () => {
    const { sb3 } = await validateAndNormalize(await validSb3());
    const out = await packageToHtml(sb3, { title: 'Game của bé' });

    expect(out.html.subarray(0, 15).toString()).toBe('<!DOCTYPE html>');
    expect(out.html.length).toBeGreaterThan(1_000_000); // runtime được nhúng vào
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out.html.toString('utf8', 0, 4000)).toContain('Game của bé');
  }, 60_000);

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
      expect(out.html.length).toBeGreaterThan(1_000_000);
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
