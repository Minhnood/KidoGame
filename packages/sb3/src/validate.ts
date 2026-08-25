import crypto from 'node:crypto';
import yazl from 'yazl';
import { readSb3Zip, type ZipEntry } from './zip.js';
import { ALLOWED_ASSET_EXTENSIONS, ALLOWED_EXTENSIONS, LIMITS } from './limits.js';
import { Sb3Error } from './errors.js';

export interface ProjectTarget {
  isStage?: boolean;
  name?: string;
  variables?: Record<string, unknown[]>;
  lists?: Record<string, unknown[]>;
  blocks?: Record<string, unknown>;
  costumes?: Array<{ md5ext?: string; assetId?: string; dataFormat?: string; name?: string }>;
  sounds?: Array<{ md5ext?: string; assetId?: string; dataFormat?: string; name?: string }>;
}

export interface ProjectJson {
  targets?: ProjectTarget[];
  extensions?: string[];
  extensionURLs?: Record<string, string>;
  monitors?: unknown[];
  meta?: { semver?: string; vm?: string; agent?: string };
}

export interface Sb3Warning {
  code: 'CLOUD_VARIABLES' | 'STRIPPED_FILES' | 'LARGE_RUNTIME';
  message: string;
  detail?: string;
}

export interface NormalizedSb3 {
  /** Bản .sb3 đã re-zip, chỉ chứa file được project.json tham chiếu. Đây là bản canonical. */
  sb3: Buffer;
  sha256: string;
  projectJson: ProjectJson;
  /** Đếm sprite/asset để hiển thị và làm thống kê. */
  stats: { targets: number; costumes: number; sounds: number; blocks: number };
  warnings: Sb3Warning[];
}

export interface ValidateOptions {
  /** Wordlist thô (đã lowercase). Truyền từ ngoài để dễ cập nhật, không hardcode. */
  profanity?: string[];
}

const assetExt = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

/** md5ext của asset, chịu được project cũ chỉ có assetId + dataFormat. */
function assetRef(a: { md5ext?: string; assetId?: string; dataFormat?: string }): string | null {
  if (a.md5ext) return a.md5ext;
  if (a.assetId && a.dataFormat) return `${a.assetId}.${a.dataFormat}`;
  return null;
}

/** Gom mọi chuỗi trong project.json để quét từ ngữ không phù hợp. */
export function extractStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 30 || out.length > 20000) return out;
  if (typeof value === 'string') {
    if (value.length <= 500) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) extractStrings(v, out, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) extractStrings(v, out, depth + 1);
  }
  return out;
}

function hasProfanity(strings: string[], words: string[]): string | null {
  if (!words.length) return null;
  for (const s of strings) {
    const hay = s.toLowerCase();
    for (const w of words) {
      /*
       * Ranh giới thô: chặn "hell" khớp trong "hello" — chỉ tính là khớp khi hai
       * bên KHÔNG phải chữ/số.
       *
       * Lưu ý mức bảo đảm thật sự yếu hơn nghe tưởng: dấu câu, xuống dòng, ngoặc,
       * gạch nối đều được coi là ranh giới hợp lệ. Nên một token 2 ký tự vẫn khớp
       * rất dễ khi quét lượng chuỗi lớn. Vì vậy chọn wordlist theo bề mặt quét là
       * việc của người GỌI hàm này — xem apps/web/src/lib/profanity.ts.
       */
      const i = hay.indexOf(w);
      if (i === -1) continue;
      const before = i === 0 ? ' ' : hay[i - 1];
      const after = i + w.length >= hay.length ? ' ' : hay[i + w.length];
      if (!/[a-z0-9à-ỹ]/.test(before) && !/[a-z0-9à-ỹ]/.test(after)) return w;
    }
  }
  return null;
}

/**
 * Kiểm tra + chuẩn hoá một file .sb3 do người dùng upload.
 *
 * Trả về bản .sb3 đã re-zip chỉ gồm project.json và các asset thực sự được tham
 * chiếu. Mọi thứ khác trong zip gốc bị bỏ đi — đây là chỗ payload ẩn hay nằm, và
 * re-zip là cách chắc chắn hơn nhiều so với cố gắng phát hiện từng loại.
 */
