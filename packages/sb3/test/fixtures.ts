import crypto from 'node:crypto';
import yazl from 'yazl';
import type { ProjectJson } from '../src/validate.js';

export const md5 = (b: Buffer) => crypto.createHash('md5').update(b).digest('hex');

export const BACKDROP = Buffer.from(
  '<svg version="1.1" width="2" height="2" viewBox="-1 -1 2 2" xmlns="http://www.w3.org/2000/svg"></svg>'
);
export const SPRITE = Buffer.from(
  '<svg version="1.1" width="48" height="48" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="24" cy="24" r="20" fill="#ff8c1a"/></svg>'
);

export const BACKDROP_ID = md5(BACKDROP);
export const SPRITE_ID = md5(SPRITE);

/** project.json hợp lệ tối thiểu: Stage + 1 sprite có script cờ xanh. */
export function validProject(overrides: Partial<ProjectJson> = {}): ProjectJson {
  return {
    targets: [
      {
        isStage: true,
        name: 'Stage',
        variables: {},
        lists: {},
        blocks: {},
        costumes: [
          {
            name: 'backdrop1',
            dataFormat: 'svg',
            assetId: BACKDROP_ID,
            md5ext: `${BACKDROP_ID}.svg`,
          },
        ],
        sounds: [],
      },
      {
        isStage: false,
        name: 'Ball',
        variables: {},
        lists: {},
        blocks: {
          hat: { opcode: 'event_whenflagclicked', next: 'turn', topLevel: true, inputs: {}, fields: {} },
          turn: {
            opcode: 'motion_turnright',
            next: null,
            parent: 'hat',
            inputs: { DEGREES: [1, [4, '15']] },
            fields: {},
          },
        },
        costumes: [
          { name: 'ball', dataFormat: 'svg', assetId: SPRITE_ID, md5ext: `${SPRITE_ID}.svg` },
        ],
        sounds: [],
      },
    ],
    monitors: [],
    extensions: [],
    meta: { semver: '3.0.0', vm: '5.0.0', agent: 'kidogame-test' },
    ...overrides,
  } as ProjectJson;
}

export interface FixtureEntry {
  name: string;
  data: Buffer;
}

/** Đóng gói thành .sb3 (zip). Cho phép tên entry tuỳ ý để test đường tấn công. */
export function makeSb3(entries: FixtureEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const e of entries) {
      zip.addBuffer(e.data, e.name, { mtime: new Date(0), mode: 0o644, compress: true });
    }
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.end();
  });
}

/**
 * Dựng zip có tên entry mà yazl từ chối tạo (vd. path traversal).
 *
 * yazl validate tên file nên không tạo trực tiếp được — ta tạo với placeholder
 * DÀI ĐÚNG BẰNG tên thật rồi thay byte. Tên file nằm ở cả local header lẫn
 * central directory, cùng độ dài nên mọi offset trong zip giữ nguyên.
 */
export async function makeSb3RawName(
  rawName: string,
  data: Buffer,
  rest: FixtureEntry[]
): Promise<Buffer> {
  const placeholder = 'z'.repeat(rawName.length);
  const zip = await makeSb3([...rest, { name: placeholder, data }]);

  const from = Buffer.from(placeholder, 'utf8');
  const to = Buffer.from(rawName, 'utf8');
  if (from.length !== to.length) {
    throw new Error('placeholder phải cùng độ dài byte với tên thật');
  }

  let i = 0;
  let replaced = 0;
  while ((i = zip.indexOf(from, i)) !== -1) {
    to.copy(zip, i);
    i += to.length;
    replaced++;
  }
  if (replaced < 2) {
    throw new Error(`chỉ thay được ${replaced} chỗ, cần cả local header và central directory`);
  }
  return zip;
}

/** .sb3 hợp lệ, có thể chèn thêm entry lạ để test bước strip. */
export function validSb3(extra: FixtureEntry[] = [], project = validProject()): Promise<Buffer> {
  return makeSb3([
    { name: 'project.json', data: Buffer.from(JSON.stringify(project)) },
    { name: `${BACKDROP_ID}.svg`, data: BACKDROP },
    { name: `${SPRITE_ID}.svg`, data: SPRITE },
    ...extra,
  ]);
}
