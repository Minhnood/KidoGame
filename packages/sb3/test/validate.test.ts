import { describe, it, expect } from 'vitest';
import { validateAndNormalize } from '../src/validate.js';
import { readSb3Zip } from '../src/zip.js';
import { Sb3Error } from '../src/errors.js';
import { LIMITS } from '../src/limits.js';
import {
  makeSb3,
  makeSb3RawName,
  validSb3,
  validProject,
  BACKDROP,
  BACKDROP_ID,
  SPRITE_ID,
} from './fixtures.js';

/** Chạy validate và trả về mã lỗi, fail test nếu KHÔNG ném lỗi. */
async function codeOf(input: Buffer | Promise<Buffer>, opts = {}): Promise<string> {
  try {
    await validateAndNormalize(await input, opts);
  } catch (e) {
    if (e instanceof Sb3Error) return e.code;
    throw e;
  }
  throw new Error('Đáng lẽ phải bị từ chối nhưng lại được chấp nhận');
}

describe('đường đi hợp lệ', () => {
  it('chấp nhận .sb3 hợp lệ và giữ nguyên asset được tham chiếu', async () => {
    const r = await validateAndNormalize(await validSb3());
    expect(r.stats.targets).toBe(2);
    expect(r.stats.costumes).toBe(2);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);

    const names = (await readSb3Zip(r.sb3)).map((e) => e.name).sort();
    expect(names).toEqual([`${SPRITE_ID}.svg`, `${BACKDROP_ID}.svg`, 'project.json'].sort());
  });

  it('re-zip là tất định — cùng input cho ra cùng sha256', async () => {
    const a = await validateAndNormalize(await validSb3());
    const b = await validateAndNormalize(await validSb3());
    expect(a.sha256).toBe(b.sha256);
  });
});

describe('chống zip bomb và path traversal', () => {
  it('từ chối file HTML đổi tên thành .sb3', async () => {
    const html = Buffer.from('<!DOCTYPE html><script>fetch("https://evil.example")</script>');
    expect(await codeOf(html)).toBe('NOT_A_ZIP');
  });

  it('từ chối entry có path traversal', async () => {
    // yazl không chịu tạo tên này, phải vá byte trực tiếp -> zip độc hại thật.
    const sb3 = await makeSb3RawName('../../../etc/passwd', Buffer.from('pwn'), [
      { name: 'project.json', data: Buffer.from(JSON.stringify(validProject())) },
      { name: `${BACKDROP_ID}.svg`, data: BACKDROP },
    ]);
    expect(await codeOf(sb3)).toBe('UNSAFE_ENTRY_NAME');
  });

  it('từ chối entry có đường dẫn tuyệt đối', async () => {
    const sb3 = await makeSb3RawName('/etc/cron.d/pwn', Buffer.from('pwn'), [
      { name: 'project.json', data: Buffer.from(JSON.stringify(validProject())) },
    ]);
    expect(await codeOf(sb3)).toBe('UNSAFE_ENTRY_NAME');
  });

  it('từ chối entry dùng dấu gạch chéo ngược kiểu Windows', async () => {
    const sb3 = await makeSb3RawName('..\\..\\windows\\x', Buffer.from('pwn'), [
      { name: 'project.json', data: Buffer.from(JSON.stringify(validProject())) },
    ]);
    expect(await codeOf(sb3)).toBe('UNSAFE_ENTRY_NAME');
  });

  it('từ chối entry nằm trong thư mục con', async () => {
    const sb3 = await validSb3([{ name: 'sub/dir/file.png', data: Buffer.from('x') }]);
    expect(await codeOf(sb3)).toBe('UNSAFE_ENTRY_NAME');
  });

  it('từ chối entry trùng tên (thủ thuật giấu payload)', async () => {
    const sb3 = await makeSb3([
      { name: 'project.json', data: Buffer.from(JSON.stringify(validProject())) },
      { name: `${BACKDROP_ID}.svg`, data: BACKDROP },
      { name: `${BACKDROP_ID}.svg`, data: Buffer.from('payload') },
    ]);
    expect(await codeOf(sb3)).toBe('UNSAFE_ENTRY_NAME');
  });

  it('từ chối zip bomb có tỉ lệ nén cực cao', async () => {
    // 20MB số 0 -> nén xuống vài KB -> ratio vượt xa 100:1
    const bomb = Buffer.alloc(20 * 1024 * 1024, 0);
    const sb3 = await validSb3([{ name: 'bomb.png', data: bomb }]);
    expect(await codeOf(sb3)).toBe('COMPRESSION_BOMB');
  });

  it('từ chối zip có quá nhiều entry', async () => {
    const extra = Array.from({ length: LIMITS.MAX_ENTRIES + 10 }, (_, i) => ({
      name: `pad${i}.png`,
      data: Buffer.from(`${i}`),
    }));
    expect(await codeOf(validSb3(extra))).toBe('TOO_MANY_ENTRIES');
  });

  it('từ chối file vượt quá dung lượng cho phép', async () => {
    const big = Buffer.alloc(LIMITS.MAX_SB3_BYTES + 1, 0);
    big.set([0x50, 0x4b, 0x03, 0x04], 0);
    expect(await codeOf(big)).toBe('TOO_LARGE');
  });
});

