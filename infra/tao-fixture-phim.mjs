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
import { zip } from './e2e-zip.mjs';

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

const out = zip([
  { ten: 'project.json', data: Buffer.from(JSON.stringify(project), 'utf8') },
  { ten: SVG_TEN, data: SVG_BUF },
]);

mkdirSync(dirname(RA), { recursive: true });
writeFileSync(RA, out);

console.log(`✅ ${RA}`);
console.log(`   ${out.length} byte · costume ${SVG_TEN}`);
console.log(`   phím: right arrow, left arrow, up arrow, down arrow, space`);
