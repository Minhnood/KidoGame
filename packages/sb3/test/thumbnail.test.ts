import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { renderCoverOptions, renderThumbnail, THUMB_WIDTH, THUMB_HEIGHT } from '../src/thumbnail.js';
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
