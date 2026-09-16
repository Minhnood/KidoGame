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

