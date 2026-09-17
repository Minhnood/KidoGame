import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { deflateRawSync } from 'node:zlib';

/* ── ZIP tự viết, dùng chung cho các script dựng file .sb3 mẫu ────────────────
 *
 * `files`: mảng `{ ten, data: Buffer }`.
 * Không kéo thêm thư viện nén chỉ để ghi hai file. `readSb3Zip` của repo đọc được
 * cả stored lẫn deflate; dùng deflate cho project.json vì JSON nén rất tốt.
 */
export function zip(files) {
  const cuc = [];
  const muc = [];
  let offset = 0;

  for (const { ten, data } of files) {
    const tenBuf = Buffer.from(ten, 'utf8');
    const nen = deflateRawSync(data);
    const crc = crc32(data);

    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0, 6);
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(0, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(nen.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(tenBuf.length, 26);
    head.writeUInt16LE(0, 28);

    cuc.push(head, tenBuf, nen);

    const ent = Buffer.alloc(46);
    ent.writeUInt32LE(0x02014b50, 0);
    ent.writeUInt16LE(20, 4);
    ent.writeUInt16LE(20, 6);
    ent.writeUInt16LE(0, 8);
    ent.writeUInt16LE(8, 10);
    ent.writeUInt32LE(crc, 16);
    ent.writeUInt32LE(nen.length, 20);
    ent.writeUInt32LE(data.length, 24);
    ent.writeUInt16LE(tenBuf.length, 28);
    ent.writeUInt32LE(offset, 42);
    muc.push(ent, tenBuf);

    offset += head.length + tenBuf.length + nen.length;
  }

  const trungTam = Buffer.concat(muc);
  const duoi = Buffer.alloc(22);
  duoi.writeUInt32LE(0x06054b50, 0);
  duoi.writeUInt16LE(files.length, 8);
  duoi.writeUInt16LE(files.length, 10);
  duoi.writeUInt32LE(trungTam.length, 12);
  duoi.writeUInt32LE(offset, 16);

  return Buffer.concat([...cuc, trungTam, duoi]);
}

/**
 * Dựng một .sb3 vào `ra`: mỗi màu trong `nenMau` là một cảnh nền, mỗi màu trong `nvMau`
 * một nhân vật. Màu khác nhau là nội dung khác nhau, nên cũng là hash .sb3 và HTML khác
 * nhau — cách để một bộ kiểm có game KHÔNG trùng file với game nào khác trong DB.
 */
export function dungSb3(ra, nenMau, nvMau) {
  const hinh = (noiDung) => {
    const data = Buffer.from(noiDung, 'utf8');
    const id = createHash('md5').update(data).digest('hex');
    return { data, costume: { name: id, bitmapResolution: 1, dataFormat: 'svg', assetId: id, md5ext: `${id}.svg`, rotationCenterX: 24, rotationCenterY: 24 } };
  };
  const nen = nenMau.map((m) => hinh(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="${m}"/></svg>`));
  const nv = nvMau.map((m) => hinh(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="20" fill="${m}"/></svg>`));
  const chung = { variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0, sounds: [], volume: 100 };
  const project = {
    targets: [
      { ...chung, isStage: true, name: 'Stage', costumes: nen.map((h) => h.costume), layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null },
      ...nv.map((h, i) => ({ ...chung, isStage: false, name: `Nhan vat ${i}`, costumes: [h.costume], layerOrder: i + 1, visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around' })),
    ],
    monitors: [],
    extensions: [],
    meta: { semver: '3.0.0', vm: '2.3.0', agent: 'KidoGame e2e' },
  };
  const tenHinh = new Set();
  const files = [{ ten: 'project.json', data: Buffer.from(JSON.stringify(project), 'utf8') }];
  for (const h of [...nen, ...nv]) {
    if (tenHinh.has(h.costume.md5ext)) continue;
    tenHinh.add(h.costume.md5ext);
    files.push({ ten: h.costume.md5ext, data: h.data });
  }
  fs.writeFileSync(ra, zip(files));
  return ra;
}

let BANG_CRC = null;
function crc32(buf) {
  if (!BANG_CRC) {
    BANG_CRC = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      BANG_CRC[i] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = BANG_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