describe('strip payload ẩn', () => {
  it('loại bỏ file không được project.json tham chiếu', async () => {
    const sb3 = await validSb3([
      { name: 'payload.js', data: Buffer.from('alert(1)') },
      { name: 'secret.png', data: Buffer.from('hidden') },
    ]);
    const r = await validateAndNormalize(sb3);

    const names = (await readSb3Zip(r.sb3)).map((e) => e.name);
    expect(names).not.toContain('payload.js');
    expect(names).not.toContain('secret.png');

    const w = r.warnings.find((x) => x.code === 'STRIPPED_FILES');
    expect(w?.message).toContain('2');
  });
});

describe('chặn extension', () => {
  it('từ chối custom extension URL (arbitrary code execution)', async () => {
    const p = validProject({ extensions: ['https://evil.example/extension.js'] });
    expect(await codeOf(validSb3([], p))).toBe('CUSTOM_EXTENSION_URL');
  });

  it('từ chối extensionURLs của TurboWarp', async () => {
    const p = validProject({ extensionURLs: { evil: 'https://evil.example/ext.js' } });
    expect(await codeOf(validSb3([], p))).toBe('CUSTOM_EXTENSION_URL');
  });

  it('từ chối extension gọi API bên thứ ba', async () => {
    for (const ext of ['text2speech', 'translate', 'videoSensing']) {
      const p = validProject({ extensions: [ext] });
      expect(await codeOf(validSb3([], p))).toBe('DISALLOWED_EXTENSION');
    }
  });

  it('cho phép pen và music', async () => {
    const p = validProject({ extensions: ['pen', 'music'] });
    const r = await validateAndNormalize(await validSb3([], p));
    expect(r.stats.targets).toBe(2);
  });
});

describe('toàn vẹn asset', () => {
  it('từ chối khi project.json trỏ tới asset không tồn tại', async () => {
    const p = validProject();
    p.targets![1].costumes![0].md5ext = 'deadbeefdeadbeefdeadbeefdeadbeef.svg';
    expect(await codeOf(validSb3([], p))).toBe('MISSING_ASSET');
  });

  it('từ chối loại asset không nằm trong whitelist', async () => {
    const p = validProject();
    p.targets![1].costumes![0].md5ext = 'evil.js';
    expect(await codeOf(validSb3([{ name: 'evil.js', data: Buffer.from('x') }], p))).toBe(
      'DISALLOWED_ASSET_TYPE'
    );
  });

  it('từ chối project.json hỏng', async () => {
    const sb3 = await makeSb3([{ name: 'project.json', data: Buffer.from('{not json') }]);
    expect(await codeOf(sb3)).toBe('PROJECT_JSON_INVALID');
  });

  it('từ chối zip không có project.json', async () => {
    const sb3 = await makeSb3([{ name: 'a.png', data: Buffer.from('x') }]);
    expect(await codeOf(sb3)).toBe('MISSING_PROJECT_JSON');
  });
});

describe('biến đám mây', () => {
  it('cảnh báo chứ không chặn', async () => {
    const p = validProject();
    p.targets![0].variables = { id1: ['☁ high score', 0, true] };
    const r = await validateAndNormalize(await validSb3([], p));
    const w = r.warnings.find((x) => x.code === 'CLOUD_VARIABLES');
    expect(w).toBeDefined();
    expect(w!.message).toContain('không hoạt động');
  });
});