export async function validateAndNormalize(
  input: Buffer,
  opts: ValidateOptions = {}
): Promise<NormalizedSb3> {
  const entries = await readSb3Zip(input);
  const byName = new Map<string, ZipEntry>(entries.map((e) => [e.name, e]));
  const warnings: Sb3Warning[] = [];

  const pj = byName.get('project.json');
  if (!pj) {
    throw new Sb3Error('MISSING_PROJECT_JSON', 'File này không phải file Scratch (.sb3) hợp lệ.');
  }
  if (pj.data.length > LIMITS.MAX_PROJECT_JSON_BYTES) {
    throw new Sb3Error('PROJECT_JSON_TOO_LARGE', 'Dự án Scratch quá phức tạp.');
  }

  let project: ProjectJson;
  try {
    project = JSON.parse(pj.data.toString('utf8')) as ProjectJson;
  } catch (e) {
    throw new Sb3Error(
      'PROJECT_JSON_INVALID',
      'File game bị lỗi, thử lưu lại từ Scratch rồi tải lên lần nữa nhé.',
      (e as Error).message
    );
  }
  if (!project || !Array.isArray(project.targets) || project.targets.length === 0) {
    throw new Sb3Error('PROJECT_JSON_INVALID', 'File game không có nội dung nào.');
  }

  // --- Extension: chặn trước, vì đây là đường dẫn tới arbitrary code execution ---
  for (const ext of project.extensions ?? []) {
    if (typeof ext !== 'string') {
      throw new Sb3Error('DISALLOWED_EXTENSION', 'Game dùng tiện ích không được hỗ trợ.');
    }
    if (/^https?:\/\//i.test(ext)) {
      throw new Sb3Error(
        'CUSTOM_EXTENSION_URL',
        'Game dùng tiện ích tuỳ chỉnh từ internet nên không thể đăng ở đây.',
        ext
      );
    }
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Sb3Error('DISALLOWED_EXTENSION', `Game dùng tiện ích chưa được hỗ trợ: ${ext}`, ext);
    }
  }
  if (project.extensionURLs && Object.keys(project.extensionURLs).length > 0) {
    throw new Sb3Error(
      'CUSTOM_EXTENSION_URL',
      'Game dùng tiện ích tuỳ chỉnh từ internet nên không thể đăng ở đây.',
      JSON.stringify(project.extensionURLs).slice(0, 200)
    );
  }

  // --- Đối chiếu asset hai chiều ---
  const referenced = new Set<string>(['project.json']);
  const stats = { targets: project.targets.length, costumes: 0, sounds: 0, blocks: 0 };

  for (const target of project.targets) {
    stats.blocks += Object.keys(target.blocks ?? {}).length;
    for (const [kind, list] of [
      ['costumes', target.costumes ?? []],
      ['sounds', target.sounds ?? []],
    ] as const) {
      for (const a of list) {
        const ref = assetRef(a);
        if (!ref) {
          throw new Sb3Error('MISSING_ASSET', 'File game thiếu hình ảnh hoặc âm thanh.');
        }
        if (!ALLOWED_ASSET_EXTENSIONS.has(assetExt(ref))) {
          throw new Sb3Error('DISALLOWED_ASSET_TYPE', 'File game chứa loại tệp không hợp lệ.', ref);
        }
        if (!byName.has(ref)) {
          throw new Sb3Error(
            'MISSING_ASSET',
            'File game thiếu hình ảnh hoặc âm thanh, thử lưu lại từ Scratch nhé.',
            ref
          );
        }
        referenced.add(ref);
        if (kind === 'costumes') stats.costumes++;
        else stats.sounds++;
      }
    }
  }

  const stripped = entries.filter((e) => !referenced.has(e.name)).map((e) => e.name);
  if (stripped.length > 0) {
    warnings.push({
      code: 'STRIPPED_FILES',
      message: `Đã loại bỏ ${stripped.length} tệp thừa không được dùng trong game.`,
      detail: stripped.slice(0, 20).join(', '),
    });
  }

  // --- Cloud variable: không chặn, chỉ cảnh báo (runtime không có cloud server) ---
  const stage = project.targets.find((t) => t.isStage);
  const cloudVars = Object.values(stage?.variables ?? {}).filter(
    (v) => Array.isArray(v) && (v[2] === true || (typeof v[0] === 'string' && v[0].startsWith('☁')))
  );
  if (cloudVars.length > 0) {
    warnings.push({
      code: 'CLOUD_VARIABLES',
      message: 'Game dùng biến đám mây (☁) — phần này sẽ không hoạt động khi chơi trên KidoGame.',
      detail: `${cloudVars.length} biến`,
    });
  }

  // --- Quét từ ngữ ---
  const bad = hasProfanity(extractStrings(project), opts.profanity ?? []);
  if (bad) {
    throw new Sb3Error('PROFANITY', 'Game có chứa từ ngữ không phù hợp.', bad);
  }

  // --- Re-zip bản sạch, tất định để sha256 ổn định ---
  const sb3 = await rezip(entries.filter((e) => referenced.has(e.name)));
  const sha256 = crypto.createHash('sha256').update(sb3).digest('hex');

  return { sb3, sha256, projectJson: project, stats, warnings };
}

/** Zip tất định: thứ tự cố định, mtime cố định -> cùng input cho ra cùng sha256. */
function rezip(entries: ZipEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const sorted = [...entries].sort((a, b) =>
      a.name === 'project.json' ? -1 : b.name === 'project.json' ? 1 : a.name.localeCompare(b.name)
    );
    for (const e of sorted) {
      zip.addBuffer(e.data, e.name, { mtime: new Date(0), mode: 0o644, compress: true });
    }
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.end();
  });
}
