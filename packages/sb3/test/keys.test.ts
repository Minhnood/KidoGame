import { describe, it, expect } from 'vitest';
import { detectTouchKeys } from '../src/keys.js';
import { buildTouchControls } from '../src/touch-controls.js';
import { validProject } from './fixtures.js';
import type { ProjectJson } from '../src/validate.js';

/** Gắn thêm block vào sprite của project mẫu. */
function withBlocks(blocks: Record<string, unknown>): ProjectJson {
  const p = validProject();
  p.targets![1].blocks = { ...p.targets![1].blocks, ...blocks };
  return p;
}

const whenKey = (id: string, key: string) => ({
  [id]: { opcode: 'event_whenkeypressed', fields: { KEY_OPTION: [key, null] }, inputs: {}, topLevel: true },
});

const sensingKey = (id: string, key: string) => ({
  [id]: { opcode: 'sensing_keyoptions', fields: { KEY_OPTION: [key, null] }, inputs: {}, shadow: true },
});

describe('dò phím game dùng', () => {
  it('không có phím nào thì không sinh nút', () => {
    expect(detectTouchKeys(validProject())).toEqual([]);
  });

  it('bắt được phím từ khối "khi bấm phím"', () => {
    const keys = detectTouchKeys(withBlocks(whenKey('a', 'space')));
    expect(keys.map((k) => k.key)).toEqual([' ']);
    expect(keys[0].group).toBe('action');
  });

  it('bắt được phím từ khối "phím ... đang bấm?"', () => {
    // Shadow block của sensing_keypressed nằm ngay trong `blocks`, nên duyệt
    // fields là bắt được, không cần lần theo input.
    const keys = detectTouchKeys(withBlocks(sensingKey('b', 'left arrow')));
    expect(keys.map((k) => k.key)).toEqual(['ArrowLeft']);
  });

  it('map đúng bốn phím mũi tên vào D-pad', () => {
    const keys = detectTouchKeys(
      withBlocks({
        ...whenKey('u', 'up arrow'),
        ...whenKey('d', 'down arrow'),
        ...whenKey('l', 'left arrow'),
        ...whenKey('r', 'right arrow'),
      })
    );
    expect(keys.map((k) => k.group)).toEqual([
      'dpad-up',
      'dpad-down',
      'dpad-left',
      'dpad-right',
    ]);
    expect(keys.map((k) => k.key)).toEqual(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  });

  it('bỏ qua "any" — game bắt phím bất kỳ thì không cần bày nút', () => {
    expect(detectTouchKeys(withBlocks(whenKey('a', 'any')))).toEqual([]);
  });

  it('nhận chữ cái và chữ số, nhãn viết hoa', () => {
    const keys = detectTouchKeys(withBlocks({ ...whenKey('a', 'w'), ...whenKey('b', '1') }));
    expect(keys.map((k) => k.key).sort()).toEqual(['1', 'w']);
    expect(keys.find((k) => k.key === 'w')?.label).toBe('W');
  });

  it('không trùng lặp khi cùng một phím dùng ở nhiều khối', () => {
    const keys = detectTouchKeys(
      withBlocks({ ...whenKey('a', 'space'), ...whenKey('b', 'space'), ...sensingKey('c', 'space') })
    );
    expect(keys).toHaveLength(1);
  });

  it('thứ tự tất định — cùng input cho ra cùng kết quả', () => {
    const p = withBlocks({
      ...whenKey('r', 'right arrow'),
      ...whenKey('a', 'z'),
      ...whenKey('u', 'up arrow'),
    });
    expect(JSON.stringify(detectTouchKeys(p))).toBe(JSON.stringify(detectTouchKeys(p)));
  });

  it('cắt bớt nút hành động khi game dùng quá nhiều phím', () => {
    const many: Record<string, unknown> = {};
    'abcdefgh'.split('').forEach((c, i) => Object.assign(many, whenKey(`k${i}`, c)));
    const keys = detectTouchKeys(withBlocks(many));
    expect(keys.filter((k) => k.group === 'action')).toHaveLength(3);
  });
});

describe('sinh mã nút cảm ứng', () => {
  it('không có phím thì không sinh mã nào', () => {
    expect(buildTouchControls([])).toEqual({ css: '', js: '' });
  });

  it('mã sinh ra dùng postIOData chứ không giả lập sự kiện bàn phím', () => {
    const { js } = buildTouchControls(detectTouchKeys(withBlocks(whenKey('a', 'space'))));
    expect(js).toContain("vm.postIOData('keyboard'");
    expect(js).not.toContain('new KeyboardEvent');
  });

  it('có nhả hết phím khi mất focus, tránh kẹt phím', () => {
    const { js } = buildTouchControls(detectTouchKeys(withBlocks(whenKey('a', 'up arrow'))));
    expect(js).toContain('releaseAll');
    expect(js).toContain("addEventListener('blur'");
    expect(js).toContain('visibilitychange');
  });

  it('chỉ hiện trên thiết bị cảm ứng', () => {
    const { css } = buildTouchControls(detectTouchKeys(withBlocks(whenKey('a', 'space'))));
    expect(css).toContain('pointer: coarse');
  });

  it('ẩn nút khi màn hình cờ xanh còn hiện, tránh che nút khởi động', () => {
    const { js } = buildTouchControls(detectTouchKeys(withBlocks(whenKey('a', 'up arrow'))));
    expect(js).toContain("getElementById('launch')");
    expect(js).toContain('MutationObserver');
    expect(js).toContain('syncVisibility');
  });

  it('mã sinh ra không chứa dấu đóng thẻ script', () => {
    // Nếu lọt `</script>` vào custom.js thì trang game vỡ.
    const { js, css } = buildTouchControls(
      detectTouchKeys(withBlocks({ ...whenKey('a', 'space'), ...whenKey('b', 'up arrow') }))
    );
    expect(js.toLowerCase()).not.toContain('</script');
    expect(css.toLowerCase()).not.toContain('</script');
  });
});