describe('quét từ ngữ', () => {
  it('từ chối khi nội dung block chứa từ trong wordlist', async () => {
    const p = validProject();
    p.targets![1].blocks!.say = {
      opcode: 'looks_sayforsecs',
      inputs: { MESSAGE: [1, [10, 'do ngu qua']] },
      fields: {},
    };
    expect(await codeOf(validSb3([], p), { profanity: ['ngu'] })).toBe('PROFANITY');
  });

  it('không báo nhầm khi từ nằm bên trong từ khác', async () => {
    const p = validProject();
    p.targets![1].name = 'Nguyen';
    const r = await validateAndNormalize(await validSb3([], p), { profanity: ['ngu'] });
    expect(r.stats.targets).toBe(2);
  });

  /*
   * Hồi quy cho một ca có thật: một game Scratch tiếng Anh bị từ chối vì trong
   * nội dung có chuỗi `vl` đứng tách biệt. `vl` là viết tắt tiếng Việt, đem quét
   * hàng nghìn chuỗi tiếng Anh thì nó chỉ còn là hai chữ cái.
   *
   * Hai phép kiểm dưới đây khẳng định RANH GIỚI CHỈ CHẶN được chữ và số — dấu câu
   * vẫn tính là ranh giới hợp lệ. Đây là hành vi đúng của hàm so khớp, nên cách
   * chữa không nằm ở đây mà ở phía gọi: đừng đưa token quá ngắn vào danh sách
   * quét nội dung (xem apps/web/src/lib/profanity.ts).
   */
  it('token ngắn vẫn khớp khi đứng cạnh dấu câu — lý do phải tách wordlist theo bề mặt quét', async () => {
    const p = validProject();
    p.targets![1].blocks!.say = {
      opcode: 'looks_sayforsecs',
      inputs: { MESSAGE: [1, [10, 'level (vl) cleared!']] },
      fields: {},
    };
    expect(await codeOf(validSb3([], p), { profanity: ['vl'] })).toBe('PROFANITY');
  });

  it('cùng nội dung đó KHÔNG bị chặn khi wordlist không chứa token ngắn', async () => {
    const p = validProject();
    p.targets![1].blocks!.say = {
      opcode: 'looks_sayforsecs',
      inputs: { MESSAGE: [1, [10, 'level (vl) cleared!']] },
      fields: {},
    };
    const r = await validateAndNormalize(await validSb3([], p), {
      profanity: ['fuck', 'lồn'],
    });
    expect(r.stats.targets).toBe(2);
  });

  /*
   * Hồi quy cho một lỗ THẬT, tìm ra bằng lượt soi code ngày 28/8/2026.
   *
   * Bản trước dùng đúng MỘT `indexOf` cho mỗi từ: gặp lần đầu mà lần đó nằm bên
   * trong một từ khác thì bỏ qua luôn cả từ ấy, những lần xuất hiện sau không bao
   * giờ được xét. Nghĩa là chỉ cần một từ vô hại chứa chuỗi đó đứng TRƯỚC là vô
   * hiệu hoá cả bộ lọc cho từ ấy trên toàn bộ chuỗi.
   *
   * Ba phép kiểm dưới đây khoá cả hai chiều: phải chặn khi có lần xuất hiện đứng
   * riêng ở PHÍA SAU, và vẫn không được báo nhầm khi mọi lần xuất hiện đều nằm
   * trong từ khác.
   */
  it('CHẶN khi từ xấu đứng riêng ở phía sau một từ vô hại chứa nó', async () => {
    const p = validProject();
    p.targets![1].blocks!.say = {
      opcode: 'looks_sayforsecs',
      inputs: { MESSAGE: [1, [10, 'Nguyen oi ngu qua']] },
      fields: {},
    };
    expect(await codeOf(validSb3([], p), { profanity: ['ngu'] })).toBe('PROFANITY');
  });

  it('CHẶN khi từ xấu xuất hiện nhiều lần, chỉ lần cuối đứng riêng', async () => {
    const p = validProject();
    p.targets![1].blocks!.say = {
      opcode: 'looks_sayforsecs',
      inputs: { MESSAGE: [1, [10, 'Nguyen Ngutha ngu']] },
      fields: {},
    };
    expect(await codeOf(validSb3([], p), { profanity: ['ngu'] })).toBe('PROFANITY');
  });

  it('KHÔNG báo nhầm khi MỌI lần xuất hiện đều nằm trong từ khác', async () => {
    const p = validProject();
    p.targets![1].blocks!.say = {
      opcode: 'looks_sayforsecs',
      inputs: { MESSAGE: [1, [10, 'Nguyen va Ngutha di Nguyenland']] },
      fields: {},
    };
    const r = await validateAndNormalize(await validSb3([], p), { profanity: ['ngu'] });
    expect(r.stats.targets).toBe(2);
  });
});
