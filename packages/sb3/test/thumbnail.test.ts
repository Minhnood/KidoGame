import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { renderThumbnail, THUMB_WIDTH, THUMB_HEIGHT } from '../src/thumbnail.js';
import { validateAndNormalize } from '../src/validate.js';
import { readSb3Zip } from '../src/zip.js';
import { validSb3, validProject, BACKDROP_ID, SPRITE_ID, BACKDROP, SPRITE } from './fixtures.js';

async function thumbOf(sb3: Buffer) {
  const r = await validateAndNormalize(sb3);
  const entries = await readSb3Zip(r.sb3);
  return renderThumbnail(entries, r.projectJson);
}

describe('sinh thumbnail', () => {
  it('cho ra ảnh webp đúng kích thước', async () => {
    const png = await thumbOf(await validSb3());
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(THUMB_WIDTH);
    expect(meta.height).toBe(THUMB_HEIGHT);
  });

  it('ghép được sprite lên nền — ảnh không đơn sắc', async () => {
    const webp = await thumbOf(await validSb3());
    const { dominant } = await sharp(webp).stats();
    // Sprite màu cam #ff8c1a phải làm ảnh khác hẳn nền trắng/đen trơn.
    const raw = await sharp(webp).raw().toBuffer();
    const unique = new Set<string>();
    for (let i = 0; i < raw.length; i += 3 * 997) {
      unique.add(`${raw[i]},${raw[i + 1]},${raw[i + 2]}`);
    }
    expect(unique.size).toBeGreaterThan(1);
    expect(dominant).toBeDefined();
  });

  it('không ném lỗi khi asset hỏng, vẫn trả ảnh hợp lệ', async () => {
    const project = validProject();
    // project.json hợp lệ nhưng nội dung svg là rác.
    const entries = [
      { name: 'project.json', data: Buffer.from(JSON.stringify(project)) },
      { name: `${BACKDROP_ID}.svg`, data: Buffer.from('không phải svg gì cả') },
      { name: `${SPRITE_ID}.svg`, data: Buffer.from('\x00\x01\x02 rác') },
    ];
    const webp = await renderThumbnail(entries, project);
    const meta = await sharp(webp).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(THUMB_WIDTH);
  });

  it('không ném lỗi khi thiếu hoàn toàn asset', async () => {
    const project = validProject();
    const webp = await renderThumbnail([], project);
    const meta = await sharp(webp).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(THUMB_WIDTH);
  });

  it('không ném lỗi với project.json rỗng', async () => {
    const webp = await renderThumbnail([], { targets: [] });
    expect((await sharp(webp).metadata()).format).toBe('webp');
  });

  it('rasterize được SVG khai báo kích thước rất nhỏ', async () => {
    // Backdrop mặc định của Scratch là 2x2px — nếu chỉ phóng to sẽ ra ảnh vỡ.
    const png = await sharp(BACKDROP, { density: 300 }).resize(480, 360, { fit: 'inside' }).png().toBuffer();
    expect((await sharp(png).metadata()).width).toBeGreaterThan(2);
    expect(SPRITE.length).toBeGreaterThan(0);
  });
});
