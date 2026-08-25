import type { ProjectJson } from './validate.js';

/**
 * Phím mà một project Scratch thật sự dùng, dò từ project.json.
 *
 * Mục đích: chỉ hiện đúng những nút cảm ứng mà game cần. Một game chỉ dùng phím
 * cách thì không nên bày ra cả bàn phím mũi tên — với trẻ em, nút thừa là nhiễu.
 */

/** Tên phím trong project.json (`KEY_OPTION`) -> giá trị `KeyboardEvent.key`. */
const SCRATCH_TO_DOM: Record<string, string> = {
  space: ' ',
  'up arrow': 'ArrowUp',
  'down arrow': 'ArrowDown',
  'right arrow': 'ArrowRight',
  'left arrow': 'ArrowLeft',
  enter: 'Enter',
};

/** Nhãn hiển thị trên nút. Mũi tên vẽ bằng ký tự, không cần ảnh. */
const DOM_TO_LABEL: Record<string, string> = {
  ' ': 'Nhảy',
  ArrowUp: '▲',
  ArrowDown: '▼',
  ArrowLeft: '◀',
  ArrowRight: '▶',
  Enter: '⏎',
};

export interface TouchKey {
  /** Giá trị truyền vào vm.postIOData('keyboard', { key }) */
  key: string;
  label: string;
  /** Xếp vào cụm nào trên màn hình. */
  group: 'dpad-up' | 'dpad-down' | 'dpad-left' | 'dpad-right' | 'action';
}

function toTouchKey(domKey: string): TouchKey | null {
  switch (domKey) {
    case 'ArrowUp':
      return { key: domKey, label: DOM_TO_LABEL[domKey], group: 'dpad-up' };
    case 'ArrowDown':
      return { key: domKey, label: DOM_TO_LABEL[domKey], group: 'dpad-down' };
    case 'ArrowLeft':
      return { key: domKey, label: DOM_TO_LABEL[domKey], group: 'dpad-left' };
    case 'ArrowRight':
      return { key: domKey, label: DOM_TO_LABEL[domKey], group: 'dpad-right' };
    case ' ':
    case 'Enter':
      return { key: domKey, label: DOM_TO_LABEL[domKey], group: 'action' };
    default:
      // Chữ cái và chữ số: hiện chính nó làm nhãn.
      if (/^[a-z0-9]$/.test(domKey)) {
        return { key: domKey, label: domKey.toUpperCase(), group: 'action' };
      }
      return null;
  }
}

/**
 * Dò các phím được dùng trong project.
 *
 * Hai chỗ khai báo phím trong Scratch 3:
 *  - `event_whenkeypressed`: fields.KEY_OPTION
 *  - `sensing_keypressed`: input KEY_OPTION trỏ tới shadow `sensing_keyoptions`,
 *    mà shadow đó là một block riêng trong cùng `blocks` -> duyệt hết mọi block
 *    và đọc fields.KEY_OPTION là bắt được cả hai, không cần lần theo input.
 *
 * "any" bị bỏ qua: game bắt phím bất kỳ thì nút nào cũng chạy, không cần bày nút.
 */
export function detectTouchKeys(project: ProjectJson): TouchKey[] {
  const domKeys = new Set<string>();

  for (const target of project.targets ?? []) {
    for (const block of Object.values(target.blocks ?? {})) {
      if (!block || typeof block !== 'object') continue;
      const fields = (block as { fields?: Record<string, unknown> }).fields;
      const option = fields?.KEY_OPTION;
      if (!Array.isArray(option) || typeof option[0] !== 'string') continue;

      const raw = option[0].toLowerCase();
      if (raw === 'any') continue;

      const dom = SCRATCH_TO_DOM[raw] ?? (/^[a-z0-9]$/.test(raw) ? raw : null);
      if (dom) domKeys.add(dom);
    }
  }

  const keys: TouchKey[] = [];
  for (const dom of domKeys) {
    const touch = toTouchKey(dom);
    if (touch) keys.push(touch);
  }

  // Thứ tự ổn định để output đóng gói tất định (cùng input -> cùng sha256).
  const order = ['dpad-up', 'dpad-down', 'dpad-left', 'dpad-right', 'action'];
  keys.sort(
    (a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.key.localeCompare(b.key)
  );

  // Quá nhiều nút thì màn hình điện thoại không còn chỗ chơi. Giữ D-pad, cắt bớt
  // nút hành động.
  const dpad = keys.filter((k) => k.group !== 'action');
  const actions = keys.filter((k) => k.group === 'action').slice(0, 3);
  return [...dpad, ...actions];
}
