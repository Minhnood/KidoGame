import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  MAX_COVER_IMAGE_BYTES,
  normalizeCoverImage,
  renderCoverOptions,
  renderThumbnail,
  THUMB_WIDTH,
  THUMB_HEIGHT,
} from '../src/thumbnail.js';
import type { ProjectJson } from '../src/validate.js';
import { validateAndNormalize } from '../src/validate.js';
import { readSb3Zip } from '../src/zip.js';
import { validSb3, validProject, BACKDROP_ID, SPRITE_ID, BACKDROP, SPRITE, md5 } from './fixtures.js';

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

describe('các bìa để bé chọn', () => {
  const svg = (mau: string) =>
    Buffer.from(
      `<svg version="1.1" width="48" height="48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="20" fill="${mau}"/></svg>`
    );
  const nenSvg = (mau: string) =>
    Buffer.from(
      `<svg version="1.1" width="480" height="360" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="360" fill="${mau}"/></svg>`
    );
  const costume = (buf: Buffer) => {
    const id = md5(buf);
    return { name: id, dataFormat: 'svg', assetId: id, md5ext: `${id}.svg` };
  };
  const entry = (buf: Buffer) => ({ name: `${md5(buf)}.svg`, data: buf });

  /** Hai cảnh nền, ba nhân vật màu khác nhau. */
  function nhieuThu(nhanVat: Buffer[] = [svg('#ff0000'), svg('#00aa00'), svg('#0000ff')]) {
    const nen = [nenSvg('#ffee88'), nenSvg('#88ccff')];
    const project = {
      targets: [
        { isStage: true, name: 'Stage', costumes: nen.map(costume) },
        ...nhanVat.map((b, i) => ({ isStage: false, name: `NV${i}`, costumes: [costume(b)] })),
      ],
    } as unknown as ProjectJson;
    return { project, entries: [...nen, ...nhanVat].map(entry) };
  }

  it('bìa đầu tiên giống hệt renderThumbnail (bìa mặc định)', async () => {
    const { project, entries } = nhieuThu();
    const [dau] = await renderCoverOptions(entries, project);
    expect(dau.equals(await renderThumbnail(entries, project))).toBe(true);
  });

  it('đủ lựa chọn: nhân vật khác, cảnh nền khác, nền không nhân vật — không trùng nhau', async () => {
    const { project, entries } = nhieuThu();
    const bia = await renderCoverOptions(entries, project);
    // 1 mặc định + 2 nhân vật khác + 1 cảnh nền khác + 1 nền trơn
    expect(bia.length).toBe(5);
    const khac = new Set(bia.map((b) => md5(b)));
    expect(khac.size).toBe(5);
  });

  it('không vượt trần', async () => {
    const { project, entries } = nhieuThu();
    expect((await renderCoverOptions(entries, project, 2)).length).toBe(2);
  });

  it('hai nhân vật cùng một hình thì không thành hai bìa giống nhau', async () => {
    const cungHinh = svg('#ff0000');
    const { project, entries } = nhieuThu([cungHinh, cungHinh]);
    const bia = await renderCoverOptions(entries, project);
    expect(new Set(bia.map((b) => md5(b))).size).toBe(bia.length);
    expect(bia.length).toBe(3); // mặc định, cảnh nền khác, nền trơn
  });

  it('project rỗng vẫn có đúng một bìa, không ném lỗi', async () => {
    const bia = await renderCoverOptions([], { targets: [] });
    expect(bia.length).toBe(1);
    expect((await sharp(bia[0]).metadata()).format).toBe('webp');
  });
});

describe('ảnh bìa bé tự tải', () => {
  const anh = (w: number, h: number, dinhDang: 'jpeg' | 'png' | 'webp' = 'jpeg') =>
    sharp({ create: { width: w, height: h, channels: 3, background: '#3a86ff' } })[dinhDang]().toBuffer();

  it('ra WebP 480×360 dù ảnh vào khổ nào', async () => {
    for (const [w, h] of [[1200, 1600], [4000, 1000], [30, 20]]) {
      const ra = await normalizeCoverImage(await anh(w, h));
      const m = await sharp(ra).metadata();
      expect([m.format, m.width, m.height]).toEqual(['webp', THUMB_WIDTH, THUMB_HEIGHT]);
    }
  });

  it('bỏ sạch EXIF, kể cả toạ độ GPS', async () => {
    const coGps = await sharp(await anh(800, 600))
      .withExif({
        IFD0: { Make: 'DienThoaiCuaBe' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '21/1 1/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '105/1 51/1 0/1' },
      })
      .jpeg()
      .toBuffer();
    expect((await sharp(coGps).metadata()).exif?.toString('latin1')).toContain('DienThoaiCuaBe');
    const m = await sharp(await normalizeCoverImage(coGps)).metadata();
    expect(m.exif).toBeUndefined();
    expect(m.xmp).toBeUndefined();
  });

  it('xoay đúng chiều theo cờ Orientation trước khi bỏ EXIF', async () => {
    // Ảnh ngang 800×400, nửa trái đỏ nửa phải xanh; Orientation 6 = cần xoay 90° mới đúng.
    const tron = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#ff0000' } })
      .composite([{ input: await sharp({ create: { width: 400, height: 400, channels: 3, background: '#0000ff' } }).png().toBuffer(), left: 400, top: 0 }])
      .jpeg()
      .toBuffer();
    const coCo = await sharp(tron).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const ra = await normalizeCoverImage(coCo);
    const { data } = await sharp(ra).raw().toBuffer({ resolveWithObject: true });
    // Xoay 90° theo chiều kim đồng hồ: nửa đỏ lên TRÊN. Điểm giữa mép trên phải đỏ.
    const i = (5 * THUMB_WIDTH + Math.floor(THUMB_WIDTH / 2)) * 3;
    expect(data[i]).toBeGreaterThan(150);
    expect(data[i + 2]).toBeLessThan(100);
  });

  it('từ chối thứ không phải ảnh, SVG, và ảnh có kích thước khổng lồ', async () => {
    await expect(normalizeCoverImage(Buffer.from('không phải ảnh'))).rejects.toThrow(/không dùng được/);
    await expect(normalizeCoverImage(SPRITE)).rejects.toThrow(/không dùng được/);
    const khongLo = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: '#ffffff' } }).png().toBuffer();
    expect(khongLo.length).toBeLessThan(MAX_COVER_IMAGE_BYTES);
    await expect(normalizeCoverImage(khongLo)).rejects.toThrow(/quá lớn/);
  });
});
