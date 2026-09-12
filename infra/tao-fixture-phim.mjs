/**
 * Dựng một file `.sb3` tối thiểu CÓ DÙNG PHÍM, để `e2e-touch` có fixture của riêng nó.
 *
 * ═══ VÌ SAO CẦN ═══
 *
 * `e2e-touch` đo cụm nút cảm ứng, mà cụm đó chỉ được sinh ra khi project thật sự dùng
 * phím — `detectTouchKeys` đọc `KEY_OPTION` trong project.json. Fixture chung của repo
 * (`SB3_FIXTURE`) không có phím nào, nên tới giờ bộ này phải trỏ `GAME_URL` vào một
 * game NẰM SẴN TRONG DB DEV.
 *
 * Cách đó hỏng theo kiểu tệ nhất: dọn DB dev, hoặc chạy một bộ kiểm khác có xoá gia
 * đình, là game ấy biến mất — và `e2e-touch` đỏ ở phép "không thấy nút điều khiển
 * nào", đọc lên y hệt như sản phẩm vỡ. Bàn giao đã ghi bẫy này một lần rồi.
 *
 * File dựng ra nằm ngoài repo theo mặc định (`storage/` bị .gitignore).
 *
 * Chạy:
 *   node infra/tao-fixture-phim.mjs [duong-dan-ra.sb3]
 */
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const RA = resolve(process.argv[2] ?? 'storage/fixtures/phim.sb3');

/*
 * Costume là một SVG viết tay, không phải ảnh mượn ở đâu.
 *
 * `validateAndNormalize` chỉ giữ asset ĐƯỢC THAM CHIẾU và đòi tên file đúng bằng
 * md5 của nội dung, nên md5 phải tính từ chính chuỗi này — chép cứng một chuỗi md5
 * từ project khác là file hỏng mà không có gì nói ra cho tới lúc upload.
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#f4a259"/><circle cx="17" cy="20" r="3" fill="#2b2b2b"/><circle cx="31" cy="20" r="3" fill="#2b2b2b"/><path d="M15 30q9 7 18 0" stroke="#2b2b2b" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
const SVG_BUF = Buffer.from(SVG, 'utf8');
const SVG_MD5 = createHash('md5').update(SVG_BUF).digest('hex');
const SVG_TEN = `${SVG_MD5}.svg`;

/** Một khối `khi bấm phím X` + `đổi x một chút`, cho mỗi phím. */
function khoiPhim(idx, phim, truc, delta) {
  const idKhiBam = `phim${idx}`;
  const idDoi = `doi${idx}`;
  return {
    [idKhiBam]: {
      opcode: 'event_whenkeypressed',
      next: idDoi,
      parent: null,
      inputs: {},
      fields: { KEY_OPTION: [phim, null] },
      shadow: false,
      topLevel: true,
      x: 40,
      y: 40 + idx * 140,
    },
    [idDoi]: {
      opcode: truc === 'x' ? 'motion_changexby' : 'motion_changeyby',
      next: null,
      parent: idKhiBam,
      inputs: { [truc === 'x' ? 'DX' : 'DY']: [1, [4, String(delta)]] },
      fields: {},
      shadow: false,
      topLevel: false,
    },
  };
}

/*
 * Bốn mũi tên + phím cách. Đúng bộ mà `detectTouchKeys` xếp thành D-pad bốn hướng
 * cộng một nút hành động — tức là fixture này bắt được cả hai nhánh của hàm đó, chứ
 * không chỉ nhánh dễ.
 */
const blocks = {
  ...khoiPhim(0, 'right arrow', 'x', 10),
  ...khoiPhim(1, 'left arrow', 'x', -10),
  ...khoiPhim(2, 'up arrow', 'y', 10),
  ...khoiPhim(3, 'down arrow', 'y', -10),
  ...khoiPhim(4, 'space', 'y', 40),
};

const project = {
  targets: [
    {
      isStage: true,
      name: 'Stage',
      variables: {},
      lists: {},
      broadcasts: {},
      blocks: {},
      comments: {},
      currentCostume: 0,
      costumes: [
        {
          name: 'nen',
          bitmapResolution: 1,
          dataFormat: 'svg',
          assetId: SVG_MD5,
          md5ext: SVG_TEN,
          rotationCenterX: 24,
          rotationCenterY: 24,
        },
      ],
      sounds: [],
      volume: 100,
      layerOrder: 0,
      tempo: 60,
      videoTransparency: 50,
      videoState: 'off',
      textToSpeechLanguage: null,
    },
    {
      isStage: false,
      name: 'Ban nho',
      variables: {},
      lists: {},
      broadcasts: {},
      blocks,
      comments: {},
      currentCostume: 0,
      costumes: [
        {
          name: 'ban nho',
          bitmapResolution: 1,
          dataFormat: 'svg',
          assetId: SVG_MD5,
          md5ext: SVG_TEN,
          rotationCenterX: 24,
          rotationCenterY: 24,
        },
      ],
      sounds: [],
      volume: 100,
      layerOrder: 1,
      visible: true,
      x: 0,
      y: 0,
      size: 100,
      direction: 90,
      draggable: false,
      rotationStyle: 'all around',
    },
  ],
  monitors: [],
  extensions: [],
  meta: { semver: '3.0.0', vm: '2.3.0', agent: 'KidoGame fixture' },
};

/* ── ZIP tự viết ─────────────────────────────────────────────────────────────
 * Không kéo thêm thư viện nén chỉ để ghi hai file. `readSb3Zip` của repo đọc được
 * cả stored lẫn deflate; dùng deflate cho project.json vì JSON nén rất tốt.
 */
function zip(files) {
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

const out = zip([
  { ten: 'project.json', data: Buffer.from(JSON.stringify(project), 'utf8') },
  { ten: SVG_TEN, data: SVG_BUF },
]);

mkdirSync(dirname(RA), { recursive: true });
writeFileSync(RA, out);

console.log(`✅ ${RA}`);
console.log(`   ${out.length} byte · costume ${SVG_TEN}`);
console.log(`   phím: right arrow, left arrow, up arrow, down arrow, space`);
